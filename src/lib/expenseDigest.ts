/**
 * 每日「新增支出」彙整的**純函式**聚合邏輯（不碰 DB / Email，可單元測試）。
 *
 * 站內鈴鐺通知仍即時；只有 Email 改成每日由 cron 彙整（見
 * app/api/cron/expense-digest）。把「過去 24 小時各旅程的新支出」整理成「每位成員
 * 該收到的摘要」——**排除成員自己新增的**（比照即時通知「不通知自己」），並略過已個別
 * 軟封存該旅程的成員。
 */

/** 單筆新支出（已含付款人顯示名）。 */
export interface DigestExpense {
  /** 新增此筆的使用者 id；null（舊資料）視為非本人。 */
  createdBy: string | null;
  description: string;
  /** TWD 金額。 */
  amount: number;
  payerName: string;
}

/** 結算所需的單筆旅程原始資料（已依 trip 分組）。 */
export interface TripExpenseDigestInput {
  /** 旅程公開 hashCode（摘要信連結用，見 emailTemplates BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  members: { userId: string; archivedAt?: Date | null }[];
  expenses: DigestExpense[];
}

/** 某使用者在某旅程當日的新支出摘要（已排除自己新增的）。 */
export interface UserTripDigest {
  /** 旅程公開 hashCode（摘要信連結用，見 emailTemplates BuildEmailInput）。 */
  tripHashCode: string;
  tripName: string;
  expenses: { description: string; amount: number; payerName: string }[];
}

/**
 * 算出每位使用者跨旅程的當日新支出摘要。
 * - 排除成員自己新增的支出（createdBy === userId）。
 * - 個別軟封存（member.archivedAt 非 null）的旅程不寄給該成員。
 * - 某成員在該旅程沒有「別人加的」新支出時，不列入（避免空摘要）。
 *
 * @returns Map<userId, UserTripDigest[]>（只含有可寄內容的使用者）。
 */
export function computeExpenseDigests(
  trips: TripExpenseDigestInput[]
): Map<string, UserTripDigest[]> {
  const result = new Map<string, UserTripDigest[]>();

  for (const trip of trips) {
    if (trip.expenses.length === 0) continue;

    for (const member of trip.members) {
      if (member.archivedAt != null) continue; // 已封存此旅程

      const forUser = trip.expenses
        .filter((e) => e.createdBy !== member.userId) // 排除自己加的
        .map((e) => ({ description: e.description, amount: e.amount, payerName: e.payerName }));

      if (forUser.length === 0) continue;

      const list = result.get(member.userId) ?? [];
      list.push({ tripHashCode: trip.tripHashCode, tripName: trip.tripName, expenses: forUser });
      result.set(member.userId, list);
    }
  }

  return result;
}
