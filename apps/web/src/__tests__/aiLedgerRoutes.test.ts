// @vitest-environment node
import mongoose, { mongo } from 'mongoose';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  trip: vi.fn(),
  users: vi.fn(),
  probe: vi.fn(),
  text: vi.fn(),
  receipt: vi.fn(),
  head: vi.fn(),
  buffer: vi.fn(),
  quota: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getSessionFromRequest: h.session }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => undefined }));
vi.mock('@/models', () => ({
  Trip: {
    findOne: () => ({ select: () => ({ lean: h.member }) }),
    findById: () => ({ select: () => ({ lean: h.trip }) }),
  },
  User: { find: () => ({ select: () => ({ lean: h.users }) }) },
}));
vi.mock('@/lib/storage', () => ({ headObject: h.head, getObjectBuffer: h.buffer }));
vi.mock('@/lib/ai/expenseTextDraftProvider', () => ({ parseExpenseTextDraft: h.text }));
vi.mock('@/lib/ai/receiptDraftProvider', () => ({ parseReceiptDraft: h.receipt }));
vi.mock('@/lib/ai/aiUsageQuota', () => ({
  reserveAiUsageQuota: h.quota,
  settleAiUsageQuota: async () => ({}),
  AiUsageQuotaError: class extends Error {},
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { POST as textDraft } from '@/app/api/ai/expense-text-draft/route';
import { POST as receiptDraft } from '@/app/api/ai/receipt-draft/route';
import { getTripMembership } from '@/lib/permissions';
const actor = new mongo.ObjectId(),
  tripId = new mongo.ObjectId();
const key = `receipts/${tripId}/scan.webp`;
const request = (receipt: boolean, patch: object = {}) =>
  new NextRequest('https://test.invalid/api/ai/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId: tripId.toString(),
      ...(receipt ? { key } : { sourceText: 'Lunch 10 USD' }),
      ...patch,
    }),
  });
const previousDb = Object.getOwnPropertyDescriptor(mongoose.connection, 'db');
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(mongoose.connection, 'db', {
    configurable: true,
    value: { collection: () => ({ findOne: h.probe }) },
  });
  h.probe.mockResolvedValue(null);
  h.session.mockResolvedValue({ userId: actor.toString() });
  h.trip.mockResolvedValue({ members: [{ user: actor }] });
  h.users.mockResolvedValue([{ _id: actor, displayName: 'Alice', username: 'alice' }]);
  h.head.mockResolvedValue({ contentType: 'image/webp', size: 10 });
  h.buffer.mockResolvedValue(Buffer.from('owned image fixture'));
  h.quota.mockResolvedValue({});
  h.text.mockResolvedValue({
    draft: {
      description: 'Lunch',
      originalAmount: 10,
      currency: 'USD',
      split: { method: 'equal', participantNames: [] },
      warnings: [],
    },
    usage: {},
  });
  h.receipt.mockResolvedValue({
    draft: {
      currency: 'USD',
      amountCandidates: [{ kind: 'total', amount: 10 }],
      fieldStatus: {
        merchantName: 'missing',
        transactionDate: 'missing',
        currency: 'read',
        total: 'read',
      },
      warnings: [],
    },
    usage: {},
  });
});
afterEach(() => {
  if (previousDb) Object.defineProperty(mongoose.connection, 'db', previousDb);
  else Reflect.deleteProperty(mongoose.connection, 'db');
  vi.restoreAllMocks();
});
it.each(['USD', 'JPY'])(
  'authorizes both AI draft routes for a %s trip without weakening v1',
  async (baseCurrency) => {
    h.member.mockResolvedValue({
      _id: tripId,
      baseCurrency,
      members: [{ user: actor, role: 'member' }],
    });
    for (const receipt of [false, true]) {
      const response = await (receipt ? receiptDraft : textDraft)(request(receipt));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, draft: { currency: 'USD' } });
    }
    expect(h.text).toHaveBeenCalledOnce();
    expect(h.receipt).toHaveBeenCalledOnce();
    await expect(getTripMembership(actor.toString(), tripId.toString())).rejects.toThrow(
      'CLIENT_UPGRADE_REQUIRED'
    );
  }
);
it.each([false, true])(
  'refuses removed members before provider or private storage (receipt=%s)',
  async (receipt) => {
    h.member.mockResolvedValue({ _id: tripId, baseCurrency: 'JPY', members: [] });
    expect((await (receipt ? receiptDraft : textDraft)(request(receipt))).status).toBe(403);
    expect(h.text).not.toHaveBeenCalled();
    expect(h.receipt).not.toHaveBeenCalled();
    expect(h.head).not.toHaveBeenCalled();
    expect(h.quota).not.toHaveBeenCalled();
  }
);
it('keeps receipt keys scoped to the authorized non-TWD trip', async () => {
  h.member.mockResolvedValue({
    _id: tripId,
    baseCurrency: 'USD',
    members: [{ user: actor, role: 'member' }],
  });
  expect(
    (await receiptDraft(request(true, { key: `receipts/${new mongo.ObjectId()}/scan.webp` })))
      .status
  ).toBe(400);
  expect(h.head).not.toHaveBeenCalled();
  expect(h.receipt).not.toHaveBeenCalled();
});
