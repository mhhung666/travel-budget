import { Trip, Expense, Payment, User } from '@/models';
import { calculateSettlement, applyPayments } from '@/lib/settlement';
import { roundMoney, normalizeShares } from '@/lib/money';
import { toPaymentRecord, type PaymentDtoInput } from '@/lib/dto';
import type { Balance, Settlement } from '@/types';
type PopulatedMember = {
  user: {
    _id: { toString(): string };
    username: string;
    displayName: string;
    isVirtual?: boolean;
  } | null;
};

type LeanExpenseForSettlement = {
  payer: { toString(): string };
  amount: number;
  splits: { user: { toString(): string }; shareAmount: number }[];
};

/** 建議轉帳的成員 id 版本；`Settlement.transactions` 只帶顯示名稱，同名成員無法分辨。 */
export type SettlementTransfer = { fromId: string; toId: string; amount: number };
export type SettlementDetail = Settlement & {
  transfers: SettlementTransfer[];
  virtualMembers?: Record<string, boolean>;
};

export async function readSettlement(tripId: string, memberIds?: string[]): Promise<Settlement> {
  const { balances, transactions, payments, totalExpenses } = await readSettlementDetail(
    tripId,
    memberIds
  );
  // 只回傳原有欄位：公開結算路由直接序列化這個結果。
  return { balances, transactions, payments, totalExpenses };
}

/** Authorized Web members retain the identities already used by the mobile settlement view. */
export async function readMemberSettlement(tripId: string): Promise<Settlement> {
  const { transfers, balances, transactions, payments, totalExpenses } =
    await readSettlementDetail(tripId);
  return {
    balances,
    payments,
    totalExpenses,
    transactions: transactions.map((transaction, index) => ({
      ...transaction,
      fromId: transfers[index].fromId,
      toId: transfers[index].toId,
    })),
  };
}

export async function readSettlementDetail(
  tripId: string,
  memberIds?: string[]
): Promise<SettlementDetail> {
  // 一次取出成員 + 全部支出（含內嵌 splits）+ 已登記還款，其餘在記憶體計算
  const [trip, expenses, paymentDocs] = await Promise.all([
    memberIds
      ? User.find({ _id: { $in: memberIds } })
          .select('username displayName isVirtual')
          .lean<NonNullable<PopulatedMember['user']>[]>()
          .then((users) => {
            const byId = new Map(users.map((user) => [user._id.toString(), user]));
            return { members: memberIds.map((id) => ({ user: byId.get(id) ?? null })) };
          })
      : Trip.findById(tripId)
          .populate('members.user', 'username displayName isVirtual')
          .select('members')
          .lean<{ members: PopulatedMember[] } | null>(),
    Expense.find({ trip: tripId }).select('payer amount splits').lean<LeanExpenseForSettlement[]>(),
    Payment.find({ trip: tripId })
      .sort({ createdAt: -1 })
      .populate('from', 'username displayName isVirtual')
      .populate('to', 'username displayName isVirtual')
      .select('from to amount note createdAt')
      .lean<PaymentDtoInput[]>(),
  ]);

  return calculateSettlementDetail(trip?.members ?? [], expenses, paymentDocs);
}

/** Shared calculation for model reads and transaction snapshots; no second settlement algorithm. */
export function calculateSettlementDetail(
  memberDocs: PopulatedMember[],
  expenses: LeanExpenseForSettlement[],
  paymentDocs: PaymentDtoInput[]
): SettlementDetail {
  const members = memberDocs.map((m) => m.user).filter((u) => u !== null);

  const paidByUser = new Map<string, number>();
  const owedByUser = new Map<string, number>();
  let totalExpenses = 0;

  for (const e of expenses) {
    // 逐筆先收斂到分，與統計、預算列同一種取整順序；舊資料若存了未取整的換算金額
    // （30.004），這裡加總後再取整會比統計多出一分。
    const amount = roundMoney(e.amount || 0);
    totalExpenses += amount;
    const payerId = e.payer.toString();
    paidByUser.set(payerId, (paidByUser.get(payerId) || 0) + amount);
    const shares = normalizeShares(
      amount,
      (e.splits || []).map((s) => s.shareAmount || 0)
    );
    for (const [i, s] of (e.splits || []).entries()) {
      const uid = s.user.toString();
      owedByUser.set(uid, (owedByUser.get(uid) || 0) + shares[i]);
    }
  }

  const expenseBalances: Balance[] = members.map((member) => {
    const id = member!._id.toString();
    const totalPaid = roundMoney(paidByUser.get(id) || 0);
    const totalOwed = roundMoney(owedByUser.get(id) || 0);
    return {
      userId: id,
      username: member!.displayName,
      totalPaid,
      totalOwed,
      balance: roundMoney(totalPaid - totalOwed),
    };
  });

  const payments = paymentDocs.map(toPaymentRecord);

  // 把已登記還款淨額抵銷進餘額，再算最少轉帳（totalPaid/totalOwed 維持支出原值供顯示）
  const balances = applyPayments(
    expenseBalances,
    payments.map((p) => ({ from: p.fromId, to: p.toId, amount: p.amount }))
  );
  // 以 userId 當標籤跑同一個演算法，再換回顯示名稱：transactions 與先前逐位相同，
  // 同時保留可辨識成員的 transfers。
  const transfers = calculateSettlement(
    balances.map((b) => ({ userId: b.userId, username: b.userId, balance: b.balance }))
  ).map((t) => ({ fromId: t.from, toId: t.to, amount: t.amount }));
  const names = new Map(balances.map((b) => [b.userId, b.username]));
  const transactions = transfers.map((t) => ({
    from: names.get(t.fromId) ?? '',
    to: names.get(t.toId) ?? '',
    amount: t.amount,
  }));

  const virtualMembers = Object.fromEntries(
    [...members, ...paymentDocs.flatMap((p) => [p.from, p.to])]
      .filter((u) => u !== null)
      .map((u) => [u!._id.toString(), u!.isVirtual === true])
  );
  return {
    balances,
    transactions,
    transfers,
    payments,
    virtualMembers,
    totalExpenses: roundMoney(totalExpenses),
  };
}
