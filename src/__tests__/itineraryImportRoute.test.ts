import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  loadContext: vi.fn(),
  parseImport: vi.fn(),
  createItineraryDay: vi.fn(),
  updateItineraryDay: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  reserveQuota: vi.fn(),
  settleQuota: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }));
vi.mock('@/lib/ai/itineraryImportContext', () => ({
  loadItineraryImportContext: mocks.loadContext,
}));
vi.mock('@/lib/ai/itineraryImportProvider', () => {
  class ItineraryImportProviderError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }

  return {
    ItineraryImportProviderError,
    parseItineraryImport: mocks.parseImport,
  };
});
vi.mock('@/actions/itinerary.actions', () => ({
  createItineraryDay: mocks.createItineraryDay,
  updateItineraryDay: mocks.updateItineraryDay,
}));
vi.mock('@/lib/ai/itineraryImportQuota', () => {
  class ItineraryImportQuotaError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }
  return {
    ItineraryImportQuotaError,
    reserveItineraryImportQuota: mocks.reserveQuota,
    settleItineraryImportQuota: mocks.settleQuota,
  };
});
vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ItineraryImportProviderError } from '@/lib/ai/itineraryImportProvider';
import { ItineraryImportQuotaError } from '@/lib/ai/itineraryImportQuota';
import { POST } from '@/app/api/ai/itinerary-import/route';

const context = {
  tripStartDate: '2026-09-01',
  tripEndDate: '2026-09-05',
  existingDays: [
    {
      date: '2026-09-01',
      activities: [{ time: '09:00', title: '博物館' }],
    },
  ],
};

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/itinerary-import', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function responseBody(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('POST /api/ai/itinerary-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 'user-1', username: 'admin' });
    mocks.loadContext.mockResolvedValue({ status: 'ok', tripId: 'trip-1', context });
    mocks.reserveQuota.mockResolvedValue({
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      reservedMicroUsd: 0,
      scopes: [],
    });
    mocks.settleQuota.mockResolvedValue({ costMicroUsd: 0 });
    mocks.parseImport.mockResolvedValue({
      draft: {
        sourceSummary: '第一天參觀博物館',
        days: [
          {
            relativeDay: 1,
            activities: [{ time: '09:00', title: '博物館', type: 'sightseeing' }],
          },
        ],
        warnings: [],
      },
      provider: 'vercel',
      model: 'openai/test-model',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  });

  it('rejects unauthenticated requests before reading trip context or calling the provider', async () => {
    mocks.getSessionFromRequest.mockResolvedValue(null);

    const response = await POST(request({ tripId: 'trip-1', sourceText: 'Day 1 博物館' }));

    expect(response.status).toBe(401);
    expect(await responseBody(response)).toMatchObject({
      success: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(mocks.loadContext).not.toHaveBeenCalled();
    expect(mocks.parseImport).not.toHaveBeenCalled();
  });

  it('rejects a non-admin before calling the provider', async () => {
    mocks.loadContext.mockResolvedValue({ status: 'forbidden' });

    const response = await POST(request({ tripId: 'trip-1', sourceText: 'Day 1 博物館' }));

    expect(response.status).toBe(403);
    expect(await responseBody(response)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(mocks.parseImport).not.toHaveBeenCalled();
  });

  it('returns a structured internal error when trip context cannot be read', async () => {
    mocks.loadContext.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(request({ tripId: 'trip-1', sourceText: 'Day 1 博物館' }));

    expect(response.status).toBe(500);
    expect(await responseBody(response)).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(mocks.parseImport).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain('database unavailable');
  });

  it('rejects invalid and over-limit input before loading trip data', async () => {
    const invalidResponse = await POST(request({ tripId: 'trip-1', sourceText: '' }));
    expect(invalidResponse.status).toBe(400);
    expect(await responseBody(invalidResponse)).toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });

    const longResponse = await POST(request({ tripId: 'trip-1', sourceText: '旅'.repeat(30_001) }));
    expect(longResponse.status).toBe(413);
    expect(await responseBody(longResponse)).toMatchObject({
      error: { code: 'SOURCE_TOO_LONG' },
    });
    expect(mocks.loadContext).not.toHaveBeenCalled();
    expect(mocks.parseImport).not.toHaveBeenCalled();
  });

  it('normalizes a schema-valid draft and never invokes itinerary write actions', async () => {
    const sourceText = 'Day 1 09:00 博物館，確認碼 SECRET-PNR';
    const response = await POST(request({ tripId: 'trip-code', sourceText, locale: 'zh' }));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      draft: {
        days: [{ date: '2026-09-01' }],
        warnings: [
          { code: 'EXISTING_DAY_APPEND', dayIndex: 0 },
          { code: 'POSSIBLE_DUPLICATE', dayIndex: 0, activityIndex: 0 },
        ],
      },
    });
    expect(mocks.parseImport).toHaveBeenCalledWith({ sourceText, context, locale: 'zh' });
    expect(mocks.reserveQuota).toHaveBeenCalledWith({ userId: 'user-1', tripId: 'trip-1' });
    expect(mocks.settleQuota).toHaveBeenCalledWith(expect.anything(), {
      success: true,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    expect(mocks.createItineraryDay).not.toHaveBeenCalled();
    expect(mocks.updateItineraryDay).not.toHaveBeenCalled();

    const logged = JSON.stringify(mocks.loggerInfo.mock.calls);
    expect(logged).not.toContain(sourceText);
    expect(logged).not.toContain('SECRET-PNR');
    expect(logged).toContain('inputTokens');
    expect(logged).toContain('latencyMs');
  });

  it('rejects a persistent usage limit before calling the provider', async () => {
    mocks.reserveQuota.mockRejectedValue(new ItineraryImportQuotaError('USAGE_LIMITED'));

    const response = await POST(request({ tripId: 'trip-1', sourceText: 'Day 1 博物館' }));

    expect(response.status).toBe(429);
    expect(await responseBody(response)).toMatchObject({ error: { code: 'USAGE_LIMITED' } });
    expect(mocks.parseImport).not.toHaveBeenCalled();
  });

  it.each([
    ['FEATURE_DISABLED', 503],
    ['RATE_LIMITED', 429],
    ['PROVIDER_TIMEOUT', 504],
    ['INVALID_MODEL_OUTPUT', 502],
    ['MODEL_OUTPUT_LIMIT', 502],
    ['INTERNAL_ERROR', 500],
  ] as const)('returns structured %s provider failures', async (code, status) => {
    mocks.parseImport.mockRejectedValue(new ItineraryImportProviderError(code));

    const response = await POST(request({ tripId: 'trip-1', sourceText: 'Day 1 博物館' }));

    expect(response.status).toBe(status);
    expect(await responseBody(response)).toMatchObject({ success: false, error: { code } });
    expect(mocks.createItineraryDay).not.toHaveBeenCalled();
    expect(mocks.updateItineraryDay).not.toHaveBeenCalled();
    expect(mocks.settleQuota).toHaveBeenCalledWith(expect.anything(), { success: false });
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain('Day 1 博物館');
  });

  it('rejects a malformed provider draft as invalid model output', async () => {
    mocks.parseImport.mockResolvedValue({
      draft: { sourceSummary: '', days: 'not-an-array', warnings: [] },
      provider: 'vercel',
      model: 'openai/test-model',
      usage: {},
    });

    const response = await POST(request({ tripId: 'trip-1', sourceText: 'Day 1 博物館' }));

    expect(response.status).toBe(502);
    expect(await responseBody(response)).toMatchObject({
      error: { code: 'INVALID_MODEL_OUTPUT' },
    });
  });
});
