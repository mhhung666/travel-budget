import { Trip, User, Notification, type NotificationType } from '@/models';
import { logger } from './logger';

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

interface NotifyInput {
  tripId: string;
  /** 觸發此事件的使用者（不會收到自己的通知）。 */
  actorId: string;
  type: NotificationType;
  /** 型別相依的結構化資料（金額、描述、關聯 id…）；訊息文案在前端依語系組出。 */
  meta?: Record<string, unknown>;
  /**
   * 明確指定收件者（真人 user id）。省略時 fan-out 給「全體旅程成員」。
   * 仍會再過濾掉觸發者與虛擬成員。
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
    // 取旅程名稱（去正規化存進通知）+ 必要時取成員清單
    const trip = await Trip.findById(tripId)
      .select('name members')
      .lean<{ name: string; members: { user: { toString(): string } }[] } | null>();
    if (!trip) return;

    const candidateIds = recipientIds ?? trip.members.map((m) => m.user.toString());
    const uniqueIds = [...new Set(candidateIds.filter((id) => id !== actorId))];
    if (uniqueIds.length === 0) return;

    // 一次撈出候選人 + 觸發者：取 displayName（觸發者名）與 isVirtual（過濾收件者）
    const users = await User.find({ _id: { $in: [...uniqueIds, actorId] } })
      .select('displayName isVirtual')
      .lean<{ _id: { toString(): string }; displayName: string; isVirtual?: boolean | null }[]>();

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
        trip: tripId,
        tripName: trip.name,
        type,
        actor: actorId,
        actorName,
        meta,
        read: false,
      }))
    );
  } catch (error) {
    // 次要副作用：失敗只記 log，不影響主 action
    logger.error('notify failed', error);
  }
}
