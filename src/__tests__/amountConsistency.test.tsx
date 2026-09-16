/**
 * 同趟旅行金額一致性的回歸測試。
 *
 * 四個案例來自 2026-09-16 的驗收（docs/archive/tests/AMOUNT_CONSISTENCY_ACCEPTANCE_2026-09-16.md），
 * 當時全數失敗：分攤容差留下無人可還的餘額、群組統計先取整再加總、每日分配少算尾差、
 * 結算摘要與明細精度不同。共同規則見 src/lib/money.ts。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { computeSplits, type SplitMemberInput } from '@/lib/expenseSplit';
import { computeTripStats, type TripStatsExpense } from '@/lib/tripStats';
import { applyPayments, calculateSettlement } from '@/lib/settlement';
import { allocateMoney, roundMoney, roundMoneyExpr } from '@/lib/money';
import SettlementSummary from '@/components/settlement/SettlementSummary';

const member = (id: string, value = ''): SplitMemberInput => ({ id, selected: true, value });

const expense = (over: Partial<TripStatsExpense> & { id: string }): TripStatsExpense => ({
  category: 'other',
  date: '2026-06-01',
  description: '',
  amount: 0,
  payerId: 'a',
  payerName: 'A',
  splits: [],
  ...over,
});

describe('money helpers', () => {
  it('allocates a remainder so the parts add up to the whole', () => {
    expect(allocateMoney(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    expect(allocateMoney(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('falls back to an even split when every weight is zero', () => {
    expect(allocateMoney(10, [0, 0])).toEqual([5, 5]);
  });

  it('rounds to cents without binary representation drift', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});

describe('split allocation leaves no unsettleable balance', () => {
  it('rejects an under-allocated split instead of calling it balanced', () => {
    const r = computeSplits('amount', [member('a', '500'), member('b', '499')], 1000, 1);
    expect(r.balanced).toBe(false);
    expect(r.imbalance).toBe('under');
  });

  it('keeps the tolerance at one cent however large the expense is', () => {
    // 相對容差（總額的萬分之一）曾讓 1,000 元只分攤 999.95 元也算平衡。
    const r = computeSplits('amount', [member('a', '499.95'), member('b', '500')], 1000, 1);
    expect(r.balanced).toBe(false);
    expect(r.imbalance).toBe('under');
  });

  it('hands the rounding remainder to someone when the split is balanced', () => {
    const r = computeSplits(
      'percent',
      [member('a', '33.33'), member('b', '33.33'), member('c', '33.33')],
      100,
      1
    );
    expect(r.balanced).toBe(true);
    expect(r.allocatedOriginal).toBe(100);
    expect(r.original.a + r.original.b + r.original.c).toBe(100);
  });

  it('settles to zero for everyone after the plan is paid back', () => {
    const r = computeSplits('equal', [member('a'), member('b'), member('c')], 1000, 1);
    const balances = [
      { userId: 'a', username: 'A', balance: roundMoney(1000 - r.twd.a) },
      { userId: 'b', username: 'B', balance: -r.twd.b },
      { userId: 'c', username: 'C', balance: -r.twd.c },
    ];
    const payments = calculateSettlement(balances.map((b) => ({ ...b }))).map((t) => ({
      from: balances.find((b) => b.username === t.from)!.userId,
      to: balances.find((b) => b.username === t.to)!.userId,
      amount: t.amount,
    }));
    expect(applyPayments(balances, payments).map((b) => roundMoney(b.balance))).toEqual([0, 0, 0]);
  });
});

describe('a single cent is still settleable', () => {
  it('plans a transfer for a one-cent debt', () => {
    const plan = calculateSettlement([
      { userId: 'a', username: 'A', balance: 0.01 },
      { userId: 'b', username: 'B', balance: -0.01 },
    ]);
    expect(plan).toEqual([{ from: 'B', to: 'A', amount: 0.01 }]);
  });

  it('does not call a one-cent balance settled in the summary', () => {
    render(
      <SettlementSummary
        totalExpenses={100}
        myBalance={{ userId: 'a', username: 'A', totalPaid: 50.01, totalOwed: 50, balance: 0.01 }}
      />
    );
    expect(screen.queryByText('🎉')).toBeNull();
    expect(screen.getAllByText(/NT\$0\.01/).length).toBeGreaterThan(0);
  });
});

describe('trip stats keep the cents', () => {
  it('totals the expenses instead of the rounded categories', () => {
    const r = computeTripStats(
      [
        expense({ id: '1', category: 'food', amount: 100.4 }),
        expense({ id: '2', category: 'transportation', amount: 200.4 }),
      ],
      [{ userId: 'a', name: 'A' }],
      {}
    );
    expect(r.totalAmount).toBe(300.8);
    expect(roundMoney(r.categoryStats.reduce((sum, c) => sum + c.total, 0))).toBe(300.8);
  });

  it('spreads an expense across its itinerary days without losing the remainder', () => {
    const days = [
      { id: 'd1', dayNumber: 1, title: '' },
      { id: 'd2', dayNumber: 2, title: '' },
      { id: 'd3', dayNumber: 3, title: '' },
    ];
    const r = computeTripStats(
      [
        expense({
          id: '1',
          category: 'accommodation',
          amount: 100,
          itineraryDayIds: ['d1', 'd2', 'd3'],
        }),
      ],
      [{ userId: 'a', name: 'A' }],
      {},
      days
    );
    expect(roundMoney(r.dailySpend.reduce((sum, d) => sum + d.total, 0))).toBe(100);
  });
});

describe('settlement summary precision', () => {
  it('shows the same precision in the headline as in the breakdown', () => {
    render(
      <SettlementSummary
        totalExpenses={100.4}
        myBalance={{
          userId: 'a',
          username: 'A',
          totalPaid: 0,
          totalOwed: 50.2,
          balance: -50.2,
        }}
      />
    );
    expect(screen.getAllByText(/NT\$50\.2/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/NT\$50(?!\.)/)).toBeNull();
  });
});

/**
 * 聚合端取整必須與 JS 端同源。MongoDB 的 `$round` 是銀行家捨入（30.125 → 30.12），
 * 而 `roundMoney` 四捨五入（30.13）：舊資料 30.125 因此在預算列／今日花費與結算／
 * 個人統計之間差一分。這裡用同一套語意重算 `roundMoneyExpr`，不需要資料庫；真正在
 * MongoDB 上跑的驗證見 moneyAggregation.integration.test.ts。
 */
