import type { Fetcher } from './client';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient, validateBaseUrl } from './client';
const schema = z.object({ value: z.string() });
describe('HTTP boundary', () => {
  it('rejects unsafe production addresses and URL credentials', () => {
    expect(() => validateBaseUrl('http://example.com/api/v1', false)).toThrow('CONFIGURATION');
    expect(() => validateBaseUrl('https://secret@example.com/api/v1', false)).toThrow();
    expect(validateBaseUrl('http://10.0.2.2:3000/api/v1/', true)).toBe(
      'http://10.0.2.2:3000/api/v1'
    );
  });
  it('validates successful payloads and never follows credential-bearing redirects', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(Response.json({ data: { wrong: true } }));
    const client = new ApiClient('https://example.com/api/v1', fetcher);
    await expect(client.request('/me', schema, { accessToken: 'private' })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: 'Bearer private' },
    });
  });
  it('maps server errors and Retry-After without exposing response text', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      );
    await expect(
      new ApiClient('https://example.com', fetcher).request('/me', schema)
    ).rejects.toMatchObject({ status: 429, retryAfter: 60 });
  });
  it('aborts an in-flight request when its query is cancelled', async () => {
    const fetcher = vi.fn<Fetcher>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const controller = new AbortController();
    const result = new ApiClient('https://example.com', fetcher).request('/me', schema, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('times out instead of spinning forever', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<Fetcher>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      const pending = new ApiClient('https://example.com', fetcher, 100).request('/me', schema);
      const check = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(101);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('rate limiting', () => {
  it('honors Retry-After before allowing a manual retry', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      );
    const api = new ApiClient('https://example.com', fetcher);
    await expect(api.request('/login', schema)).rejects.toMatchObject({ status: 429 });
    await expect(api.request('/login', schema)).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
