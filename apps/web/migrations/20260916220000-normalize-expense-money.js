/**
 * 舊支出金額收斂到分，並把分攤尾差按與讀取端相同的規則分配。
 *
 * 讀取端（src/lib/money.ts 的 normalizeShares / normalizedSplitsExpr）目前每次讀取都重算；
 * 本遷移把同樣結果寫回，完成後才能移除讀取熱路徑的重算。規則在此凍結一份副本——
 * 已套用的遷移不能因日後修改 money.ts 而改變語意（等價性由
 * src/__tests__/expenseMoneyMigration.test.mjs 對照 money.ts 驗證）。
 *
 * - 只寫實際有變動的支出；原值備份在 expense_money_migration_backups（_id = 支出 _id）。
 * - 更新條件包含原值：遷移期間被編輯的支出不會被覆蓋，只記入略過。
 * - 大額不平衡（超出各自取整可解釋的範圍）只各自取到分、不重分；它與換匯乘積不符、
 *   分攤給非成員一樣只列入 anomalies，不自動修正。
 * - down 只回復「目前仍等於遷移結果」的支出；遷移後被使用者編輯者保留編輯。
 *
 * @typedef {import('mongodb').Db} Db
 */

const BACKUPS = 'expense_money_migration_backups';
const MONEY_EPSILON = 0.005;
const SPLIT_TOLERANCE = 0.01;

function toCents(amount) {
  if (!Number.isFinite(amount)) return 0;
  const cents = amount * 100;
  return Math.floor(cents + 0.5 + Math.abs(cents) * Number.EPSILON * 2);
}

export function roundMoney(amount) {
  return toCents(amount) / 100;
}

