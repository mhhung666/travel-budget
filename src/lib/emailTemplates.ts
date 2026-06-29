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
  // 還款相關導向結算頁，其餘導向旅程詳情頁（比照站內通知鈴鐺的導向）。
  return type === 'payment_recorded' ? ROUTES.TRIP_SETTLEMENT(linkId) : ROUTES.TRIP_DETAIL(linkId);
}

/** 極簡 HTML escape（模板只插入少量使用者字串）。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 為一則通知產生 Email 內容（subject + html + text），依收件者語系本地化。
 */
export async function buildNotificationEmail(input: BuildEmailInput): Promise<EmailContent> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  // 動態 key（`${type}.subject`）用法，next-intl 的嚴格 key 型別無法靜態驗證，
  // 故給予寬鬆的呼叫簽章（key 以 type 列舉組出，runtime 必有對應字串）。
  const t = createTranslator({ locale, messages, namespace: 'email' }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

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
  const subject = t(`${type}.subject`, vars);
  const body = t(`${type}.body`, vars);

  const text = [body, '', `${t('viewButton')}: ${url}`, '', t('footer')].join('\n');

  const html = wrapEmailHtml(
    `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">${escapeHtml(body)}</p>
    <p style="margin: 0 0 32px;">
      <a href="${url}" style="display: inline-block; background: #0f172a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px;">${escapeHtml(
        t('viewButton')
      )}</a>
    </p>`,
    t('footer'),
    t('footerLink'),
    settingsUrl
  );

  return { subject, html, text };
}

/**
 * 共用的 Email HTML 外殼（內容 + footer）。footerLink/settingsUrl 省略時只渲染
 * footer 文字（transactional 信件如重設密碼無「通知設定」語境）。
 */
