import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ session: vi.fn(), member: vi.fn(), read: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: h.session }));
vi.mock('@/lib/permissions', () => ({ getTripMembership: h.member }));
vi.mock('@/lib/paymentWrite', () => ({ readWebPaymentContext: h.read }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ JWT_SECRET: 'test-secret' }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: h.error } }));
import { getSettlement } from '@/actions/settlement.actions';
beforeEach(() => {
  vi.clearAllMocks();
  h.session.mockResolvedValue({ userId: 'actor' });
  h.member.mockResolvedValue({ tripId: 'resolved-trip' });
});
describe('Web settlement snapshot adapter', () => {
  it('rejects a logged-out caller without reading any snapshot', async () => {
    h.session.mockResolvedValue(null);
    expect(await getSettlement('code')).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(h.read).not.toHaveBeenCalled();
  });
  it('rejects a non-member without reading any snapshot', async () => {
    h.member.mockResolvedValue(null);
    expect(await getSettlement('code')).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(h.read).not.toHaveBeenCalled();
  });
  it('returns balances and confirmation revision from the same service snapshot', async () => {
    const snapshot = {
      ledger: { baseCurrency: 'USD', moneyScale: 2 },
      totalExpenses: 20.1,
      balances: [],
      payments: [],
      transactions: [],
      settlementRevision: 'a'.repeat(64),
      paymentRevisions: {},
    };
    h.read.mockResolvedValue(snapshot);
    expect(await getSettlement('code')).toEqual({ success: true, data: snapshot });
    expect(h.read).toHaveBeenCalledWith(undefined, 'actor', 'resolved-trip', 'test-secret');
  });
  it('reports a failed snapshot rather than an empty settlement', async () => {
    h.read.mockRejectedValueOnce(new Error('database unavailable'));
    expect(await getSettlement('code')).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(h.error).toHaveBeenCalledOnce();
  });
});
