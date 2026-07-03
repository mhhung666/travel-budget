import { Trip, User, Notification, type NotificationType } from '@/models';
import { logger } from './logger';
import { getResendConfig } from './env';
import { sendEmailBatch } from './email';
import { buildNotificationEmail } from './emailTemplates';
import { sendPush } from './webpush';
import type { NotificationMeta } from '@/types';

/**
 * 站內通知的 fan-out 寫入工具。**server-only**：直接觸碰 Mongoose models，
 * 只可被 server actions 匯入（純函式 `selectNotificationRecipients` 例外，可單元測試）。
 *
 * 設計重點：
 * - **best-effort**：通知是次要副作用，任何失敗只記 log、絕不 throw 進主 action
 *   （比照 R2 物件清理的取捨）——不能因為通知寫入失敗就讓使用者新增支出失敗。
 * - **排除觸發者與虛擬成員**：自己的動作不通知自己；虛擬成員無法登入、收了也看不到。
 */

/** 通知候選人（resolve 成員/收件者後的最小形狀）。 */
export interface RecipientCandidate {
  id: string;
  isVirtual?: boolean | null;
}

/**
 * 純函式：從候選人算出實際收件者 id —— 去除觸發者本人、去除虛擬成員、去重。
 * 抽出以便單元測試 fan-out 規則（誰會收到通知），不碰 DB。
 */
export function selectNotificationRecipients(
  candidates: RecipientCandidate[],
  actorId: string
): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const c of candidates) {
    if (c.id === actorId) continue; // 不通知自己
    if (c.isVirtual) continue; // 虛擬成員無法登入
    if (seen.has(c.id)) continue; // 去重
    seen.add(c.id);
    recipients.push(c.id);
  }
  return recipients;
}

/**
 * 走「每日彙整 Email」而非即時寄信的通知類型。站內通知（鈴鐺）仍即時建立，只有
 * 「即時 Email」被略過——改由每日 cron（/api/cron/expense-digest）彙整寄出，避免
 * 每筆支出都寄一封過於頻繁。還款 / 成員加入屬低頻事件，維持即時 Email。
 */
const EMAIL_DIGESTED_TYPES: ReadonlySet<NotificationType> = new Set(['expense_added']);

interface NotifyInput {
  /**
   * 事件所屬旅程。**非旅程通知**（如好友邀請）省略——此時跳過 Trip 查詢、`tripName`
   * 留空，且 `recipientIds` 必填（無旅程成員可 fan-out）。
   */
  tripId?: string;
  /** 觸發此事件的使用者（不會收到自己的通知）。 */
  actorId: string;
  type: NotificationType;
  /** 型別相依的結構化資料（金額、描述、關聯 id…）；訊息文案在前端依語系組出。 */
  meta?: Record<string, unknown>;
  /**
   * 明確指定收件者（真人 user id）。有 tripId 時省略＝fan-out 給「全體旅程成員」；
   * 無 tripId 時必填。仍會再過濾掉觸發者與虛擬成員。
   */
  recipientIds?: string[];
}

/**
 * 為一個事件建立站內通知（每位收件者一份）。best-effort，永不 throw。
 */
