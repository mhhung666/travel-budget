import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getMembership: vi.fn(),
  tripLean: vi.fn(),
  userLean: vi.fn(),
  parseDraft: vi.fn(),
  reserveQuota: vi.fn(),
  settleQuota: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSessionFromRequest: mocks.getSession }));
vi.mock('@/lib/permissions', () => ({ getTripMembership: mocks.getMembership }));
vi.mock('@/models', () => ({
  Trip: {
    findById: vi.fn(() => ({ select: vi.fn(() => ({ lean: mocks.tripLean })) })),
  },
  User: {
    find: vi.fn(() => ({ select: vi.fn(() => ({ lean: mocks.userLean })) })),
  },
}));
vi.mock('@/lib/ai/expenseTextDraftProvider', () => ({
  parseExpenseTextDraft: mocks.parseDraft,
}));
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
import { POST } from '@/app/api/ai/expense-text-draft/route';

const sourceText = '午餐 180 元我付，大家平分';
const providerDraft = {
  description: '午餐',
  originalAmount: 180,
  currency: 'TWD',
  split: { method: 'equal' as const, participantNames: [] },
  warnings: [],
};

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/expense-text-draft', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function responseBody(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('POST /api/ai/expense-text-draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ userId: 'user-1', username: 'amy' });
    mocks.getMembership.mockResolvedValue({ tripId: 'trip-1', role: 'member' });
    mocks.tripLean.mockResolvedValue({ members: [{ user: 'user-1' }, { user: 'user-2' }] });
    mocks.userLean.mockResolvedValue([
      { _id: { toString: () => 'user-1' }, displayName: 'Amy', username: 'amy' },
      { _id: { toString: () => 'user-2' }, displayName: 'Bob', username: 'bob' },
    ]);
    mocks.reserveQuota.mockResolvedValue({
      periodStart: new Date('2026-08-10T00:00:00.000Z'),
      reservedMicroUsd: 0,
      scopes: [],
    });
    mocks.settleQuota.mockResolvedValue({ costMicroUsd: 2 });
    mocks.parseDraft.mockResolvedValue({
      draft: providerDraft,
      provider: 'openai',
      model: 'gpt-test',
      usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
    });
  });

  it('rejects unauthenticated, invalid, and non-member requests before model access', async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request({ tripId: 'trip-1', sourceText }))).status).toBe(401);

    expect((await POST(request({ tripId: 'trip-1', sourceText: '' }))).status).toBe(400);

    mocks.getMembership.mockResolvedValueOnce(null);
    expect((await POST(request({ tripId: 'trip-1', sourceText }))).status).toBe(403);
    expect(mocks.parseDraft).not.toHaveBeenCalled();
  });

  it('returns not found without reserving quota when the resolved trip disappeared', async () => {
    mocks.tripLean.mockResolvedValueOnce(null);
    const response = await POST(request({ tripId: 'trip-1', sourceText }));
    expect(response.status).toBe(404);
    expect(mocks.reserveQuota).not.toHaveBeenCalled();
  });

  it('normalizes safe member defaults and settles actual provider usage', async () => {
    const response = await POST(request({ tripId: 'trip-code', sourceText }));
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({
      success: true,
      draft: {
        description: '午餐',
        payerId: 'user-1',
        participantIds: ['user-1', 'user-2'],
        requiresCorrection: false,
      },
    });
    expect(mocks.reserveQuota).toHaveBeenCalledWith({ userId: 'user-1', tripId: 'trip-1' });
    expect(mocks.parseDraft).toHaveBeenCalledWith(sourceText);
    expect(mocks.settleQuota).toHaveBeenCalledWith(expect.anything(), {
      success: true,
      usage: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
    });
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain(sourceText);
  });

  it('rejects exhausted shared quota before calling the provider', async () => {
    mocks.reserveQuota.mockRejectedValue(new AiUsageQuotaError('USAGE_LIMITED'));
    const response = await POST(request({ tripId: 'trip-1', sourceText }));
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
      const response = await POST(request({ tripId: 'trip-1', sourceText }));
      expect(response.status).toBe(status);
      expect(await responseBody(response)).toMatchObject({ error: { code } });
      expect(mocks.settleQuota).toHaveBeenCalledWith(expect.anything(), { success: false });
      expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(sourceText);
    }
  );

  it('classifies malformed provider drafts as invalid output with no expense write path', async () => {
    mocks.parseDraft.mockResolvedValue({
      draft: { ...providerDraft, originalAmount: -1 },
      provider: 'openai',
      model: 'gpt-test',
      usage: {},
    });
    const response = await POST(request({ tripId: 'trip-1', sourceText }));
    expect(response.status).toBe(502);
    expect(await responseBody(response)).toMatchObject({
      error: { code: 'INVALID_MODEL_OUTPUT' },
    });
    expect(mocks.settleQuota).toHaveBeenCalledWith(expect.anything(), { success: false });
  });
});
