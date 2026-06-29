import { applyPayments } from './settlement';

/**
 * 排程結算提醒的**純函式**聚合邏輯（不碰 DB / Email，可單元測試）。
 *
 * 把「每趟旅程的未結清淨額」彙整成「每位使用者跨旅程的待結清清單」，供 cron route
 * 對每位使用者寄一封彙整提醒（見 app/api/cron/settlement-reminder）。
 *
 * 餘額正負約定沿用 lib/settlement.ts：`balance > 0` 應收（別人欠你）、`< 0` 應付（你欠人）。
 */

/** 結算所需的單筆旅程原始資料（已從 DB 撈出、依 trip 分組）。 */
export interface TripSettlementInput {
  /** 旅程公開 hashCode（提醒信連結用，見 emailTemplates BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  /** 成員（含個別軟封存時間；archivedAt 非 null 代表該成員已把此旅程收起，不提醒）。 */
  members: { userId: string; archivedAt?: Date | null }[];
  expenses: { payer: string; amount: number; splits: { user: string; shareAmount: number }[] }[];
  /** 已登記還款（from 付給 to）。 */
  payments: { from: string; to: string; amount: number }[];
}

/** 某使用者在某趟旅程的未結清淨額。 */
export interface UserTripBalance {
  /** 旅程公開 hashCode（提醒信連結用，見 emailTemplates BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  /** 淨額（TWD）：>0 別人欠你、<0 你欠人。 */
  balance: number;
}

/**
 * 算出每位使用者跨旅程的待結清清單。
 * - 個別軟封存（member.archivedAt 非 null）的旅程**不提醒該成員**。
 * - 淨額絕對值 ≤ epsilon 視為已結清，略過。
 * - 計算時納入所有成員（含虛擬成員）以求淨額正確；是否寄信由呼叫端再過濾。
 *
 * @returns Map<userId, UserTripBalance[]>（只含有未結清項目的使用者）。
 */
export function computeSettlementDigests(
  trips: TripSettlementInput[],
  epsilon = 0.01
): Map<string, UserTripBalance[]> {
  const result = new Map<string, UserTripBalance[]>();

  for (const trip of trips) {
    // 以支出算出每人 balance = 付出 - 分攤
    const paid = new Map<string, number>();
    const owed = new Map<string, number>();
    for (const e of trip.expenses) {
      paid.set(e.payer, (paid.get(e.payer) ?? 0) + (e.amount || 0));
      for (const s of e.splits || []) {
        owed.set(s.user, (owed.get(s.user) ?? 0) + (s.shareAmount || 0));
      }
    }

    const expenseBalances = trip.members.map((m) => ({
      userId: m.userId,
      balance: (paid.get(m.userId) ?? 0) - (owed.get(m.userId) ?? 0),
    }));

    // 抵銷已登記還款
    const balances = applyPayments(expenseBalances, trip.payments);
    const archivedBy = new Set(
      trip.members.filter((m) => m.archivedAt != null).map((m) => m.userId)
    );

    for (const b of balances) {
      if (Math.abs(b.balance) <= epsilon) continue; // 已結清
      if (archivedBy.has(b.userId)) continue; // 該成員已封存此旅程
      const list = result.get(b.userId) ?? [];
      list.push({ tripHashCode: trip.tripHashCode, tripName: trip.tripName, balance: b.balance });
      result.set(b.userId, list);
    }
  }

  return result;
}
