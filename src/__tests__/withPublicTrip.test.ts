import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

// 解析 trip 不需真實 DB：mock hash_code → tripId 的解析。
const getTripIdByHashCode = vi.fn();
vi.mock('@/lib/permissions', () => ({
  getTripIdByHashCode: (...args: unknown[]) => getTripIdByHashCode(...args),
}));

// logger 靜音，並可斷言 500 有記錄。
const errorLog = vi.fn();
vi.mock('@/lib/logger', () => ({
  logger: { error: (...args: unknown[]) => errorLog(...args) },
}));

import { withPublicTrip } from '@/lib/withPublicTrip';

const fakeRequest = {} as NextRequest;
const makeCtx = <P extends Record<string, string>>(params: P) => ({
  params: Promise.resolve(params),
});

beforeEach(() => {
  getTripIdByHashCode.mockReset();
  errorLog.mockReset();
});

describe('withPublicTrip', () => {
  it('resolves the trip param and invokes the handler with tripId + params', async () => {
    getTripIdByHashCode.mockResolvedValue('trip-id-123');
    const handler = vi.fn(async ({ tripId, params, request }) => {
      expect(tripId).toBe('trip-id-123');
      expect(params).toEqual({ id: 'abc123' });
      expect(request).toBe(fakeRequest);
      return NextResponse.json({ ok: true });
    });

    const route = withPublicTrip(handler);
    const res = await route(fakeRequest, makeCtx({ id: 'abc123' }));

    expect(getTripIdByHashCode).toHaveBeenCalledWith('abc123');
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('returns a structured 404 without calling the handler when the trip does not resolve', async () => {
    getTripIdByHashCode.mockResolvedValue(null);
    const handler = vi.fn();

    const route = withPublicTrip(handler);
    const res = await route(fakeRequest, makeCtx({ id: 'missing' }));

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'NOT_FOUND' });
  });

  it('converts a thrown handler error into a logged structured 500', async () => {
    getTripIdByHashCode.mockResolvedValue('trip-id-123');
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });

    const route = withPublicTrip(handler, { logLabel: 'My route error' });
    const res = await route(fakeRequest, makeCtx({ id: 'abc123' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'INTERNAL_ERROR' });
    expect(errorLog).toHaveBeenCalledWith('My route error', expect.any(Error));
  });

  it('reads the trip from a custom param via the tripParam option', async () => {
    getTripIdByHashCode.mockResolvedValue('trip-id-123');
    const handler = vi.fn(async ({ params }) => NextResponse.json({ user: params.username }));

    const route = withPublicTrip<{ tripId: string; username: string }>(handler, {
      tripParam: 'tripId',
    });
    const res = await route(fakeRequest, makeCtx({ tripId: 'code9', username: 'alice' }));

    expect(getTripIdByHashCode).toHaveBeenCalledWith('code9');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ user: 'alice' });
  });
});