function wrapEmailHtml(
  contentHtml: string,
  footer: string,
  footerLink?: string,
  settingsUrl?: string
): string {
  const linkHtml =
    footerLink && settingsUrl
      ? ` <a href="${settingsUrl}" style="color: #6b7280;">${escapeHtml(footerLink)}</a>`
      : '';
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    ${contentHtml}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 16px;" />
    <p style="font-size: 12px; color: #6b7280; line-height: 1.5; margin: 0;">
      ${escapeHtml(footer)}${linkHtml}
    </p>
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
  const t = createTranslator({ locale, messages, namespace: 'email' }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  const subject = t('passwordReset.subject');
  const intro = t('passwordReset.intro');
  const expiry = t('passwordReset.expiry', { minutes: input.expiresMinutes });
  const ignore = t('passwordReset.ignore');

  const footer = t('passwordReset.footer');
  const text = [intro, '', input.code, '', expiry, '', ignore, '', footer].join('\n');

  const html = wrapEmailHtml(
    `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(intro)}</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; margin: 0 0 16px; font-family: 'SFMono-Regular', Consolas, monospace;">${escapeHtml(
      input.code
    )}</p>
    <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 8px;">${escapeHtml(
      expiry
    )}</p>
    <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 32px;">${escapeHtml(
      ignore
    )}</p>`,
    footer
  );

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
  const t = createTranslator({ locale, messages, namespace: 'email' }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  const subject = t('emailChange.subject');
  const intro = t('emailChange.intro');
  const expiry = t('emailChange.expiry', { minutes: input.expiresMinutes });
  const ignore = t('emailChange.ignore');

  const footer = t('emailChange.footer');
  const text = [intro, '', input.code, '', expiry, '', ignore, '', footer].join('\n');

  const html = wrapEmailHtml(
    `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(intro)}</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; margin: 0 0 16px; font-family: 'SFMono-Regular', Consolas, monospace;">${escapeHtml(
      input.code
    )}</p>
    <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 8px;">${escapeHtml(
      expiry
    )}</p>
    <p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0 0 32px;">${escapeHtml(
      ignore
    )}</p>`,
    footer
  );

  return { subject, html, text };
}

/** 排程結算提醒 Email 的單筆未結清項目。 */
export interface ReminderTripLine {
  /** 旅程公開 hashCode（連結用，見 BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  /** 淨額（TWD）：>0 別人欠你、<0 你欠人。 */
  balance: number;
}

interface BuildReminderInput {
  locale: string;
  appUrl: string | null;
  /** 該收件者所有未結清的旅程（至少一筆）。 */
  trips: ReminderTripLine[];
}

/**
 * 產生「未結清結算提醒」的彙整 Email（一位使用者一封，列出其所有未結清旅程）。
 * 依收件者語系本地化；每筆旅程連到該旅程的結算頁。
 */
export async function buildSettlementReminderEmail(
  input: BuildReminderInput
): Promise<EmailContent> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'email' }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  const settingsUrl = toAbsoluteUrl(input.appUrl, ROUTES.SETTINGS);
  const subject = t('settlementReminder.subject');
  const intro = t('settlementReminder.intro');

  // 每筆旅程：金額（取整、絕對值）+ 應收/應付標籤 + 結算頁連結。
  const lines = input.trips.map((tr) => {
    const url = toAbsoluteUrl(input.appUrl, ROUTES.TRIP_SETTLEMENT(tr.tripHashCode));
    const amount = Math.round(Math.abs(tr.balance));
    const label = tr.balance < 0 ? t('settlementReminder.owe') : t('settlementReminder.owed');
    return { name: tr.tripName, url, amount, label };
  });

  const text = [
    intro,
    '',
    ...lines.map((l) => `• ${l.name} — ${l.label} NT$${l.amount}　${l.url}`),
    '',
    t('footer'),
  ].join('\n');

  const itemsHtml = lines
    .map(
      (l) => `<li style="margin: 0 0 10px; line-height: 1.5;">
        <a href="${l.url}" style="color: #0f172a; font-weight: 600; text-decoration: none;">${escapeHtml(
          l.name
        )}</a>
        <span style="color: #6b7280;"> — ${escapeHtml(l.label)} NT$${l.amount}</span>
      </li>`
    )
    .join('\n');

  const html = wrapEmailHtml(
    `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(intro)}</p>
    <ul style="font-size: 15px; padding-left: 20px; margin: 0 0 32px;">
      ${itemsHtml}
    </ul>`,
    t('footer'),
    t('footerLink'),
    settingsUrl
  );

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
  const t = createTranslator({ locale, messages, namespace: 'email' }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  const settingsUrl = toAbsoluteUrl(input.appUrl, ROUTES.SETTINGS);
  const subject = t('expenseDigest.subject');
  const intro = t('expenseDigest.intro');

  // 純文字版：每旅程一段 + 其下各支出一行
  const textParts: string[] = [intro, ''];
  for (const tr of input.trips) {
    const url = toAbsoluteUrl(input.appUrl, ROUTES.TRIP_DETAIL(tr.tripHashCode));
    textParts.push(`${tr.tripName}　${url}`);
    for (const e of tr.expenses) {
      textParts.push(`  • ${e.description} — NT$${Math.round(e.amount)}（${e.payerName}）`);
    }
    textParts.push('');
  }
  textParts.push(t('footer'));
  const text = textParts.join('\n');

  // HTML 版：每旅程一個標題（連結）+ 其下支出清單
  const sectionsHtml = input.trips
    .map((tr) => {
      const url = toAbsoluteUrl(input.appUrl, ROUTES.TRIP_DETAIL(tr.tripHashCode));
      const items = tr.expenses
        .map(
          (e) => `<li style="margin: 0 0 6px; line-height: 1.5;">
          ${escapeHtml(e.description)}
          <span style="color: #6b7280;"> — NT$${Math.round(e.amount)}（${escapeHtml(e.payerName)}）</span>
        </li>`
        )
        .join('\n');
      return `<div style="margin: 0 0 20px;">
        <a href="${url}" style="color: #0f172a; font-weight: 600; font-size: 16px; text-decoration: none;">${escapeHtml(
          tr.tripName
        )}</a>
        <ul style="font-size: 15px; padding-left: 20px; margin: 8px 0 0;">${items}</ul>
      </div>`;
    })
    .join('\n');

  const html = wrapEmailHtml(
    `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(intro)}</p>
    ${sectionsHtml}`,
    t('footer'),
    t('footerLink'),
    settingsUrl
  );

  return { subject, html, text };
}
