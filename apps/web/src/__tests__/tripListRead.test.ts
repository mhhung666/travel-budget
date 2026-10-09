// @vitest-environment node
import { tripV2Schema } from '@travel-budget/contracts';
import mongoose, { mongo } from 'mongoose';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withLedgerV2 } from '@/lib/ledger';
const h = vi.hoisted(() => ({
  trips: vi.fn(),
  find: vi.fn(),
  probe: vi.fn(),
  expenses: vi.fn(),
  payments: vi.fn(),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => undefined }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'trip-list-test-secret-with-32-characters' }),
}));
vi.mock('@/models', () => ({
  Trip: { find: h.find },
  Expense: { aggregate: h.expenses },
  Payment: { find: () => ({ sort: () => ({ select: () => ({ lean: h.payments }) }) }) },
}));
import { readMemberTrips } from '@/lib/tripListRead';
import { mobileTrips } from '@/lib/mobile/trips';
const viewer = new mongo.ObjectId();
const fixture = (n: number, currency?: string) => ({
  _id: new mongo.ObjectId(),
  name: `Trip ${n}`,
  hashCode: `trip${n}`,
  createdAt: new Date('2026-01-01'),
  startDate: new Date(`2026-01-${String((n % 28) + 1).padStart(2, '0')}`),
  ...(currency ? { baseCurrency: currency } : {}),
  members: [{ user: viewer, role: 'member' }],
});
const previousDb = Object.getOwnPropertyDescriptor(mongoose.connection, 'db');
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(mongoose.connection, 'db', {
    configurable: true,
    value: { collection: () => ({ findOne: h.probe }) },
  });
  h.find.mockReturnValue({ sort: () => ({ lean: h.trips }) });
  h.probe.mockResolvedValue(null);
  h.expenses.mockResolvedValue([]);
  h.payments.mockResolvedValue([]);
});
afterEach(() => {
  if (previousDb) Object.defineProperty(mongoose.connection, 'db', previousDb);
  else Reflect.deleteProperty(mongoose.connection, 'db');
  vi.restoreAllMocks();
});
it.each([1, 20, 40])(
  'uses two child probes and two summaries for %s mixed-unit trips',
  async (count) => {
    h.trips.mockResolvedValue(
      Array.from({ length: count }, (_, n) => fixture(n, [undefined, 'USD', 'JPY'][n % 3]))
    );
    const rows = await withLedgerV2(() => readMemberTrips(viewer.toString()));
    expect(rows).toHaveLength(count);
    expect(h.find).toHaveBeenCalledOnce();
    expect(h.find).toHaveBeenCalledWith({ 'members.user': viewer.toString() });
    expect(h.probe).toHaveBeenCalledTimes(2);
    expect(h.expenses).toHaveBeenCalledOnce();
    expect(h.payments).toHaveBeenCalledOnce();
    expect(rows.map((r) => r.start_date)).toEqual(
      rows
        .map((r) => r.start_date)
        .sort()
        .reverse()
    );
    expect(rows.every((r) => r.my_spent === 0 && r.my_balance === 0)).toBe(true);
  }
);
it('keeps mobile load-more validation constant and preserves each trip unit', async () => {
  h.trips.mockResolvedValue(
    Array.from({ length: 40 }, (_, n) => fixture(n, n % 2 ? 'USD' : 'JPY'))
  );
  for (const page of [1, 2]) {
    const result = await withLedgerV2(() =>
      mobileTrips(viewer.toString(), new URL(`https://test.invalid?page=${page}&date=2026-10-08`))
    );
    expect(result.items).toHaveLength(20);
    expect(result.nextPage).toBe(page === 1 ? 2 : null);
    expect(
      result.items.every((t) => ['USD', 'JPY'].includes(tripV2Schema.parse(t).ledger.baseCurrency))
    ).toBe(true);
  }
  expect(h.probe).toHaveBeenCalledTimes(4);
  expect(h.expenses).toHaveBeenCalledTimes(2);
});
it.each(['expenses', 'payments'])(
  'refuses a corrupted %s unit before computing summaries',
  async (collection) => {
    h.trips.mockResolvedValue([fixture(0, 'USD'), fixture(1, 'JPY')]);
    h.probe.mockResolvedValueOnce(collection === 'expenses' ? { _id: new mongo.ObjectId() } : null);
    if (collection === 'payments') h.probe.mockResolvedValueOnce({ _id: new mongo.ObjectId() });
    await expect(withLedgerV2(() => readMemberTrips(viewer.toString()))).rejects.toThrow(
      'LEDGER_DATA_INVALID'
    );
    expect(h.expenses).not.toHaveBeenCalled();
    expect(h.payments).not.toHaveBeenCalled();
  }
);
it('does no child or summary query for an empty account', async () => {
  h.trips.mockResolvedValue([]);
  expect(await withLedgerV2(() => readMemberTrips(viewer.toString()))).toEqual([]);
  expect(h.probe).not.toHaveBeenCalled();
  expect(h.expenses).not.toHaveBeenCalled();
  expect(h.payments).not.toHaveBeenCalled();
});