// 十進位運算以定點 BigInt 模擬（Decimal128 有 34 位有效數字，這裡固定 20 位小數綽綽
// 有餘）；用 double 會重新引入正要避開的二進位誤差。字面量寫法（1n）在 ES2017 目標下
// 不可用，故一律以 BigInt() 建構。
const ZERO = BigInt(0);
const ONE = BigInt(1);
const HUNDRED = BigInt(100);
const UNIT = BigInt(10) ** BigInt(20);
const CENT = UNIT / HUNDRED;
/** 欄位不存在的哨兵值，唯一用途是讓 `$ifNull` 有東西可判。 */
const MISSING = -(BigInt(10) ** BigInt(38));

function toDecimal(value: number): bigint {
  // MongoDB 由 double 轉 Decimal128 時取 15 位有效數字，正是消去 1.005 這類表示誤差的關鍵。
  const text = value.toPrecision(15);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const scaled = BigInt(whole) * UNIT + BigInt((fraction + '0'.repeat(20)).slice(0, 20));
  return negative ? -scaled : scaled;
}

function evaluateExpr(expr: unknown, value: number | undefined): bigint {
  if (typeof expr === 'number') return toDecimal(expr);
  if (typeof expr === 'string') return value === undefined ? MISSING : toDecimal(value);
  const [op, arg] = Object.entries(expr as Record<string, unknown>)[0];
  const args = (Array.isArray(arg) ? arg : [arg]).map((a) => evaluateExpr(a, value));
  switch (op) {
    case '$toDecimal':
    case '$toDouble':
      return args[0];
    case '$ifNull':
      return args[0] === MISSING ? ZERO : args[0];
    case '$multiply':
      return (args[0] * args[1]) / UNIT;
    case '$add':
      return args[0] + args[1];
    case '$floor':
      return (args[0] >= ZERO ? args[0] / UNIT : -((-args[0] + UNIT - ONE) / UNIT)) * UNIT;
    case '$divide':
      return (args[0] * UNIT) / args[1];
    default:
      throw new Error(`unsupported operator ${op}`);
  }
}

function evaluate(value: number | undefined): number {
  const scaled = evaluateExpr(roundMoneyExpr('$amount'), value);
  // 結果必須落在分上；用 Number(scaled) / 1e20 收尾會把 1000 變成 999.9999999999999。
  if (scaled % CENT !== ZERO) throw new Error(`not a whole cent: ${scaled}`);
  return Number(scaled / CENT) / 100;
}

describe('aggregation rounding matches roundMoney', () => {
  it.each([30.125, 30.135, 1.005, 2.675, 0.005, 0.015, 999.995, -30.125, 12, 30.124])(
    'rounds %s the same way on both sides',
    (amount) => {
      expect(evaluate(amount)).toBe(roundMoney(amount));
    }
  );

  it('treats a missing amount as zero', () => {
    expect(evaluate(undefined)).toBe(0);
  });

  it('never falls back to $round, whose half-to-even loses the cent', () => {
    expect(JSON.stringify(roundMoneyExpr('$amount'))).not.toContain('$round');
  });
});
