import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ trip: vi.fn(), users: vi.fn(), insert: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/tripWriteTransaction', async (original) => ({
  ...(await original<typeof import('@/lib/tripWriteTransaction')>()),
  withTripWrite: (_trip: string, _actor: string, write: (session: unknown) => Promise<unknown>) =>
    write(undefined),
}));
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
const query = (value: unknown) => {
  const q = { session: () => q, select: () => ({ lean: async () => value }) };
  return q;
};

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
  it('rechecks the current Trip even when a stale snapshot is supplied', async () => {
    await notify({
      tripId: 'trip',
      actorId: 'actor',
      type: 'expense_added',
      tripSnapshot: snapshot,
    });
    expect(mocks.trip).toHaveBeenCalledWith('trip');
    expect(mocks.users).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user: 'real',
          trip: 'trip',
          tripName: 'Fresh',
          actorName: 'Actor',
        }),
      ],
      { session: undefined }
    );
    expect(mocks.push).toHaveBeenCalledWith(
      expect.objectContaining({ recipients: ['real'], tripHashCode: 'fresh' })
    );
  });

  it.each([undefined, { ...snapshot, id: 'another-trip' }])(
    'reads Trip when snapshot is absent or mismatched',
    async (tripSnapshot) => {
      await notify({ tripId: 'trip', actorId: 'actor', type: 'expense_added', tripSnapshot });
      expect(mocks.trip).toHaveBeenCalledWith('trip');
      expect(mocks.insert).toHaveBeenCalledWith([expect.objectContaining({ tripName: 'Fresh' })], {
        session: undefined,
      });
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
