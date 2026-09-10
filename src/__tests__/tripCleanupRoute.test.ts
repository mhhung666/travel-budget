// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ env: vi.fn(), connect: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/env', () => ({ getEnv: mocks.env }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: mocks.connect }));
vi.mock('@/lib/tripCleanup', () => ({ runTripCleanup: mocks.run }));
vi.mock('@/lib/storage', () => ({ deletePrefixPage: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { GET } from '@/app/api/cron/trip-cleanup/route';
const request = (authorization = 'Bearer secret') =>
  new NextRequest('http://localhost/api/cron/trip-cleanup', { headers: { authorization } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.run.mockReset();
  mocks.env.mockReturnValue({ CRON_SECRET: 'secret' });
  mocks.run.mockResolvedValueOnce({ status: 'swept' }).mockResolvedValue({ status: 'idle' });
});
describe('trip cleanup cron authorization', () => {
  it('rejects missing configuration before database access', async () => {
    mocks.env.mockReturnValue({});
    expect((await GET(request())).status).toBe(503);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each(['', 'Bearer wrong!', 'Bearer secreu'])(
    'rejects invalid credentials %s',
    async (header) => {
      expect((await GET(request(header))).status).toBe(401);
      expect(mocks.connect).not.toHaveBeenCalled();
    }
  );
  it('runs a bounded recovery batch', async () => {
    expect(await (await GET(request())).json()).toEqual({
      success: true,
      results: { swept: 1, idle: 1 },
    });
    expect(mocks.run).toHaveBeenCalledTimes(2);
  });
  it('does not expose infrastructure errors', async () => {
    mocks.run.mockRejectedValueOnce(new Error('private database URI'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'WORKER_UNAVAILABLE' });
  });
});