function allocateMoney(total, weights) {
  if (weights.length === 0) return [];
  const totalCents = toCents(total);
  const positive = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const totalWeight = positive.reduce((sum, w) => sum + w, 0);
  const effective = totalWeight > 0 ? positive : weights.map(() => 1);
  const effectiveTotal = totalWeight > 0 ? totalWeight : weights.length;
  const exact = effective.map(
    (w) => Math.floor(((totalCents * w) / effectiveTotal) * 1e9 + 0.5) / 1e9
  );
  const cents = exact.map((value) => Math.floor(value));
  let remainder = totalCents - cents.reduce((sum, c) => sum + c, 0);
  const order = exact
    .map((value, index) => ({ index, frac: Math.round((value - Math.floor(value)) * 1e9) / 1e9 }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; remainder > 0 && order.length > 0; i += 1, remainder -= 1) {
    cents[order[i % order.length].index] += 1;
  }
  return cents.map((c) => c / 100);
}

export function normalizeShares(amount, shares) {
  amount = roundMoney(amount);
  const rounded = shares.map(roundMoney);
  if (
    Math.abs(roundMoney(shares.reduce((sum, share) => sum + share, 0) - amount)) >
    roundMoney(shares.length * MONEY_EPSILON + SPLIT_TOLERANCE)
  )
    return rounded;
  if (rounded.reduce((sum, share) => sum + toCents(share), 0) === toCents(amount)) return rounded;
  return allocateMoney(amount, shares);
}

/** 單筆支出的遷移計畫（純函式）。讀取端以 `|| 0` 看待缺漏值，此處一致。 */
export function planExpenseMoney(expense) {
  const splits = expense.splits ?? [];
  const rawShares = splits.map((s) => s.shareAmount || 0);
  const amount = roundMoney(expense.amount || 0);
  const shares = normalizeShares(expense.amount || 0, rawShares);
  const anomalies = [];
  if (splits.length > 0 && toCents(shares.reduce((sum, s) => sum + s, 0)) !== toCents(amount))
    anomalies.push('unbalanced');
  if (
    Number.isFinite(expense.originalAmount) &&
    Number.isFinite(expense.exchangeRate) &&
    toCents(expense.originalAmount * expense.exchangeRate) !== toCents(amount)
  )
    anomalies.push('exchange');
  const changed = amount !== expense.amount || shares.some((s, i) => s !== splits[i].shareAmount);
  return { changed, amount, shares, anomalies };
}

/** 以欄位逐一比對（保留分攤子文件的 _id 等其他欄位），確保只改到預期的那一版。 */
function matchValues(id, amount, splits) {
  const filter = { _id: id, amount, splits: { $size: splits.length } };
  splits.forEach((s, i) => {
    filter[`splits.${i}.user`] = s.user;
    filter[`splits.${i}.shareAmount`] = s.shareAmount ?? null;
  });
  return filter;
}

function setValues(amount, shares) {
  const $set = { amount };
  shares.forEach((share, i) => {
    $set[`splits.${i}.shareAmount`] = share;
  });
  return { $set };
}

/** @param {Db} db */
export const up = async (db) => {
  const expenses = db.collection('expenses');
  const backups = db.collection(BACKUPS);
  const report = { scanned: 0, updated: 0, skippedConcurrentEdit: 0, anomalies: [] };
  const membersByTrip = new Map();
  for await (const trip of db.collection('trips').find({}, { projection: { 'members.user': 1 } }))
    membersByTrip.set(String(trip._id), new Set((trip.members ?? []).map((m) => String(m.user))));
  const cursor = expenses.find(
    {},
    { projection: { amount: 1, splits: 1, originalAmount: 1, exchangeRate: 1, trip: 1 } }
  );
  for await (const expense of cursor) {
    report.scanned += 1;
    const plan = planExpenseMoney(expense);
    const members = membersByTrip.get(String(expense.trip));
    if ((expense.splits ?? []).some((s) => !members?.has(String(s.user))))
      plan.anomalies.push('non-member-split');
    if (plan.anomalies.length > 0)
      report.anomalies.push({
        expense: String(expense._id),
        trip: String(expense.trip),
        kinds: plan.anomalies,
      });
    if (!plan.changed) continue;

    const splits = (expense.splits ?? []).map((s) => ({
      user: s.user,
      shareAmount: s.shareAmount,
    }));
    const migratedSplits = splits.map((s, i) => ({ user: s.user, shareAmount: plan.shares[i] }));
    // 先寫備份再改支出；重跑時 $setOnInsert 不會以已遷移的值覆蓋最初的原值。
    const backup = await backups.updateOne(
      { _id: expense._id },
      {
        $setOnInsert: {
          original: { amount: expense.amount, splits },
          migrated: { amount: plan.amount, splits: migratedSplits },
          migratedAt: new Date(),
        },
      },
      { upsert: true }
    );
    const result = await expenses.updateOne(
      matchValues(expense._id, expense.amount, splits),
      setValues(plan.amount, plan.shares)
    );
    if (result.modifiedCount === 1) {
      report.updated += 1;
    } else {
      report.skippedConcurrentEdit += 1;
      if (backup.upsertedCount === 1) await backups.deleteOne({ _id: expense._id });
    }
  }
  console.warn('[normalize-expense-money] up', JSON.stringify(report));
};

/** @param {Db} db */
export const down = async (db) => {
  const expenses = db.collection('expenses');
  const backups = db.collection(BACKUPS);
  const report = { restored: 0, notRestoredEditedOrDeleted: 0 };
  for await (const backup of backups.find({})) {
    const { original, migrated } = backup;
    const result = await expenses.updateOne(
      matchValues(backup._id, migrated.amount, migrated.splits),
      setValues(
        original.amount,
        original.splits.map((s) => s.shareAmount)
      )
    );
    if (result.modifiedCount === 1) report.restored += 1;
    else report.notRestoredEditedOrDeleted += 1;
    await backups.deleteOne({ _id: backup._id });
  }
  console.warn('[normalize-expense-money] down', JSON.stringify(report));
};
