import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbConnect: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ dbConnect: mocks.dbConnect }));
vi.mock('@/models', () => ({
  AiImportUsage: {
    findOneAndUpdate: mocks.findOneAndUpdate,
    updateOne: mocks.updateOne,
  },
}));

import {
  estimateItineraryImportCostMicroUsd,
  ItineraryImportQuotaError,
  reserveItineraryImportQuota,
  resolveItineraryImportQuotaConfig,
  settleItineraryImportQuota,
} from '@/lib/ai/itineraryImportQuota';

function successfulQuery() {
  return { lean: vi.fn().mockResolvedValue({ _id: 'usage' }) };
}

describe('persistent itinerary import quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbConnect.mockResolvedValue(undefined);
    mocks.findOneAndUpdate.mockImplementation(() => successfulQuery());
    mocks.updateOne.mockResolvedValue({ acknowledged: true });
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

  it('atomically reserves global, user, and trip UTC-day buckets', async () => {
    const reservation = await reserveItineraryImportQuota({
      userId: 'user-1',
      tripId: 'trip-1',
      now: new Date('2026-09-10T23:59:00.000Z'),
    });

    expect(mocks.dbConnect).toHaveBeenCalledTimes(1);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(reservation.periodStart.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(reservation.scopes).toEqual([
      { scope: 'global', scopeKey: 'all' },
      { scope: 'user', scopeKey: 'user-1' },
      { scope: 'trip', scopeKey: 'trip-1' },
    ]);
  });

  it('rolls back earlier scopes when a later scope is limited', async () => {
    mocks.findOneAndUpdate
      .mockImplementationOnce(() => successfulQuery())
      .mockImplementationOnce(() => ({
        lean: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 })),
      }));

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
