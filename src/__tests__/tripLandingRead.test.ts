import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  trip: vi.fn(),
  tripById: vi.fn(),
  days: vi.fn(),
  aggregate: vi.fn(),
  checklists: vi.fn(),
  expenses: vi.fn(),
  payments: vi.fn(),
  users: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: mocks.session }));
vi.mock('@/models', () => ({
  Trip: { findOne: mocks.trip, findById: mocks.tripById },
  ItineraryDay: { find: mocks.days },
  Expense: { aggregate: mocks.aggregate, find: mocks.expenses },
  Checklist: { find: mocks.checklists },
  Payment: { find: mocks.payments },
  User: { find: mocks.users },
}));
import { getTripLanding } from '@/actions/tripLanding.actions';
import { GET } from '@/app/api/public/trips/[id]/landing/route';
const userId = '507f191e810c19729de860ea';
const tripId = '507f1f77bcf86cd799439011';
function chain(data: unknown) {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    populate: vi.fn(),
    lean: vi.fn().mockResolvedValue(data),
  };
  for (const method of [query.select, query.sort, query.populate]) method.mockReturnValue(query);
  return query;
}
function trip() {
  return {
    _id: tripId,
    hashCode: 'abc12345',
    name: 'Tokyo',
    createdAt: new Date('2026-01-01'),
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-10'),
    members: [{ user: userId, role: 'admin', budget: { total: 999 }, archivedAt: new Date() }],
    legacyBudget: { total: 888 },
    currencySettings: null,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ userId });
  mocks.trip.mockReturnValue(chain(trip()));
  mocks.aggregate.mockResolvedValue([{ expenseCount: 2, todaySpent: 100, totalSpent: 50 }]);
  mocks.days.mockReturnValue(
    chain([
      {
        _id: 'day',
        trip: tripId,
        dayNumber: 1,
        title: 'Day 1',
        content: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        activities: [
          {
            _id: 'act',
            title: 'Flight',
            type: 'flight',
            confirmationCode: 'SECRET',
            attachments: [{ key: 'private-ticket', contentType: 'image/png', size: 10 }],
          },
        ],
      },
    ])
  );
  for (const mock of [mocks.checklists, mocks.expenses, mocks.payments, mocks.users])
    mock.mockReturnValue(chain([]));
});

describe('trip landing authorization and data boundary', () => {
  it('authorizes once and returns member shell plus itinerary without loading expense rows', async () => {
    const result = await getTripLanding('abc12345', '2026-09-05');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(mocks.trip).toHaveBeenCalledExactlyOnceWith({
      hashCode: 'abc12345',
      'members.user': userId,
    });
    expect(mocks.tripById).not.toHaveBeenCalled();
    expect(result.data.shell.role).toBe('admin');
    expect(result.data.shell.total_spent).toBe(50);
    expect(result.data.itinerary[0].activities[0].confirmation_code).toBe('SECRET');
    expect(result.data.checklists).toBeNull();
    expect(result.data.settlement).toBeNull();
    expect(mocks.expenses).not.toHaveBeenCalled();
    expect(mocks.checklists).not.toHaveBeenCalled();
  });

  it('loads only the phase-specific overview and reuses member IDs after the trip', async () => {
    await getTripLanding('abc12345', '2026-08-31');
    expect(mocks.checklists).toHaveBeenCalledOnce();
    expect(mocks.payments).not.toHaveBeenCalled();
    vi.clearAllMocks();
    await getTripLanding('abc12345', '2026-09-11');
    expect(mocks.trip).toHaveBeenCalledOnce();
    expect(mocks.tripById).not.toHaveBeenCalled();
    expect(mocks.users).toHaveBeenCalledWith({ _id: { $in: [userId] } });
    expect(mocks.payments).toHaveBeenCalledOnce();
    expect(mocks.checklists).not.toHaveBeenCalled();
  });

  it('rejects a missing/non-member trip before reading children', async () => {
    mocks.trip.mockReturnValue(chain(null));
    expect(await getTripLanding(tripId)).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(mocks.days).not.toHaveBeenCalled();
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('rejects logged-out authenticated calls without a DB read', async () => {
    mocks.session.mockResolvedValue(null);
    expect(await getTripLanding(tripId)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(mocks.trip).not.toHaveBeenCalled();
  });

  it('public route strips private fields even when the model mock returns them', async () => {
    const res = await GET(
      new NextRequest('https://example.com/api/public/trips/abc12345/landing?date=2026-09-05'),
      { params: Promise.resolve({ id: 'abc12345' }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(mocks.trip).toHaveBeenCalledExactlyOnceWith({ hashCode: 'abc12345' });
    expect(data.trip).toMatchObject({ budget: null, legacy_budget: null, archived_at: null });
    expect(data.shell).toMatchObject({
      role: null,
      budget: null,
      legacy_budget: null,
      total_spent: 0,
    });
    expect(data.itinerary[0].activities[0]).toMatchObject({
      confirmation_code: '',
      attachments: [],
    });
    expect(JSON.stringify(data)).not.toContain('SECRET');
    expect(JSON.stringify(data)).not.toContain('private-ticket');
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it.each([tripId, 'bad!', 'abc', 'abcdefghijkl'])(
    'public route rejects invalid capability %s',
    async (id) => {
      const res = await GET(new NextRequest('https://example.com/landing'), {
        params: Promise.resolve({ id }),
      });
      expect(res.status).toBe(404);
      expect(mocks.trip).not.toHaveBeenCalled();
    }
  );
});
