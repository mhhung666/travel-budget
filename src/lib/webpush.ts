import webpush from 'web-push';
import { createTranslator } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { defaultLocale, locales, type Locale } from '@/i18n/routing';
import { getEnv, getWebPushConfig } from './env';
import { logger } from './logger';
import { PushSubscription } from '@/models';
import type { NotificationMeta, NotificationType } from '@/types';

/**
 * Web Push 寄送封裝（ROADMAP #9 Phase 3）。**server-only**：持有 VAPID 私鑰，只可被
 * server actions / server-only 模組（lib/notify.ts）匯入。純函式 `buildPushPayload`
 * 例外（載 i18n catalog + 組字串），可單元測試。
 *
 * 設計重點（比照 lib/notify.ts / lib/email.ts / R2 清理）：
 * - **best-effort，永不 throw**：推播是次要副作用，任何失敗只記 log，絕不阻斷主 action。
 * - **env-gated**：未配置 VAPID（getWebPushConfig() 回 null）時靜默跳過，使推播成為純
 *   加值——未配置的環境（本機、CI）照常運作。
 * - **payload 在伺服端依收件者語系算好**：站內鈴鐺靠前端即時渲染，但推播由 SW 顯示、
 *   伺服端送出，故須在這裡用收件者 locale 以 next-intl `createTranslator` 算出文案
 *   （重用 `notifications` i18n 命名空間），後端不送預先算好的字串。
 * - **失效訂閱就地回收**：推播服務回 404/410 代表訂閱已失效（使用者清掉/到期），即刪
 *   該筆（標準做法），免另開 cron 清理。
 */

/** 送到 SW 的推播內容（JSON 序列化後塞進 push event）。 */
export interface PushPayload {
  title: string;
  body: string;
  /** 點擊通知後導向的（絕對或相對）路徑。 */
  url: string;
}

interface BuildPushPayloadInput {
  type: NotificationType;
  locale: string;
  /** 觸發者顯示名（事件當下快照）；空字串時退回在地化的「有人」。 */
  actorName: string;
  /**
   * 旅程公開 `hashCode`（**非** ObjectId）——推播深連結一律用它，未登入時才能走
   * `/api/public/*`（hash_code only）的 fallback（比照 Email，見 emailTemplates）。
   */
  tripHashCode: string;
  tripName: string;
  meta?: NotificationMeta;
  /** 對外站台基底 URL（結尾無斜線）；null 時連結退回相對路徑。 */
  appUrl: string | null;
}

/** NotificationType → `notifications` 命名空間的訊息 key（與站內鈴鐺共用同一批字串）。 */
const MESSAGE_KEY: Record<NotificationType, string> = {
  expense_added: 'expenseAdded',
  payment_recorded: 'paymentRecorded',
  member_joined: 'memberJoined',
  expense_comment_added: 'expenseCommentAdded',
  friend_request: 'friendRequest',
  friend_accepted: 'friendAccepted',
};

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

/** 各通知類型對應要導向的頁面路徑（`linkId` 為旅程公開 hashCode，比照站內鈴鐺/Email）。 */
function linkPathFor(type: NotificationType, linkId: string): string {
  // 好友通知不屬於旅程，導向設定頁的好友卡片。
  if (type === 'friend_request' || type === 'friend_accepted') return ROUTES.SETTINGS_FRIENDS;
  if (type === 'payment_recorded') return ROUTES.TRIP_SETTLEMENT(linkId);
  // 支出相關導向支出分頁（旅程落點已改為行程分頁），其餘導向落點。
  if (type === 'expense_added' || type === 'expense_comment_added')
    return ROUTES.TRIP_EXPENSES(linkId);
  return ROUTES.TRIP_DETAIL(linkId);
}

/**
 * 純函式：為一則通知產生推播內容（title + body + url），依收件者語系本地化。
 * title 用旅程名、body 用 `notifications.<key>` 訊息，url 為導向路徑。
 */
export async function buildPushPayload(input: BuildPushPayloadInput): Promise<PushPayload> {
  const locale = normalizeLocale(input.locale);
  const messages = await loadMessages(locale);
  // 動態 key 用法，next-intl 嚴格 key 型別無法靜態驗證；key 由 type 列舉組出，runtime 必有。
  const t = createTranslator({ locale, messages, namespace: 'notifications' }) as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;

  const { type, actorName, tripHashCode, tripName, meta = {}, appUrl } = input;
  const actor = actorName || t('someone');
  const body = t(MESSAGE_KEY[type], { actor, description: meta.description ?? '' });

  return {
    // 非旅程通知（好友邀請等）沒有旅程名，退回泛用的「通知」標題。
    title: tripName || t('title'),
    body,
    url: toAbsoluteUrl(appUrl, linkPathFor(type, tripHashCode)),
  };
}

