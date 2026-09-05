import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ trip: vi.fn(), users: vi.fn(), insert: vi.fn(), push: vi.fn() }));
vi.mock('@/models', () => ({
  Trip: { findById: mocks.trip },
  User: { find: mocks.users },
  Notification: { insertMany: mocks.insert },
}));
vi.mock('@/lib/webpush', () => ({ sendPush: mocks.push }));
vi.mock('@/lib/env', () => ({ getResendConfig: () => null }));
vi.mock('@/lib/email', () => ({ sendEmailBatch: vi.fn() }));
vi.mock('@/lib/emailTemplates', () => ({ buildNotificationEmail: vi.fn() }));
import { notify } from '@/lib/notify';

const snapshot = {
  id: 'trip',
  name: 'Snapshot',
  hashCode: 'code',
  memberIds: ['actor', 'real', 'virtual', 'real'],
};
const query = (value: unknown) => ({ select: () => ({ lean: async () => value }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trip.mockReturnValue(
    query({ name: 'Fresh', hashCode: 'fresh', members: [{ user: 'real' }] })
  );
  mocks.users.mockReturnValue(
    query([
      { _id: 'actor', displayName: 'Actor' },
      { _id: 'real', displayName: 'Real', isVirtual: false },
      { _id: 'virtual', displayName: 'Virtual', isVirtual: true },
    ])
  );
  mocks.insert.mockResolvedValue([]);
  mocks.push.mockResolvedValue(undefined);
});

describe('notification trip snapshot', () => {
  it('skips the duplicate Trip read but still resolves users and filters recipients', async () => {
    await notify({
      tripId: 'trip',
      actorId: 'actor',
      type: 'expense_added',
      tripSnapshot: snapshot,
    });
    expect(mocks.trip).not.toHaveBeenCalled();
    expect(mocks.users).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        user: 'real',
        trip: 'trip',
        tripName: 'Snapshot',
        actorName: 'Actor',
      }),
    ]);
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['real'], tripHashCode: 'code' })
    );
  });

  it.each([undefined, { ...snapshot, id: 'another-trip' }])(
    'reads Trip when snapshot is absent or mismatched',
    async (tripSnapshot) => {
      await notify({ tripId: 'trip', actorId: 'actor', type: 'expense_added', tripSnapshot });
      expect(mocks.trip).toHaveBeenCalledWith('trip');
      expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({ tripName: 'Fresh' })]);
    }
  );

  it('preserves explicit recipient overrides', async () => {
    await notify({
      tripId: 'trip',
      actorId: 'actor',
      type: 'expense_added',
      tripSnapshot: snapshot,
      recipientIds: ['actor'],
    });
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
