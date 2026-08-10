import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getMembership: vi.fn(),
  headObject: vi.fn(),
  getObjectBuffer: vi.fn(),
  isReceiptKeyForTrip: vi.fn(),
  validateUpload: vi.fn(),
  parseDraft: vi.fn(),
  reserveQuota: vi.fn(),
  settleQuota: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSessionFromRequest: mocks.getSession }));
vi.mock('@/lib/permissions', () => ({ getTripMembership: mocks.getMembership }));
vi.mock('@/lib/storage', () => ({
  headObject: mocks.headObject,
  getObjectBuffer: mocks.getObjectBuffer,
}));
vi.mock('@/lib/uploads', () => ({
  isReceiptKeyForTrip: mocks.isReceiptKeyForTrip,
  validateUpload: mocks.validateUpload,
}));
vi.mock('@/lib/ai/receiptDraftProvider', () => ({ parseReceiptDraft: mocks.parseDraft }));
vi.mock('@/lib/ai/aiUsageQuota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/aiUsageQuota')>();
  return {
    ...actual,
    reserveAiUsageQuota: mocks.reserveQuota,
    settleAiUsageQuota: mocks.settleQuota,
  };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}));

import { AiProviderError } from '@/lib/ai/aiProvider';
import { AiUsageQuotaError } from '@/lib/ai/aiUsageQuota';
import { POST } from '@/app/api/ai/receipt-draft/route';

const key = 'receipts/trip-1/receipt.webp';
const validDraft = {
  merchantName: 'Cafe',
  transactionDate: '2026-08-10',
  currency: 'TWD',
  amountCandidates: [{ kind: 'total' as const, amount: 180 }],
  suggestedCategory: 'food' as const,
  fieldStatus: {
    merchantName: 'read' as const,
    transactionDate: 'read' as const,
    currency: 'read' as const,
    total: 'read' as const,
  },
  warnings: [],
};

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/receipt-draft', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function responseBody(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('POST /api/ai/receipt-draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ userId: 'user-1', username: 'amy' });
    mocks.getMembership.mockResolvedValue({ tripId: 'trip-1', role: 'member' });
    mocks.isReceiptKeyForTrip.mockReturnValue(true);
    mocks.headObject.mockResolvedValue({ contentType: 'image/webp', size: 1000 });
    mocks.validateUpload.mockReturnValue({ ok: true });
    mocks.getObjectBuffer.mockResolvedValue(Buffer.from('private-image'));
    mocks.reserveQuota.mockResolvedValue({
      periodStart: new Date('2026-08-10T00:00:00.000Z'),
      reservedMicroUsd: 0,
      scopes: [],
    });
    mocks.settleQuota.mockResolvedValue({ costMicroUsd: 12 });
    mocks.parseDraft.mockResolvedValue({
      draft: validDraft,
      provider: 'openai',
      model: 'gpt-test',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    });
  });

  it('rejects unauthenticated and invalid requests before reading private storage', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const unauthenticated = await POST(request({ tripId: 'trip-1', key }));
    expect(unauthenticated.status).toBe(401);

    const invalid = await POST(request({ tripId: '', key }));
    expect(invalid.status).toBe(400);
    expect(mocks.headObject).not.toHaveBeenCalled();
    expect(mocks.parseDraft).not.toHaveBeenCalled();
  });

  it('rejects non-members and cross-trip keys before storage or provider access', async () => {
    mocks.getMembership.mockResolvedValueOnce(null);
    const forbidden = await POST(request({ tripId: 'trip-1', key }));
    expect(forbidden.status).toBe(403);

    mocks.isReceiptKeyForTrip.mockReturnValueOnce(false);
    const crossTrip = await POST(request({ tripId: 'trip-1', key: 'receipts/other/x.webp' }));
    expect(crossTrip.status).toBe(400);
    expect(mocks.headObject).not.toHaveBeenCalled();
    expect(mocks.reserveQuota).not.toHaveBeenCalled();
  });

  it('rejects invalid metadata and missing objects before reserving quota', async () => {
    mocks.headObject.mockResolvedValueOnce({ contentType: 'application/pdf', size: 1000 });
    expect((await POST(request({ tripId: 'trip-1', key }))).status).toBe(400);

    mocks.getObjectBuffer.mockResolvedValueOnce(null);
    expect((await POST(request({ tripId: 'trip-1', key }))).status).toBe(400);
    expect(mocks.reserveQuota).not.toHaveBeenCalled();
  });

  it('returns a normalized draft and settles actual provider usage', async () => {
    const response = await POST(request({ tripId: 'trip-code', key }));
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({ success: true, draft: validDraft });
    expect(mocks.reserveQuota).toHaveBeenCalledWith({ userId: 'user-1', tripId: 'trip-1' });
    expect(mocks.parseDraft).toHaveBeenCalledWith(expect.any(Buffer), 'image/webp');
    expect(mocks.settleQuota).toHaveBeenCalledWith(expect.anything(), {
      success: true,
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    });
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain(key);
  });

  it('rejects exhausted shared quota before calling the provider', async () => {
    mocks.reserveQuota.mockRejectedValue(new AiUsageQuotaError('USAGE_LIMITED'));
    const response = await POST(request({ tripId: 'trip-1', key }));
    expect(response.status).toBe(429);
    expect(await responseBody(response)).toMatchObject({ error: { code: 'USAGE_LIMITED' } });
    expect(mocks.parseDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['FEATURE_DISABLED', 503],
    ['RATE_LIMITED', 429],
    ['PROVIDER_TIMEOUT', 504],
    ['INVALID_MODEL_OUTPUT', 502],
    ['MODEL_OUTPUT_LIMIT', 502],
    ['INTERNAL_ERROR', 500],
  ] as const)(
    'returns structured %s provider failures and settles failure usage',
    async (code, status) => {
      mocks.parseDraft.mockRejectedValue(new AiProviderError(code));
      const response = await POST(request({ tripId: 'trip-1', key }));
      expect(response.status).toBe(status);
      expect(await responseBody(response)).toMatchObject({ error: { code } });
      expect(mocks.settleQuota).toHaveBeenCalledWith(expect.anything(), { success: false });
      expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(key);
    }
  );

  it('returns a successful draft even if the final metering write fails', async () => {
    mocks.settleQuota.mockRejectedValue(new Error('database unavailable'));
    const response = await POST(request({ tripId: 'trip-1', key }));
    expect(response.status).toBe(200);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'AI receipt draft metering failed',
      expect.objectContaining({ errorCode: 'INTERNAL_ERROR' })
    );
  });
});