/**
 * 純函式：判斷 web-push 的錯誤狀態碼是否代表訂閱已失效（應回收）。
 * 404 Not Found / 410 Gone 是推播服務對「訂閱不存在/已過期」的標準回應。
 */
export function isExpiredSubscriptionError(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

interface SendPushInput {
  /** 收件者 user id（真人；已由 notify 過濾觸發者/虛擬成員）。 */
  recipients: string[];
  /** 收件者顯示資料（取 locale 決定推播語系）。 */
  byId: Map<string, { locale?: string | null }>;
  type: NotificationType;
  /** 旅程公開 hashCode（深連結用，見 BuildPushPayloadInput）。 */
  tripHashCode: string;
  tripName: string;
  actorName: string;
  meta: NotificationMeta;
}

/** 僅回傳裝置 ID，不包含 endpoint、金鑰或推播內容。accepted 不代表裝置已顯示。 */
export interface PushDeliveryOutcome {
  subscriptionId: string;
  status: 'accepted' | 'expired' | 'failed';
  statusCode?: number;
  /** 失效裝置不再寄送；清理失敗可由獨立清理工作處理。 */
  cleanupFailed?: boolean;
}

export type PushDeliveryResult =
  | { status: 'disabled'; deliveries: [] }
  | { status: 'processed'; deliveries: PushDeliveryOutcome[] }
  // 前置設定／查詢失敗，尚未開始任何裝置寄送，不可誤認為全部成功。
  | { status: 'failed'; deliveries: [] };

/**
 * 對一組收件者送出 Web Push（每位每裝置一則）。best-effort，永不 throw。
 * 回傳逐裝置結果供未來持久化 worker 使用；本函式不自動重試。
 * 未配置 VAPID 與已處理但沒有裝置，使用不同狀態表示。
 */
export async function sendPush({
  recipients,
  byId,
  type,
  tripHashCode,
  tripName,
  actorName,
  meta,
}: SendPushInput): Promise<PushDeliveryResult> {
  try {
    const config = getWebPushConfig();
    if (!config) return { status: 'disabled', deliveries: [] };

    // 一次撈出全部收件者的裝置訂閱（一位使用者可多裝置）。
    const subs = await PushSubscription.find({ user: { $in: recipients } }).lean<
      {
        _id: { toString(): string };
        user: { toString(): string };
        endpoint: string;
        keys: { p256dh: string; auth: string };
      }[]
    >();
    if (subs.length === 0) return { status: 'processed', deliveries: [] };

    const vapidDetails = {
      subject: config.subject,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    };
    // 推播連結用的對外基底 URL（沿用 Email 用的 APP_URL；未設定則 payload 回相對路徑）。
    const rawAppUrl = getEnv().APP_URL;
    const appUrl = rawAppUrl ? rawAppUrl.replace(/\/+$/, '') : null;

    const deliveries = await Promise.all(
      subs.map(async (sub): Promise<PushDeliveryOutcome> => {
        const subscriptionId = sub._id.toString();
        try {
          const owner = byId.get(sub.user.toString());
          const payload = await buildPushPayload({
            type,
            locale: owner?.locale ?? defaultLocale,
            actorName,
            tripHashCode,
            tripName,
            meta,
            appUrl,
          });
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify(payload),
            { vapidDetails }
          );
          return { subscriptionId, status: 'accepted' };
        } catch (error) {
          const rawStatus = (error as { statusCode?: unknown } | null)?.statusCode;
          const statusCode = typeof rawStatus === 'number' ? rawStatus : undefined;
          if (isExpiredSubscriptionError(statusCode)) {
            try {
              await PushSubscription.deleteOne({ _id: sub._id });
              return { subscriptionId, status: 'expired', statusCode };
            } catch {
              return { subscriptionId, status: 'expired', statusCode, cleanupFailed: true };
            }
          } else {
            logger.error('web push send failed', error);
            return {
              subscriptionId,
              status: 'failed',
              ...(statusCode === undefined ? {} : { statusCode }),
            };
          }
        }
      })
    );
    return { status: 'processed', deliveries };
  } catch (error) {
    logger.error('sendPush threw', error);
    return { status: 'failed', deliveries: [] };
  }
}
