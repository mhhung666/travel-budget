// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  member: vi.fn(),
  shell: vi.fn(),
  summary: vi.fn(),
}));
vi.mock('@/lib/tripListRead', () => ({ readMemberTrips: mocks.list }));
vi.mock('@/lib/permissions', () => ({ getMemberTrip: mocks.member }));
vi.mock('@/lib/tripShellRead', () => ({ readTripShell: mocks.shell }));
vi.mock('@/lib/tripListSummary', () => ({ readTripListSummaries: mocks.summary }));
import { mobileLanding, mobileTrips, viewerDate } from '@/lib/mobile/trips';
const id = '507f191e810c19729de860ea';
const trip = {
  id,
  name: 'Tokyo',
  description: null,
  start_date: '2026-10-01',
  end_date: '2026-10-10',
  destination_location: { name: 'Tokyo' },
  archived_at: null,
  member_count: 2,
  my_spent: 12.34,
  my_balance: -5.67,
  hash_code: 'private-code',
  budget: { total: 100 },
  legacy_budget: { total: 999 },
};
beforeEach(() => {
  vi.clearAllMocks();
});
describe('mobile member reads', () => {
  it('returns only explicitly allowed fields and keeps cent amounts unchanged', async () => {
    mocks.list.mockResolvedValue([trip]);
    const result = await mobileTrips(id, new URL('https://example.com?date=2026-10-02'));
    expect(mocks.list).toHaveBeenCalledWith(id);
    expect(result.items[0]).toMatchObject({ mySpent: 12.34, myBalance: -5.67, phase: 'ongoing' });
    expect(JSON.stringify(result)).not.toMatch(/hash_code|budget|private-code|legacy/);
  });
  it('prioritizes current trips, then future trips; archives come last', async () => {
    mocks.list.mockResolvedValue([
      { ...trip, name: 'Archived', archived_at: '2026-01-01' },
      { ...trip, name: 'Future', start_date: '2027-01-01', end_date: '2027-01-10' },
      trip,
    ]);
    const result = await mobileTrips(id, new URL('https://example.com?date=2026-10-02'));
    expect(result.items.map((item) => item.name)).toEqual(['Tokyo', 'Future', 'Archived']);
  });
  it('paginates without truncating the account list', async () => {
    mocks.list.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({ ...trip, name: String(index) }))
    );
    expect((await mobileTrips(id, new URL('https://example.com?page=1'))).nextPage).toBe(2);
    const second = await mobileTrips(id, new URL('https://example.com?page=2'));
    expect(second.items).toHaveLength(1);
    expect(second.nextPage).toBeNull();
  });
  it('rejects non-members before reading financial summaries; never falls back to public share codes', async () => {
    mocks.member.mockResolvedValue(null);
    await expect(mobileLanding(id, id, '2026-10-02')).rejects.toMatchObject({ status: 404 });
    await expect(mobileLanding(id, 'abc12345', '2026-10-02')).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.member).toHaveBeenCalledTimes(1);
    expect(mocks.shell).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it('returns only the viewer budget and excludes member profiles, share codes and attachments', async () => {
    mocks.member.mockResolvedValue({
      membership: { role: 'member' },
      trip: {
        _id: id,
        name: 'Tokyo',
        createdAt: new Date(),
        hashCode: 'share-secret',
        members: [
          { user: id, budget: { total: 100 } },
          { user: 'other', budget: { total: 999 } },
        ],
      },
    });
    mocks.shell.mockResolvedValue({
      member_count: 2,
      total_spent: 12.34,
      expense_count: 3,
      today_spent: 50.55,
      budget: { total: 100 },
    });
    mocks.summary.mockResolvedValue(new Map([[id, { myBalance: -5.67 }]]));
    const result = await mobileLanding(id, id, '2026-10-02');
    expect(result).toMatchObject({
      budgetTotal: 100,
      mySpent: 12.34,
      todayGroupSpent: 50.55,
      myBalance: -5.67,
    });
    expect(JSON.stringify(result)).not.toMatch(/999|share-secret|members|attachments/);
  });
  it('validates calendar dates and page numbers', async () => {
    expect(() => viewerDate(new URL('https://example.com?date=2026-02-30'))).toThrow();
    await expect(mobileTrips(id, new URL('https://example.com?page=-1'))).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
