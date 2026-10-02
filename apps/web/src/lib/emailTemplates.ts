import { createTranslator } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { defaultLocale, locales, type Locale } from '@/i18n/routing';
import type { NotificationMeta, NotificationType } from '@/types';

/**
 * Email 通知模板。**server-only 概念**（由 lib/email.ts → notify() 觸發），但本檔
 * 為純資料轉換（載入 i18n catalog + 字串組裝），可單元測試。
 *
 * 設計重點：
 * - 站內通知靠**前端**依檢視者語系即時渲染；Email 由**伺服端**寄出，故須在這裡用
 *   收件者的 `locale` 以 next-intl `createTranslator` 算出對應語系文案（i18n `email`
 *   命名空間），後端不存預先算好的字串（比照站內通知）。
 * - 連結用絕對 URL（`appUrl` + 路徑）才能在信件中點擊；未設定 appUrl 時退回相對路徑。
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

type EmailTranslator = (key: string, values?: Record<string, string | number>) => string;

interface BuildEmailInput {
  type: NotificationType;
  locale: string;
  /** 觸發者顯示名（事件當下快照）。 */
  actorName: string;
  /**
   * 旅程的公開 `hashCode`（**非** ObjectId）——信中連結一律用它，未登入收件者點進去時
   * 才能走 `/api/public/*` 分享路由（hash_code only；ObjectId 會被拒）的 fallback。
   */
  tripHashCode: string;
  tripName: string;
  meta?: NotificationMeta;
  /** 對外站台基底 URL（結尾無斜線）；null 時連結退回相對路徑。 */
  appUrl: string | null;
}

/** 將任意字串收斂為支援的 Locale，否則退回預設語系。 */
function normalizeLocale(input: string): Locale {
  return (locales as readonly string[]).includes(input) ? (input as Locale) : defaultLocale;
}

/** 依語系載入訊息 catalog（與 i18n/config.ts 相同的動態 import 規則）。 */
async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  return (await import(`@/i18n/messages/${locale}.json`)).default;
}

/** path → 絕對 URL（有 appUrl）或原樣相對路徑（無 appUrl）。 */
function toAbsoluteUrl(appUrl: string | null, path: string): string {
  return appUrl ? `${appUrl}${path}` : path;
}

/** 各通知類型對應要導向的頁面路徑（`linkId` 為旅程公開 hashCode，見 BuildEmailInput）。 */
function linkPathFor(type: NotificationType, linkId: string): string {
  // 好友通知不屬於旅程，導向設定頁的好友卡片。
  if (type === 'friend_request' || type === 'friend_accepted') return ROUTES.SETTINGS_FRIENDS;
  // 還款導向結算頁、支出導向支出分頁，其餘導向旅程落點（比照站內通知鈴鐺的導向）。
  if (type === 'payment_recorded') return ROUTES.TRIP_SETTLEMENT(linkId);
  if (type === 'expense_added' || type === 'expense_comment_added')
    return ROUTES.TRIP_EXPENSES(linkId);
  return ROUTES.TRIP_DETAIL(linkId);
}

/** 極簡 HTML escape（模板只插入少量使用者字串）。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTwd(amount: number, locale: Locale): string {
  const numberLocale = locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale;
  return `NT$${new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 0,
  }).format(Math.round(amount))}`;
}

function brandedSubject(t: EmailTranslator, subject: string): string {
  return `${t('brandSubjectPrefix')} ${subject}`;
}

function detailRow(label: string, value: string, emphasize = false): string {
  return `<tr>
    <td style="padding: 7px 12px 7px 0; color: #64748b; font-size: 13px; line-height: 1.5; white-space: nowrap; vertical-align: top;">${escapeHtml(
      label
    )}</td>
    <td style="padding: 7px 0; color: ${emphasize ? '#0f766e' : '#0f172a'}; font-size: ${
      emphasize ? '18px' : '14px'
    }; font-weight: ${emphasize ? '700' : '600'}; line-height: 1.5; text-align: right; word-break: break-word;">${escapeHtml(
      value
    )}</td>
  </tr>`;
}

function actionBlock(t: EmailTranslator, url: string, buttonLabel = t('viewButton')): string {
  const safeUrl = escapeHtml(url);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0 0;">
    <tr>
      <td align="center">
        <a href="${safeUrl}" style="display: inline-block; background: #0f766e; border-radius: 10px; color: #ffffff; font-size: 15px; font-weight: 700; line-height: 1; padding: 14px 24px; text-decoration: none;">${escapeHtml(
          buttonLabel
        )}</a>
      </td>
    </tr>
  </table>
  <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin: 18px 0 0; text-align: center;">
    ${escapeHtml(t('linkFallback'))}<br />
    <a href="${safeUrl}" style="color: #0f766e; overflow-wrap: anywhere; text-decoration: underline;">${safeUrl}</a>
  </p>`;
}

interface EmailShellInput {
  locale: Locale;
  t: EmailTranslator;
  preheader: string;
  contentHtml: string;
  footer: string;
  footerLink?: string;
  settingsUrl?: string;
  securityNote?: string;
}

/**
 * 為一則通知產生 Email 內容（subject + html + text），依收件者語系本地化。
 */
