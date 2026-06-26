interface Balance {
  userId: string;
  username: string;
  balance: number; // 正數表示應收,負數表示應付
}

interface Transaction {
  from: string;
  to: string;
  amount: number;
}

/**
 * 計算最少轉帳次數的結算方案
 * @param balances 每個用戶的淨餘額
 * @returns 轉帳列表
 */
export function calculateSettlement(balances: Balance[]): Transaction[] {
  const transactions: Transaction[] = [];

  // 分離債權人和債務人
  const creditors = balances.filter((b) => b.balance > 0.01).sort((a, b) => b.balance - a.balance);
  const debtors = balances.filter((b) => b.balance < -0.01).sort((a, b) => a.balance - b.balance);

  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];

    // 計算這次轉帳金額(取較小的絕對值)
    const amount = Math.min(creditor.balance, Math.abs(debtor.balance));

    if (amount > 0.01) {
      transactions.push({
        from: debtor.username,
        to: creditor.username,
        amount: Math.round(amount * 100) / 100, // 四捨五入到小數點後兩位
      });
    }

    // 更新餘額
    creditor.balance -= amount;
    debtor.balance += amount;

    // 如果債權人收完了,移到下一個
    if (creditor.balance < 0.01) {
      i++;
    }

    // 如果債務人付完了,移到下一個
    if (Math.abs(debtor.balance) < 0.01) {
      j++;
    }
  }

  return transactions;
}

interface SettlementPayment {
  from: string; // 付款人 userId
  to: string; // 收款人 userId
  amount: number;
}

/**
 * 把已登記的還款淨額抵銷進「以支出算出的餘額」。
 *
 * 一筆 from→to 的還款代表 `from` 已付給 `to`：使 from 的負債變小（balance += amount），
 * 使 to 的債權變小（balance -= amount）。只調整 `balance`，刻意不動 totalPaid/totalOwed
 * （那兩個是給使用者看的「支出」累計，不應混入結算還款）。回傳新陣列，不變動輸入。
 */
export function applyPayments<T extends { userId: string; balance: number }>(
  balances: T[],
  payments: SettlementPayment[]
): T[] {
  const delta = new Map<string, number>();
  for (const p of payments) {
    if (!(p.amount > 0)) continue;
    delta.set(p.from, (delta.get(p.from) ?? 0) + p.amount);
    delta.set(p.to, (delta.get(p.to) ?? 0) - p.amount);
  }
  return balances.map((b) => ({ ...b, balance: b.balance + (delta.get(b.userId) ?? 0) }));
}

/**
 * 格式化金額顯示
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
  }).format(amount);
}
