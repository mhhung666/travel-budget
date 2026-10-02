import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbConnect: vi.fn(),
  init: vi.fn(),
  findOneAndUpdate: vi.fn(),
  create: vi.fn(),
  updateOne: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ dbConnect: mocks.dbConnect }));
vi.mock('@/models', () => ({
  AiImportUsage: {
    init: mocks.init,
    findOneAndUpdate: mocks.findOneAndUpdate,
    create: mocks.create,
    updateOne: mocks.updateOne,
    findOne: mocks.findOne,
  },
}));

import {
  estimateItineraryImportCostMicroUsd,
  ItineraryImportQuotaError,
  reserveItineraryImportQuota,
  resolveItineraryImportQuotaConfig,
  settleItineraryImportQuota,
} from '@/lib/ai/itineraryImportQuota';
import { getAiUsageQuotaSummary } from '@/lib/ai/aiUsageQuota';

function successfulQuery() {
  return { lean: vi.fn().mockResolvedValue({ _id: 'usage' }) };
}

function emptyQuery() {
  return { lean: vi.fn().mockResolvedValue(null) };
}

describe('persistent itinerary import quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbConnect.mockResolvedValue(undefined);
    mocks.init.mockResolvedValue(undefined);
    mocks.findOneAndUpdate.mockImplementation(() => successfulQuery());
    mocks.create.mockResolvedValue({ _id: 'usage' });
    mocks.updateOne.mockResolvedValue({ acknowledged: true });
    mocks.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
  });

  it('uses conservative low-traffic request defaults and validates cost reservation', () => {
    expect(resolveItineraryImportQuotaConfig({})).toMatchObject({
      userRequests: 5,
      tripRequests: 10,
      globalRequests: 50,
      dailyCostLimitMicroUsd: 0,
    });
    expect(() =>
      resolveItineraryImportQuotaConfig({
        AI_IMPORT_DAILY_COST_LIMIT_MICRO_USD: '1000',
        AI_IMPORT_REQUEST_COST_RESERVE_MICRO_USD: '0',
      })
    ).toThrow(ItineraryImportQuotaError);
  });

  it('prefers shared AI environment names while accepting legacy import names', () => {
    expect(
      resolveItineraryImportQuotaConfig({
        AI_DAILY_USER_REQUESTS: '7',
        AI_IMPORT_DAILY_USER_REQUESTS: '9',
        AI_IMPORT_DAILY_TRIP_REQUESTS: '11',
      })
    ).toMatchObject({ userRequests: 7, tripRequests: 11 });
  });

  it('reports the current user bucket and next UTC reset without reserving usage', async () => {
    const lean = vi.fn().mockResolvedValue({ requests: 3 });
    const select = vi.fn().mockReturnValue({ lean });
    mocks.findOne.mockReturnValue({ select });

    const summary = await getAiUsageQuotaSummary({
      userId: 'user-1',
      now: new Date('2026-09-10T23:59:00.000Z'),
    });

    expect(mocks.findOne).toHaveBeenCalledWith({
      scope: 'user',
      scopeKey: 'user-1',
      periodStart: new Date('2026-09-10T00:00:00.000Z'),
    });
    expect(select).toHaveBeenCalledWith('requests');
    expect(summary).toEqual({
      usedRequests: 3,
      requestLimit: 5,
      remainingRequests: 2,
      periodStart: new Date('2026-09-10T00:00:00.000Z'),
      resetsAt: new Date('2026-09-11T00:00:00.000Z'),
    });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('atomically reserves global, user, and trip UTC-day buckets', async () => {
    const reservation = await reserveItineraryImportQuota({
      userId: 'user-1',
      tripId: 'trip-1',
      now: new Date('2026-09-10T23:59:00.000Z'),
    });

    expect(mocks.dbConnect).toHaveBeenCalledTimes(1);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ $expr: expect.anything() }),
      expect.anything(),
      { returnDocument: 'after' }
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(reservation.periodStart.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(reservation.scopes).toEqual([
      { scope: 'global', scopeKey: 'all' },
      { scope: 'user', scopeKey: 'user-1' },
      { scope: 'trip', scopeKey: 'trip-1' },
    ]);
  });

  it('creates missing UTC-day buckets without combining $expr and upsert', async () => {
    mocks.findOneAndUpdate.mockImplementation(() => emptyQuery());

    await reserveItineraryImportQuota({
      userId: 'user-1',
      tripId: 'trip-1',
      now: new Date('2026-09-10T12:00:00.000Z'),
    });

    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'global',
        scopeKey: 'all',
        requests: 1,
        reservedMicroUsd: 0,
      })
    );
    for (const [, , options] of mocks.findOneAndUpdate.mock.calls) {
      expect(options).not.toHaveProperty('upsert');
    }
  });

  it('retries the conditional update when another request creates the bucket first', async () => {
    mocks.findOneAndUpdate
      .mockImplementationOnce(() => emptyQuery())
      .mockImplementationOnce(() => successfulQuery());
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(
      reserveItineraryImportQuota({ userId: 'user-1', tripId: 'trip-1' })
    ).resolves.toMatchObject({
      scopes: [
        { scope: 'global', scopeKey: 'all' },
        { scope: 'user', scopeKey: 'user-1' },
        { scope: 'trip', scopeKey: 'trip-1' },
      ],
    });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(4);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('rolls back earlier scopes when a later scope is limited', async () => {
    mocks.findOneAndUpdate
      .mockImplementationOnce(() => successfulQuery())
      .mockImplementationOnce(() => emptyQuery())
      .mockImplementationOnce(() => emptyQuery());
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(
      reserveItineraryImportQuota({ userId: 'user-1', tripId: 'trip-1' })
    ).rejects.toMatchObject({ code: 'USAGE_LIMITED' });
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'global', scopeKey: 'all' }),
      { $inc: { requests: -1, reservedMicroUsd: -0 } }
    );
  });

  it('settles token and configured micro-USD usage without source content', async () => {
    const config = resolveItineraryImportQuotaConfig({
      AI_IMPORT_INPUT_MICRO_USD_PER_MILLION_TOKENS: '100000',
      AI_IMPORT_OUTPUT_MICRO_USD_PER_MILLION_TOKENS: '400000',
    });
    expect(
      estimateItineraryImportCostMicroUsd({ inputTokens: 1000, outputTokens: 500 }, config)
    ).toBe(300);

    const reservation = {
      periodStart: new Date('2026-09-10T00:00:00.000Z'),
      reservedMicroUsd: 500,
      scopes: [{ scope: 'global' as const, scopeKey: 'all' }],
    };
    await settleItineraryImportQuota(reservation, {
      success: true,
      usage: { inputTokens: 1000, outputTokens: 500 },
    });

    expect(mocks.updateOne).toHaveBeenCalledWith(expect.anything(), {
      $inc: expect.objectContaining({
        reservedMicroUsd: -500,
        inputTokens: 1000,
        outputTokens: 500,
        successfulRequests: 1,
      }),
    });
  });

  it('charges the reservation conservatively when a provider failure omits usage', async () => {
    const reservation = {
      periodStart: new Date('2026-09-10T00:00:00.000Z'),
      reservedMicroUsd: 750,
      scopes: [{ scope: 'global' as const, scopeKey: 'all' }],
    };

    const result = await settleItineraryImportQuota(reservation, { success: false });

    expect(result).toEqual({ costMicroUsd: 750 });
    expect(mocks.updateOne).toHaveBeenCalledWith(expect.anything(), {
      $inc: expect.objectContaining({
        reservedMicroUsd: -750,
        spentMicroUsd: 750,
        failedRequests: 1,
      }),
    });
  });
});