export async function buildNotificationEmail(input: BuildEmailInput): Promise<EmailContent> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  // 動態 key（`${type}.subject`）用法，next-intl 的嚴格 key 型別無法靜態驗證，
  // 故給予寬鬆的呼叫簽章（key 以 type 列舉組出，runtime 必有對應字串）。
  const t = createTranslator({
    locale,
    messages,
    namespace: 'email',
  }) as unknown as EmailTranslator;

  const { type, actorName, tripHashCode, tripName, meta = {}, appUrl } = input;
  const url = toAbsoluteUrl(appUrl, linkPathFor(type, tripHashCode));
  const settingsUrl = toAbsoluteUrl(appUrl, ROUTES.SETTINGS);

  const vars = {
    actor: actorName,
    tripName,
    description: meta.description ?? '',
    amount: typeof meta.amount === 'number' ? meta.amount : 0,
  };

  // subject / body 每個 type 各有對應 key（email.<type>.subject / .body）。
  const subject = brandedSubject(t, t(`${type}.subject`, vars));
  const body = t(`${type}.body`, vars);
  const amount = typeof meta.amount === 'number' ? formatTwd(meta.amount, locale) : undefined;
  const details = [
    tripName ? detailRow(t('labels.trip'), tripName) : '',
    actorName ? detailRow(t('labels.actor'), actorName) : '',
    meta.description ? detailRow(t('labels.expense'), meta.description) : '',
    meta.comment_body ? detailRow(t('labels.comment'), meta.comment_body) : '',
    amount ? detailRow(t('labels.amount'), amount, true) : '',
  ].join('');

  const textDetails = [
    tripName ? `${t('labels.trip')}: ${tripName}` : '',
    actorName ? `${t('labels.actor')}: ${actorName}` : '',
    meta.description ? `${t('labels.expense')}: ${meta.description}` : '',
    meta.comment_body ? `${t('labels.comment')}: ${meta.comment_body}` : '',
    amount ? `${t('labels.amount')}: ${amount}` : '',
  ].filter(Boolean);
  const text = [
    t('brandName'),
    '',
    body,
    '',
    ...textDetails,
    '',
    `${t('viewButton')}: ${url}`,
    '',
    t('securityNotice'),
    '',
    t('footer'),
  ].join('\n');

  const html = wrapEmailHtml({
    locale,
    t,
    preheader: body,
    contentHtml: `<p style="color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .08em; margin: 0 0 10px; text-transform: uppercase;">${escapeHtml(
      t('activityLabel')
    )}</p>
      <h1 style="color: #0f172a; font-size: 24px; line-height: 1.35; margin: 0 0 12px;">${escapeHtml(
        t(`${type}.heading`, vars)
      )}</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${escapeHtml(
        body
      )}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 16px;">
        ${details}
      </table>
      ${actionBlock(t, url)}`,
    footer: t('footer'),
    footerLink: t('footerLink'),
    settingsUrl,
    securityNote: t('securityNotice'),
  });

  return { subject, html, text };
}

/**
 * 共用的 Email HTML 外殼（內容 + footer）。footerLink/settingsUrl 省略時只渲染
 * footer 文字（transactional 信件如重設密碼無「通知設定」語境）。
 */