export async function notify({
  tripId,
  actorId,
  type,
  meta = {},
  recipientIds,
}: NotifyInput): Promise<void> {
  try {
    // 旅程通知：取旅程名稱（去正規化存進通知）+ 必要時取成員清單。
    // 非旅程通知（好友邀請等）沒有 tripId：跳過查詢，tripName / hashCode 留空，
    // 收件者只能來自 recipientIds。
    let tripName = '';
    let tripHashCode = '';
    let memberIds: string[] | null = null;
    if (tripId) {
      const trip = await Trip.findById(tripId).select('name members hashCode').lean<{
        name: string;
        hashCode: string;
        members: { user: { toString(): string } }[];
      } | null>();
      if (!trip) return;
      tripName = trip.name;
      tripHashCode = trip.hashCode;
      memberIds = trip.members.map((m) => m.user.toString());
    }

    const candidateIds = recipientIds ?? memberIds;
    if (!candidateIds) return; // 非旅程通知必須明確指定收件者
    const uniqueIds = [...new Set(candidateIds.filter((id) => id !== actorId))];
    if (uniqueIds.length === 0) return;

    // 一次撈出候選人 + 觸發者：取 displayName（觸發者名）+ isVirtual（過濾收件者），
    // 以及 Email fan-out 需要的 email / notifyByEmail / locale。
    const users = await User.find({ _id: { $in: [...uniqueIds, actorId] } })
      .select('displayName isVirtual email notifyByEmail locale')
      .lean<
        {
          _id: { toString(): string };
          displayName: string;
          isVirtual?: boolean | null;
          email?: string | null;
          notifyByEmail?: boolean | null;
          locale?: string | null;
        }[]
      >();

    const byId = new Map(users.map((u) => [u._id.toString(), u]));
    const actorName = byId.get(actorId)?.displayName ?? '';

    const recipients = selectNotificationRecipients(
      uniqueIds.map((id) => ({ id, isVirtual: byId.get(id)?.isVirtual })),
      actorId
    );
    if (recipients.length === 0) return;

    await Notification.insertMany(
      recipients.map((uid) => ({
        user: uid,
        // 非旅程通知 trip 為 undefined，Mongoose 會省略此欄位（schema 已設 optional）。
        ...(tripId ? { trip: tripId } : {}),
        tripName,
        type,
        actor: actorId,
        actorName,
        meta,
        read: false,
      }))
    );

    // Email fan-out（best-effort、加值）：站內通知寫入後，對開啟 Email 通知且有信箱
    // 的收件者寄信。未配置 Resend 時整段跳過，省去無謂的模板/查詢工作。
    await sendNotificationEmails({
      recipients,
      byId,
      type,
      tripHashCode,
      tripName,
      actorName,
      meta: meta as NotificationMeta,
    });

    // Web Push fan-out（best-effort、加值）：對有裝置訂閱的收件者送即時推播。未配置
    // VAPID 或無訂閱時靜默跳過。**推播一律即時**（不分即時/每日彙整）——彙整只針對
    // Email 過於頻繁的問題，推播是使用者主動訂閱的即時管道。push 自帶 opt-in（有沒有
    // 訂閱），故不看 notifyByEmail（那是 Email 專屬的 opt-out）。
    await sendPush({
      recipients,
      byId,
      type,
      tripHashCode,
      tripName,
      actorName,
      meta: meta as NotificationMeta,
    });
  } catch (error) {
    // 次要副作用：失敗只記 log，不影響主 action
    logger.error('notify failed', error);
  }
}

/** notify() 內部的 Email fan-out。永不 throw（呼叫端已在 try/catch 內，這裡再自保一層）。 */
async function sendNotificationEmails({
  recipients,
  byId,
  type,
  tripHashCode,
  tripName,
  actorName,
  meta,
}: {
  recipients: string[];
  byId: Map<
    string,
    { email?: string | null; notifyByEmail?: boolean | null; locale?: string | null }
  >;
  type: NotificationType;
  /** 旅程公開 hashCode（信中連結用，見 emailTemplates BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  actorName: string;
  meta: NotificationMeta;
}): Promise<void> {
  if (EMAIL_DIGESTED_TYPES.has(type)) return; // 改走每日彙整，不即時寄信
  const config = getResendConfig();
  if (!config) return; // 未配置 Resend → 不寄 Email

  // notifyByEmail 預設開（缺值＝舊資料視為開啟）；須有有效信箱。
  const targets = recipients
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => !!u && u.notifyByEmail !== false && !!u.email);

  // 先逐人組出在地化內容（模板組裝為純記憶體運算），再一次 batch 寄出——避免併發
  // 寄信撞上 Resend 的 2 req/s 限制（見 lib/email.ts sendEmailBatch）。
  const messages = (
    await Promise.all(
      targets.map(async (u) => {
        try {
          const content = await buildNotificationEmail({
            type,
            locale: u.locale ?? 'zh',
            actorName,
            tripHashCode,
            tripName,
            meta,
            appUrl: config.appUrl,
          });
          return { to: u.email!, content };
        } catch (error) {
          logger.error('notification email failed', error);
          return null;
        }
      })
    )
  ).filter((m): m is NonNullable<typeof m> => m !== null);

  await sendEmailBatch(messages);
}
