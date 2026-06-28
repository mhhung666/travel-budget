import { ActivityLog, User, type ActivityType } from '@/models';
import { logger } from './logger';

/**
 * 動態牆（#8）的寫入工具。**server-only**：直接觸碰 Mongoose models，
 * 只可被 server actions 匯入。
 *
 * 設計重點（與 [notify](./notify.ts) 的對照）：
 * - **單筆寫入、per-trip**：一個事件存一筆共享紀錄（非 per-user fan-out）。
 * - **包含觸發者本人**：動態牆呈現「誰改了什麼」，當然含你自己的動作（通知才排除自己）。
 * - **best-effort**：活動紀錄是次要副作用，任何失敗只記 log、絕不 throw 進主 action
 *   （比照 notify / R2 清理的取捨）——不能因為寫紀錄失敗就讓使用者的主操作失敗。
 */
interface LogActivityInput {
  tripId: string;
  /** 觸發此事件的使用者（會出現在動態牆上）。 */
  actorId: string;
  type: ActivityType;
  /** 型別相依的結構化資料（金額、描述、關聯 id…）；訊息文案在前端依語系組出。 */
  meta?: Record<string, unknown>;
}

/**
 * 記錄一筆旅程活動。best-effort，永不 throw。
 */
export async function logActivity({
  tripId,
  actorId,
  type,
  meta = {},
}: LogActivityInput): Promise<void> {
  try {
    // 去正規化觸發者名稱（事件當下快照，讀取免 populate）
    const actor = await User.findById(actorId)
      .select('displayName')
      .lean<{ displayName: string } | null>();

    await ActivityLog.create({
      trip: tripId,
      actor: actorId,
      actorName: actor?.displayName ?? '',
      type,
      meta,
    });
  } catch (error) {
    // 次要副作用：失敗只記 log，不影響主 action
    logger.error('logActivity failed', error);
  }
}
