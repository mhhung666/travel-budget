// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ env: vi.fn(), run: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/env', () => ({ getEnv: mocks.env }));
vi.mock('@/lib/expenseDeliveryRuntime', () => ({ runExpenseBackgroundDelivery: mocks.run }));
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }));
import { GET, maxDuration } from '@/app/api/cron/expense-delivery/route';
const request = (authorization = 'Bearer secret') =>
  new NextRequest('http://localhost/api/cron/expense-delivery', {
    headers: { authorization },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.mockReturnValue({ CRON_SECRET: 'secret' });
  mocks.run.mockResolvedValue({ status: 'done' });
});
describe('authenticated bounded expense recovery route', () => {
  it('refuses missing configuration before database access', async () => {
    mocks.env.mockReturnValue({});
    expect((await GET(request())).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each(['', 'Bearer wrong!', 'Bearer secreu', 'secret'])(
    'rejects invalid authorization %s',
    async (header) => {
      expect((await GET(request(header))).status).toBe(401);
      expect(mocks.run).not.toHaveBeenCalled();
    }
  );
  it('runs one batch even when new writes have been disabled, with a platform duration limit', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, status: 'done' });
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(maxDuration).toBe(60);
  });
  it('returns a retryable status without leaking DB/provider errors', async () => {
    mocks.run.mockRejectedValue(new Error('secret endpoint'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith('Expense delivery batch unavailable');
  });
});
