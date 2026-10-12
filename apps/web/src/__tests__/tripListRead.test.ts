// @vitest-environment node
import { tripV2Schema, tripsV2Schema } from '@travel-budget/contracts';
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
it.each([1, 20, 40, 200])(
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

const sortedFixture = (n: number, start: string | null, end: string | null, archived = false) => ({
  ...fixture(n),
  _id: new mongo.ObjectId(n.toString(16).padStart(24, '0')),
  startDate: start ? new Date(start) : null,
  endDate: end ? new Date(end) : null,
  members: [
    { user: viewer, role: 'member', ...(archived ? { archivedAt: new Date('2026-01-01') } : {}) },
  ],
});
const list = async (query: string) =>
  tripsV2Schema.parse(
    await withLedgerV2(() =>
      mobileTrips(viewer.toString(), new URL(`https://test.invalid?date=2026-10-12&${query}`))
    )
  );
it('filters before paging and returns full counts/decision on later and empty pages', async () => {
  const rows = Array.from({ length: 85 }, (_, n) =>
    sortedFixture(n + 1, '2025-01-01', '2025-01-02', n < 42)
  );
  h.trips.mockResolvedValue(rows);
  const first = await list('archive=unarchived&sort=list');
  const second = await list('archive=unarchived&sort=list&page=2');
  const third = await list('archive=unarchived&sort=list&page=3');
  const empty = await list('archive=unarchived&sort=list&page=4');
  expect([first.items.length, second.items.length, third.items.length, empty.items.length]).toEqual(
    [20, 20, 3, 0]
  );
  expect([first.nextPage, second.nextPage, third.nextPage, empty.nextPage]).toEqual([
    2,
    3,
    null,
    null,
  ]);
  const ids = [...first.items, ...second.items, ...third.items].map((t) => t.id);
  expect(ids).toEqual(rows.slice(42).map((t) => t._id.toString()));
  expect(new Set(ids).size).toBe(43);
  for (const result of [first, second, third, empty]) {
    expect(result.metadata?.counts).toEqual({ unarchived: 43, archived: 42 });
    expect(result.metadata?.quickAdd).toEqual({
      candidateCount: 43,
      ongoingCount: 0,
      directTripId: null,
    });
  }
  const archivedPages = await Promise.all(
    [1, 2, 3].map((page) => list(`archive=archived&sort=list&page=${page}`))
  );
  expect(archivedPages.map((p) => p.items.length)).toEqual([20, 20, 2]);
  expect(archivedPages.flatMap((p) => p.items).every((t) => t.archived)).toBe(true);
  // Five database operations per HTTP request, including full child validation and summaries.
  expect(h.find).toHaveBeenCalledTimes(7);
  expect(h.probe).toHaveBeenCalledTimes(14);
  expect(h.expenses).toHaveBeenCalledTimes(7);
  expect(h.payments).toHaveBeenCalledTimes(7);
});
it('matches Web grouping across years/partial dates and does not pin archived trips', async () => {
  h.trips.mockResolvedValue([
    sortedFixture(1, null, null),
    sortedFixture(2, '2024-12-31', '2025-01-02'),
    sortedFixture(3, '2026-10-12', '2026-10-12'),
    sortedFixture(4, '2027-01-01', null),
    sortedFixture(5, '2026-10-13', '2026-10-14'),
    sortedFixture(6, '2026-01-01', null),
    sortedFixture(7, null, '2026-10-11'),
  ]);
  const result = await list('archive=unarchived&sort=list');
  expect(result.items.map((t) => t.name)).toEqual([
    'Trip 3',
    'Trip 5',
    'Trip 4',
    'Trip 6',
    'Trip 2',
    'Trip 1',
    'Trip 7',
  ]);
  expect(result.metadata?.quickAdd).toEqual({
    candidateCount: 7,
    ongoingCount: 1,
    directTripId: new mongo.ObjectId('000000000000000000000003').toString(),
  });
  h.trips.mockResolvedValue([
    sortedFixture(1, '2025-01-01', '2025-01-02', true),
    sortedFixture(2, '2026-10-12', '2026-10-12', true),
    sortedFixture(3, '2027-01-01', null, true),
  ]);
  expect((await list('archive=archived&sort=list')).items.map((t) => t.name)).toEqual([
    'Trip 3',
    'Trip 2',
    'Trip 1',
  ]);
});
it('quick-add uses full candidates, calendar end day, and Web ordering', async () => {
  const rows = [
    sortedFixture(1, null, null),
    sortedFixture(2, '2026-10-13', null),
    sortedFixture(3, '2026-10-10', '2026-10-12'),
    sortedFixture(4, null, '2026-10-11'),
    sortedFixture(5, '2026-10-10', '2026-10-11'),
    sortedFixture(6, '2026-10-10', '2026-10-12', true),
  ];
  const ongoingId = rows[2]._id.toString();
  h.trips.mockResolvedValue(rows);
  const result = await list('archive=unarchived&sort=quick-add');
  expect(result.items.map((t) => t.name)).toEqual([
    'Trip 3',
    'Trip 2',
    'Trip 4',
    'Trip 5',
    'Trip 1',
  ]);
  expect(result.metadata?.quickAdd).toEqual({
    candidateCount: 5,
    ongoingCount: 1,
    directTripId: ongoingId,
  });
  const empty = await list('archive=unarchived&sort=quick-add&page=2');
  expect(empty.items).toEqual([]);
  expect(empty.metadata?.quickAdd).toEqual(result.metadata?.quickAdd);
});
it('detects one candidate beyond legacy first-page archived trips, all archived and zero trips', async () => {
  const archived = Array.from({ length: 41 }, (_, n) =>
    sortedFixture(n + 1, '2026-10-12', '2026-10-12', true)
  );
  const only = sortedFixture(42, null, null);
  h.trips.mockResolvedValue([...archived, only]);
  expect((await list('archive=unarchived&sort=quick-add')).metadata?.quickAdd).toEqual({
    candidateCount: 1,
    ongoingCount: 0,
    directTripId: only._id.toString(),
  });
  h.trips.mockResolvedValue(archived);
  const result = await list('archive=unarchived&sort=quick-add');
  expect(result.items).toEqual([]);
  expect(result.metadata?.counts).toEqual({ unarchived: 0, archived: 41 });
  expect(result.metadata?.quickAdd).toEqual({
    candidateCount: 0,
    ongoingCount: 0,
    directTripId: null,
  });
  h.trips.mockResolvedValue([]);
  expect((await list('archive=unarchived&sort=list')).metadata?.counts).toEqual({
    unarchived: 0,
    archived: 0,
  });
});
it('multiple ongoing trips never guess uniqueness from a page', async () => {
  const rows = Array.from({ length: 41 }, (_, n) =>
    sortedFixture(n + 1, '2026-10-01', '2026-10-13')
  );
  h.trips.mockResolvedValue(rows);
  const result = await list('archive=unarchived&sort=quick-add');
  expect(result.items).toHaveLength(20);
  expect(result.metadata?.quickAdd).toEqual({
    candidateCount: 41,
    ongoingCount: 41,
    directTripId: null,
  });
});
it('keeps legacy mixed ordering when new parameters are absent', async () => {
  h.trips.mockResolvedValue([
    sortedFixture(1, null, null),
    sortedFixture(2, '2025-01-01', '2025-01-02'),
    sortedFixture(3, '2026-10-12', '2026-10-12', true),
    sortedFixture(4, '2026-10-12', '2026-10-12'),
    sortedFixture(5, '2026-10-13', null),
  ]);
  expect((await list('')).items.map((t) => t.name)).toEqual([
    'Trip 4',
    'Trip 5',
    'Trip 1',
    'Trip 2',
    'Trip 3',
  ]);
});
it.each([
  'archive=invalid',
  'sort=invalid',
  'page=0',
  'page=1000000',
  'page=1.2',
  'archive=unarchived&archive=archived',
  'sort=list&sort=legacy',
  'date=2026-10-13',
  'sort=quick-add',
  'archive=archived&sort=quick-add',
])('rejects invalid or ambiguous parameters without reading the database: %s', async (query) => {
  await expect(list(query)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  expect(h.find).not.toHaveBeenCalled();
});

it('T3b ranks a page-two preference before pagination only in its group, without changing uniqueness or DB cost', async () => {
  const rows = Array.from({ length: 41 }, (_, n) =>
    sortedFixture(n + 1, '2026-10-20', '2026-10-22')
  );
  const ongoing = sortedFixture(50, '2026-10-12', '2026-10-12');
  h.trips.mockResolvedValue([ongoing, ...rows]);
  const baseline = await list('archive=unarchived&sort=quick-add');
  const preferred = rows[40]._id.toString();
  expect(baseline.items.some((t) => t.id === preferred)).toBe(false);
  const result = await list(`archive=unarchived&sort=quick-add&preferred_trip_id=${preferred}`);
  expect(result.items[0].id).toBe(ongoing._id.toString());
  expect(result.items[1].id).toBe(preferred);
  expect(result.metadata?.preferredTripId).toBe(preferred);
  expect(result.metadata?.quickAdd).toEqual(baseline.metadata?.quickAdd);
  expect(h.find).toHaveBeenCalledTimes(2);
  expect(h.probe).toHaveBeenCalledTimes(4);
  expect(h.expenses).toHaveBeenCalledTimes(2);
  expect(h.payments).toHaveBeenCalledTimes(2);
  rows[40].members[0].archivedAt = new Date('2026-10-10');
  const archived = await list(`archive=unarchived&sort=quick-add&preferred_trip_id=${preferred}`);
  expect(archived.items.some((t) => t.id === preferred)).toBe(false);
  const absent = 'f'.repeat(24);
  const missing = await list(`archive=unarchived&sort=quick-add&preferred_trip_id=${absent}`);
  expect(missing.items.map((t) => t.id)).toEqual(archived.items.map((t) => t.id));
});
it.each([
  'preferred_trip_id=bad&archive=unarchived&sort=quick-add',
  'preferred_trip_id=aaaaaaaaaaaaaaaaaaaaaaaa&sort=list',
  'preferred_trip_id=aaaaaaaaaaaaaaaaaaaaaaaa&preferred_trip_id=bbbbbbbbbbbbbbbbbbbbbbbb&archive=unarchived&sort=quick-add',
])('rejects invalid T3b preference query: %s', async (query) => {
  await expect(list(query)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  expect(h.find).not.toHaveBeenCalled();
});