function wrapEmailHtml({
  locale,
  t,
  preheader,
  contentHtml,
  footer,
  footerLink,
  settingsUrl,
  securityNote,
}: EmailShellInput): string {
  const htmlLang = locale === 'jp' ? 'ja' : locale;
  const linkHtml =
    footerLink && settingsUrl
      ? `<a href="${escapeHtml(
          settingsUrl
        )}" style="color: #64748b; text-decoration: underline;">${escapeHtml(footerLink)}</a>`
      : '';
  return `<!DOCTYPE html>
<html lang="${escapeHtml(htmlLang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(t('brandName'))}</title>
  </head>
  <body style="background: #f1f5f9; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0;">
    <div style="display: none; max-height: 0; opacity: 0; overflow: hidden;">${escapeHtml(
      preheader
    )}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f1f5f9;">
      <tr>
        <td align="center" style="padding: 28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px;">
            <tr>
              <td style="background: #0f172a; border-radius: 16px 16px 0 0; padding: 20px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background: #14b8a6; border-radius: 10px; color: #ffffff; font-size: 15px; font-weight: 800; height: 36px; text-align: center; width: 36px;">TB</td>
                    <td style="color: #ffffff; font-size: 17px; font-weight: 700; padding-left: 12px;">${escapeHtml(
                      t('brandName')
                    )}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background: #ffffff; padding: 32px 28px;">${contentHtml}</td>
            </tr>
            ${
              securityNote
                ? `<tr>
              <td style="background: #ecfeff; border-top: 1px solid #ccfbf1; color: #155e75; font-size: 12px; line-height: 1.65; padding: 16px 28px;">
                <strong>${escapeHtml(t('securityLabel'))}</strong> ${escapeHtml(securityNote)}
              </td>
            </tr>`
                : ''
            }
            <tr>
              <td style="background: #f8fafc; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; line-height: 1.7; padding: 20px 28px; text-align: center;">
                ${escapeHtml(footer)}${linkHtml ? `<br />${linkHtml}` : ''}
                <br />${escapeHtml(t('automatedMessage'))}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface BuildPasswordResetInput {
  locale: string;
  /** 6 位數驗證碼（明碼，只在此封信中出現）。 */
  code: string;
  /** 驗證碼有效分鐘數（顯示於信中）。 */
  expiresMinutes: number;
}

/**
 * 產生「重設密碼驗證碼」Email（transactional：不受 notifyByEmail 開關影響，一律寄）。
 * 依收件者語系本地化；信中不含任何連結，只給驗證碼與有效時間。
 */
export async function buildPasswordResetEmail(
  input: BuildPasswordResetInput
): Promise<EmailContent> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  const t = createTranslator({
    locale,
    messages,
    namespace: 'email',
  }) as unknown as EmailTranslator;

  const subject = brandedSubject(t, t('passwordReset.subject'));
  const intro = t('passwordReset.intro');
  const expiry = t('passwordReset.expiry', { minutes: input.expiresMinutes });
  const ignore = t('passwordReset.ignore');

  const footer = t('passwordReset.footer');
  const text = [intro, '', input.code, '', expiry, '', ignore, '', footer].join('\n');

  const html = wrapEmailHtml({
    locale,
    t,
    preheader: intro,
    contentHtml: `<p style="color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .08em; margin: 0 0 10px; text-transform: uppercase;">${escapeHtml(
      t('accountSecurityLabel')
    )}</p>
      <h1 style="color: #0f172a; font-size: 24px; line-height: 1.35; margin: 0 0 12px;">${escapeHtml(
        t('passwordReset.heading')
      )}</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${escapeHtml(
        intro
      )}</p>
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; color: #0f172a; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 20px 10px; text-align: center;">${escapeHtml(
        input.code
      )}</div>
      <p style="color: #0f766e; font-size: 13px; font-weight: 600; line-height: 1.6; margin: 12px 0 20px; text-align: center;">${escapeHtml(
        expiry
      )}</p>
      <p style="background: #fff7ed; border-left: 3px solid #fb923c; color: #9a3412; font-size: 13px; line-height: 1.65; margin: 0; padding: 12px 14px;">${escapeHtml(
        ignore
      )}</p>`,
    footer,
    securityNote: t('verificationSecurityNotice'),
  });

  return { subject, html, text };
}

interface BuildEmailChangeInput {
  locale: string;
  /** 6 位數驗證碼（明碼，只在此封信中出現）。 */
  code: string;
  /** 驗證碼有效分鐘數（顯示於信中）。 */
  expiresMinutes: number;
}

/**
 * 產生「變更 Email 驗證碼」Email（transactional：一律寄，寄往使用者填入的「新信箱」）。
 * 依收件者語系本地化；信中不含任何連結，只給驗證碼與有效時間。
 */
export async function buildEmailChangeEmail(input: BuildEmailChangeInput): Promise<EmailContent> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  const t = createTranslator({
    locale,
    messages,
    namespace: 'email',
  }) as unknown as EmailTranslator;

  const subject = brandedSubject(t, t('emailChange.subject'));
  const intro = t('emailChange.intro');
  const expiry = t('emailChange.expiry', { minutes: input.expiresMinutes });
  const ignore = t('emailChange.ignore');

  const footer = t('emailChange.footer');
  const text = [intro, '', input.code, '', expiry, '', ignore, '', footer].join('\n');

  const html = wrapEmailHtml({
    locale,
    t,
    preheader: intro,
    contentHtml: `<p style="color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .08em; margin: 0 0 10px; text-transform: uppercase;">${escapeHtml(
      t('accountSecurityLabel')
    )}</p>
      <h1 style="color: #0f172a; font-size: 24px; line-height: 1.35; margin: 0 0 12px;">${escapeHtml(
        t('emailChange.heading')
      )}</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${escapeHtml(
        intro
      )}</p>
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; color: #0f172a; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 20px 10px; text-align: center;">${escapeHtml(
        input.code
      )}</div>
      <p style="color: #0f766e; font-size: 13px; font-weight: 600; line-height: 1.6; margin: 12px 0 20px; text-align: center;">${escapeHtml(
        expiry
      )}</p>
      <p style="background: #fff7ed; border-left: 3px solid #fb923c; color: #9a3412; font-size: 13px; line-height: 1.65; margin: 0; padding: 12px 14px;">${escapeHtml(
        ignore
      )}</p>`,
    footer,
    securityNote: t('verificationSecurityNotice'),
  });

  return { subject, html, text };
}

interface BuildPaymentReminderInput {
  locale: string;
  appUrl: string | null;
  /** 發出提醒的人（債權人）的顯示名。 */
  actorName: string;
  /** 旅程公開 hashCode（連結用，見 BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  /** 待還款金額（TWD，取整顯示）。 */
  amount: number;
}

/**
 * 產生「請對方還款」提醒 Email（由結算頁的「提醒還款」按鈕觸發，債權人 → 債務人，
 * 一對一即時寄出，非彙整、非排程）。依收件者語系本地化，連到該旅程的結算頁。
 */
export async function buildPaymentReminderEmail(
  input: BuildPaymentReminderInput
): Promise<EmailContent> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  const t = createTranslator({
    locale,
    messages,
    namespace: 'email',
  }) as unknown as EmailTranslator;

  const url = toAbsoluteUrl(input.appUrl, ROUTES.TRIP_SETTLEMENT(input.tripHashCode));
  const settingsUrl = toAbsoluteUrl(input.appUrl, ROUTES.SETTINGS);
  const vars = {
    actor: input.actorName,
    tripName: input.tripName,
    amount: Math.round(input.amount),
  };

  const subject = brandedSubject(t, t('paymentReminder.subject', vars));
  const body = t('paymentReminder.body', vars);
  const amount = formatTwd(input.amount, locale);

  const text = [
    t('brandName'),
    '',
    body,
    '',
    `${t('labels.trip')}: ${input.tripName}`,
    `${t('labels.actor')}: ${input.actorName}`,
    `${t('labels.balance')}: ${amount}`,
    '',
    `${t('viewButton')}: ${url}`,
    '',
    t('paymentSecurityNotice'),
    '',
    t('footer'),
  ].join('\n');

  const html = wrapEmailHtml({
    locale,
    t,
    preheader: body,
    contentHtml: `<p style="color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .08em; margin: 0 0 10px; text-transform: uppercase;">${escapeHtml(
      t('settlementLabel')
    )}</p>
      <h1 style="color: #0f172a; font-size: 24px; line-height: 1.35; margin: 0 0 12px;">${escapeHtml(
        t('paymentReminder.heading')
      )}</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${escapeHtml(
        body
      )}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 16px;">
        ${detailRow(t('labels.trip'), input.tripName)}
        ${detailRow(t('labels.from'), input.actorName)}
        ${detailRow(t('labels.balance'), amount, true)}
      </table>
      ${actionBlock(t, url, t('viewSettlementButton'))}`,
    footer: t('footer'),
    footerLink: t('footerLink'),
    settingsUrl,
    securityNote: t('paymentSecurityNotice'),
  });

  return { subject, html, text };
}

/** 每日支出摘要 Email 的單筆旅程（含當日新支出清單）。 */
export interface DigestTripLine {
  /** 旅程公開 hashCode（連結用，見 BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  expenses: { description: string; amount: number; payerName: string }[];
}

interface BuildDigestInput {
  locale: string;
  appUrl: string | null;
  /** 該收件者當日有新支出的旅程（至少一筆，且都已排除其本人新增的）。 */
  trips: DigestTripLine[];
}

/**
 * 產生「今日支出摘要」彙整 Email（一位使用者一封，按旅程分組列出當日新支出）。
 * 依收件者語系本地化；每個旅程標題連到該旅程詳情頁。
 */
export async function buildExpenseDigestEmail(input: BuildDigestInput): Promise<EmailContent> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  const t = createTranslator({
    locale,
    messages,
    namespace: 'email',
  }) as unknown as EmailTranslator;

  const settingsUrl = toAbsoluteUrl(input.appUrl, ROUTES.SETTINGS);
  const subject = brandedSubject(t, t('expenseDigest.subject'));
  const intro = t('expenseDigest.intro');

  // 純文字版：每旅程一段 + 其下各支出一行
  const textParts: string[] = [intro, ''];
  for (const tr of input.trips) {
    const url = toAbsoluteUrl(input.appUrl, ROUTES.TRIP_EXPENSES(tr.tripHashCode));
    textParts.push(`${tr.tripName}　${url}`);
    for (const e of tr.expenses) {
      textParts.push(`  • ${e.description} — ${formatTwd(e.amount, locale)}（${e.payerName}）`);
    }
    textParts.push('');
  }
  textParts.push(t('footer'));
  const text = textParts.join('\n');

  // HTML 版：每旅程一個標題（連結）+ 其下支出清單
  const sectionsHtml = input.trips
    .map((tr) => {
      const url = toAbsoluteUrl(input.appUrl, ROUTES.TRIP_EXPENSES(tr.tripHashCode));
      const items = tr.expenses
        .map(
          (e) => `<li style="margin: 0 0 6px; line-height: 1.5;">
          ${escapeHtml(e.description)}
          <span style="color: #64748b;"> — ${escapeHtml(
            formatTwd(e.amount, locale)
          )}（${escapeHtml(e.payerName)}）</span>
        </li>`
        )
        .join('\n');
      return `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 0 0 14px; padding: 16px;">
        <a href="${escapeHtml(
          url
        )}" style="color: #0f766e; font-size: 16px; font-weight: 700; text-decoration: none;">${escapeHtml(
          tr.tripName
        )} →</a>
        <ul style="color: #0f172a; font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 10px 0 0;">${items}</ul>
      </div>`;
    })
    .join('\n');

  const html = wrapEmailHtml({
    locale,
    t,
    preheader: intro,
    contentHtml: `<p style="color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .08em; margin: 0 0 10px; text-transform: uppercase;">${escapeHtml(
      t('digestLabel')
    )}</p>
      <h1 style="color: #0f172a; font-size: 24px; line-height: 1.35; margin: 0 0 12px;">${escapeHtml(
        t('expenseDigest.heading')
      )}</h1>
      <p style="color: #475569; font-size: 15px; line-height: 1.7; margin: 0 0 20px;">${escapeHtml(
        intro
      )}</p>
      ${sectionsHtml}`,
    footer: t('footer'),
    footerLink: t('footerLink'),
    settingsUrl,
    securityNote: t('securityNotice'),
  });

  return { subject, html, text };
}
