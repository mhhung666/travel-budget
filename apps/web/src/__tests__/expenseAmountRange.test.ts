// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MAX_EXPENSE_AMOUNT } from '@travel-budget/contracts';
import { toExpenseDto } from '@/lib/dto';
import { computeSplits } from '@/lib/expenseSplit';
import { roundMoney } from '@/lib/money';

// Importing the service only for its two pure helpers must not need a database or storage.
vi.mock('@/lib/storage', () => ({ headObject: vi.fn(), deleteObjects: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
const { allocateShares, splitsMatchAmount } = await import('@/lib/expenseCreate');

/**
 * The amount a member confirms in the preview must be the amount stored, returned and summed:
 * every stage rounds again, and the shared rounding is only the identity on cent values up to
 * about 8.8e12. This sweeps the whole accepted range through the real functions of every stage
 * (preview, validation, allocation, storage format, response) with exact integer cents as the
 * reference, so raising MAX_EXPENSE_AMOUNT without fixing the arithmetic fails here.
 */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const random = seeded(20261004);
const MAX_CENTS = MAX_EXPENSE_AMOUNT * 100;
const cents = (amount: number) => Math.round(amount * 100);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const ids = (count: number) => Array.from({ length: count }, (_, index) => `m${index}`);
const person = (id: string) => ({ _id: id, username: id, displayName: id });

/** Everything after the shares are chosen: validation, storage, response. Returns what differs. */
function afterPreview(amountCents: number, shareAmounts: number[]) {
  const amount = amountCents / 100;
  const problems: string[] = [];
  const users = ids(shareAmounts.length);
  const splits = shareAmounts.map((share_amount) => ({ share_amount }));
  if (roundMoney(amount) !== amount) problems.push('confirmed amount changes when rounded');
  if (sum(shareAmounts.map(cents)) !== amountCents) problems.push('shares do not add up');
  if (!splitsMatchAmount(splits, amount)) problems.push('service rejects the split');
  const stored = allocateShares(splits, amount);
  if (stored.some((share, index) => share !== shareAmounts[index])) {
    problems.push('stored shares differ from the confirmed ones');
  }
  const dto = toExpenseDto(
    {
      _id: 'e1',
      amount: roundMoney(amount),
      originalAmount: amount,
      currency: 'TWD',
      exchangeRate: 1,
      description: 'x',
      category: 'food',
      date: '2026-10-04',
      createdAt: new Date(0),
      payer: person('m0'),
      splits: stored.map((shareAmount, index) => ({ user: person(users[index]), shareAmount })),
    },
    'trip'
  );
  if (dto.amount !== amount) problems.push('response amount differs');
  if (dto.original_amount !== amount) problems.push('response original amount differs');
  if (dto.splits.some((split, index) => split.share_amount !== shareAmounts[index])) {
    problems.push('response shares differ');
  }
  if (sum(dto.splits.map((split) => cents(split.share_amount))) !== amountCents) {
    problems.push('response shares do not add up');
  }
  return problems;
}

function equalSplit(amountCents: number, count: number) {
  const amount = amountCents / 100;
  const members = ids(count).map((id) => ({ id, selected: true, value: '' }));
  const { twd } = computeSplits('equal', members, amount, 1);
  return members.map((member) => twd[member.id]);
}

/** A random exact way to divide the cents between `count` members; some shares may be zero. */
function randomPartition(amountCents: number, count: number) {
  const cuts = Array.from({ length: count - 1 }, () => Math.floor(random() * (amountCents + 1)));
  const edges = [0, ...cuts.sort((a, b) => a - b), amountCents];
  return edges.slice(1).map((edge, index) => (edge - edges[index]) / 100);
}

const MEMBER_COUNTS = [1, 2, 3, 4, 7, 10, 33, 99, 100];
const EDGE_AMOUNTS = [
  1,
  2,
  3,
  99,
  100,
  101,
  33_333_333_333,
  66_666_666_667,
  12_345_678_901,
  MAX_CENTS - 5,
  MAX_CENTS - 3,
  MAX_CENTS - 2,
  MAX_CENTS - 1,
  MAX_CENTS,
];

describe('accepted amounts survive preview, validation, storage and response', () => {
  it('keeps a comfortable distance from where the shared rounding starts to drift', () => {
    expect(MAX_CENTS).toBe(100_000_000_000);
    expect(Number.isSafeInteger(MAX_CENTS)).toBe(true);
    // Why there is a limit at all: this is the amount that came back as ...0.01, then ...0.02.
    expect(roundMoney(10_000_000_000_000)).toBe(10_000_000_000_000.01);
    expect(MAX_EXPENSE_AMOUNT * 1000).toBeLessThanOrEqual(2 ** 43);
  });

  it.each(MEMBER_COUNTS)('splits the edge amounts equally between %i members', (count) => {
    for (const amountCents of EDGE_AMOUNTS) {
      const shares = equalSplit(amountCents, count);
      expect(shares, `${amountCents} cents`).toHaveLength(count);
      expect(afterPreview(amountCents, shares), `${amountCents} cents / ${count}`).toEqual([]);
      // Leftover cents sit on the first members: shares never grow along the list.
      expect(shares.every((share, index) => index === 0 || share <= shares[index - 1])).toBe(true);
    }
  });

  it.each(MEMBER_COUNTS)('keeps arbitrary exact splits between %i members', (count) => {
    for (const amountCents of EDGE_AMOUNTS) {
      const shares = randomPartition(amountCents, count);
      expect(afterPreview(amountCents, shares), `${amountCents} cents / ${count}`).toEqual([]);
    }
  });

  it('survives 4,000 random amounts and member counts across the whole range', () => {
    const failures: string[] = [];
    for (let run = 0; run < 4000; run += 1) {
      // Log-uniform, so small and huge amounts are about equally likely.
      const amountCents = Math.max(1, Math.floor(10 ** (random() * Math.log10(MAX_CENTS))));
      const count = 1 + Math.floor(random() * 100);
      const shares = run % 2 ? equalSplit(amountCents, count) : randomPartition(amountCents, count);
      for (const problem of afterPreview(amountCents, shares)) {
        failures.push(`${amountCents} cents / ${count}: ${problem}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
