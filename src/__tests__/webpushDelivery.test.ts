import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  find: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
  error: vi.fn(),
}));
vi.mock('web-push', () => ({ default: { sendNotification: mocks.send } }));
vi.mock('@/models', () => ({ PushSubscription: { find: mocks.find, deleteOne: mocks.remove } }));
vi.mock('@/lib/env', () => ({ getWebPushConfig: mocks.config, getEnv: () => ({}) }));
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }));
vi.mock('next-intl', () => ({ createTranslator: () => () => 'Notification' }));

import { sendPush } from '@/lib/webpush';

const input = {
  recipients: ['user'],
  byId: new Map([['user', { locale: 'en' }]]),
  type: 'expense_added' as const,
  tripHashCode: 'trip-code',
  tripName: 'Trip',
  actorName: 'Actor',
  meta: {},
};
const sub = (id: string) => ({
  _id: id,
  user: 'user',
  endpoint: `https://push.example/${id}`,
  keys: { p256dh: 'secret-key', auth: 'secret-auth' },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockReturnValue({
    subject: 'mailto:test@example.com',
    publicKey: 'public',
    privateKey: 'private',
  });
  mocks.find.mockReturnValue({ lean: async () => [sub('device')] });
  mocks.send.mockResolvedValue({ statusCode: 201 });
  mocks.remove.mockResolvedValue({ deletedCount: 1 });
});

describe('sendPush delivery outcomes', () => {
  it('distinguishes disabled push without touching MongoDB', async () => {
    mocks.config.mockReturnValue(null);
    expect(await sendPush(input)).toEqual({ status: 'disabled', deliveries: [] });
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('reports an empty subscription list as processed', async () => {
    mocks.find.mockReturnValue({ lean: async () => [] });
    expect(await sendPush(input)).toEqual({ status: 'processed', deliveries: [] });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not disguise a query failure as successful delivery', async () => {
    mocks.find.mockReturnValue({
      lean: async () => {
        throw new Error('DB unavailable');
      },
    });
    expect(await sendPush(input)).toEqual({ status: 'failed', deliveries: [] });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reports mixed device outcomes without retrying or exposing subscription secrets', async () => {
    mocks.find.mockReturnValue({
      lean: async () => [sub('accepted'), sub('expired'), sub('failed')],
    });
    mocks.send.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint.endsWith('/expired')) throw { statusCode: 410 };
      if (endpoint.endsWith('/failed')) throw { statusCode: 503 };
      return { statusCode: 201 };
    });
    const result = await sendPush(input);
    expect(result).toEqual({
      status: 'processed',
      deliveries: [
        { subscriptionId: 'accepted', status: 'accepted' },
        { subscriptionId: 'expired', status: 'expired', statusCode: 410 },
        { subscriptionId: 'failed', status: 'failed', statusCode: 503 },
      ],
    });
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ _id: 'expired' });
    expect(JSON.stringify(result)).not.toMatch(/https:|secret/);
  });

  it.each([404, 410])('keeps expired status on cleanup failure (%s)', async (statusCode) => {
    mocks.send.mockRejectedValue({ statusCode });
    mocks.remove.mockRejectedValue(new Error('cleanup unavailable'));
    expect(await sendPush(input)).toEqual({
      status: 'processed',
      deliveries: [
        { subscriptionId: 'device', status: 'expired', statusCode, cleanupFailed: true },
      ],
    });
  });

  it.each([null, new Error('timeout'), { statusCode: 429 }, { statusCode: 403 }])(
    'retains failed subscriptions for policy decisions (%s)',
    async (error) => {
      mocks.send.mockRejectedValue(error);
      const result = await sendPush(input);
      expect(result.status).toBe('processed');
      expect(result.deliveries).toEqual([
        expect.objectContaining({ subscriptionId: 'device', status: 'failed' }),
      ]);
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.send).toHaveBeenCalledTimes(1);
    }
  );
});
