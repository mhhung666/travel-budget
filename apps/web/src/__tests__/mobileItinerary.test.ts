// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { itinerarySchema } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({ member: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ getMemberTrip: h.member }));
vi.mock('@/lib/itineraryRead', () => ({ readItinerary: h.read }));
import { mobileItinerary } from '@/lib/mobile/itinerary';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
const actor = 'a'.repeat(24),
  tripId = 'b'.repeat(24);
const id = (n: number) => n.toString(16).padStart(24, '0');
const activity = (n: number, time: string | null) => ({
  id: id(n),
  revision: 0,
  title: `Activity ${n}`,
  time,
  end_time: null,
  type: 'food',
  note: 'Long note\n第二行',
  location: null,
  location_name: '市場',
  confirmation_code: 'BOOKING',
  attachments: [{ key: 'itinerary/SECRET', content_type: 'image/png', size: 5 }],
});
const day = (n: number) => ({
  id: id(n + 100),
  trip_id: tripId,
  day_number: n,
  revision: 0,
  title: `Day ${n}`,
  content: '# Day notes\n- original text',
  location: null,
  activities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});
beforeEach(() => {
  vi.resetAllMocks();
  h.member.mockResolvedValue({
    membership: { tripId, role: 'member' },
    trip: { startDate: new Date('2028-02-28'), endDate: new Date('2028-03-01') },
  });
  h.read.mockResolvedValue([]);
});
it.each(['share-code', 'x', '0'.repeat(24)])(
  'rejects malformed, missing, and nonmember trips before reading %s',
  async (input) => {
    h.member.mockResolvedValue(null);
    await expect(mobileItinerary(actor, input)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(h.read).not.toHaveBeenCalled();
  }
);
it('uses the shared Web reader, preserves gaps/leap dates and stably sorts activities with untimed last', async () => {
  h.read.mockResolvedValue([
    {
      ...day(1),
      activities: [
        activity(1, null),
        activity(2, '10:00'),
        activity(3, '08:00'),
        activity(4, '10:00'),
        activity(5, null),
      ],
    },
    day(2),
    day(4),
  ]);
  const value = await mobileItinerary(actor, tripId);
  expect(h.member).toHaveBeenCalledWith(actor, tripId, '_id startDate endDate');
  expect(h.read).toHaveBeenCalledWith(tripId, true);
  expect(value.days.map((d) => [d.dayNumber, d.date, d.outsideTripRange])).toEqual([
    [1, '2028-02-28', false],
    [2, '2028-02-29', false],
    [4, '2028-03-02', true],
  ]);
  expect(value.days[0].activities.map((a) => a.id)).toEqual([3, 2, 4, 1, 5].map(id));
  expect(value.days[0].activities[0]).toMatchObject({
    locationName: '市場',
    confirmationCode: 'BOOKING',
    note: 'Long note\n第二行',
  });
  expect(JSON.stringify(value)).not.toMatch(/attachments|SECRET|uploadedBy|revision|created_at/);
  expect(value.days[0].content).toBe('# Day notes\n- original text');
});
it('keeps unscheduled days numbered without inventing calendar dates', async () => {
  h.member.mockResolvedValue({ trip: { startDate: null, endDate: null }, membership: { tripId } });
  h.read.mockResolvedValue([day(5)]);
  expect((await mobileItinerary(actor, tripId)).days[0]).toMatchObject({
    dayNumber: 5,
    date: null,
    outsideTripRange: false,
  });
});
it('returns no-store and Vary Authorization, with no ledger amounts on an empty itinerary', async () => {
  const response = await apiLedgerResponse(v2Output.none(itinerarySchema), () =>
    mobileItinerary(actor, tripId)
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('vary')).toBe('Authorization');
  expect((await response.json()).data).toEqual({
    tripId,
    startDate: '2028-02-28',
    endDate: '2028-03-01',
    days: [],
  });
});
it('does not convert a failed private read into public data or an empty successful itinerary', async () => {
  h.read.mockRejectedValue(new Error('database unavailable'));
  const response = await apiLedgerResponse(v2Output.none(itinerarySchema), () =>
    mobileItinerary(actor, tripId)
  );
  expect(response.status).toBe(500);
  expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
});
