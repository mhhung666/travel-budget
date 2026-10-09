import type { Fetcher } from './client';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient, ApiError, validateBaseUrl } from './client';
import { tripsSchema } from './contracts';
const schema = z.object({ value: z.string() });
function nativeSignal(controller: AbortController): AbortSignal {
  return {
    get aborted() {
      return controller.signal.aborted;
    },
    addEventListener: controller.signal.addEventListener.bind(controller.signal),
    removeEventListener: controller.signal.removeEventListener.bind(controller.signal),
  } as AbortSignal;
}
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
  it('loads member trips with a React Native signal that omits newer AbortSignal methods', async () => {
    const data = { items: [], nextPage: null };
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(Response.json({ data }));
    const signal = nativeSignal(new AbortController());
    const path = '/trips?page=1&date=2026-10-02';
    await expect(
      new ApiClient('https://example.com/api/v1', fetcher).request(path, tripsSchema, {
        accessToken: 'private',
        signal,
      })
    ).resolves.toEqual(data);
    expect(fetcher).toHaveBeenCalledWith(
      `https://example.com/api/v2${path}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer private' }),
      })
    );
  });
  it('does not send a query already cancelled with a React Native signal', async () => {
    const fetcher = vi.fn<Fetcher>();
    const controller = new AbortController();
    const signal = nativeSignal(controller);
    controller.abort();
    await expect(
      new ApiClient('https://example.com', fetcher).request('/me', schema, { signal })
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['Node', 'React Native'])(
    'aborts an in-flight query with a %s signal',
    async (runtime) => {
      const fetcher = vi.fn<Fetcher>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );
      const controller = new AbortController();
      const result = new ApiClient('https://example.com', fetcher).request('/me', schema, {
        signal: runtime === 'React Native' ? nativeSignal(controller) : controller.signal,
      });
      controller.abort();
      await expect(result).rejects.toMatchObject(
        runtime === 'React Native' ? { code: 'CANCELLED' } : { name: 'AbortError' }
      );
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    }
  );
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
      await Promise.all([vi.advanceTimersByTimeAsync(101), check]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('reports a disconnect while reading the response body as a network error', async () => {
    const response = Response.json({ data: { value: 'partial' } });
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('connection lost'));
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(response);
    await expect(
      new ApiClient('https://example.com', fetcher).request('/me', schema)
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });
  it('keeps the timeout active while reading the response body', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<Fetcher>().mockImplementation(async (_url, init) => {
        const response = Response.json({ data: { value: 'partial' } });
        vi.spyOn(response, 'json').mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            })
        );
        return response;
      });
      const pending = new ApiClient('https://example.com', fetcher, 100).request('/me', schema);
      const check = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
      await Promise.all([vi.advanceTimersByTimeAsync(101), check]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects a completed response if cancellation arrived while reading its body', async () => {
    const controller = new AbortController();
    const response = Response.json({ data: { value: 'private' } });
    vi.spyOn(response, 'json').mockImplementation(async () => {
      controller.abort();
      return { data: { value: 'private' } };
    });
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(response);
    await expect(
      new ApiClient('https://example.com', fetcher).request('/me', schema, {
        signal: nativeSignal(controller),
      })
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it.each([200, 401, 503])('preserves HTTP status %s when the body is not JSON', async (status) => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(new Response('<html>error</html>', { status }));
    await expect(
      new ApiClient('https://example.com', fetcher).request('/me', schema)
    ).rejects.toMatchObject(
      status === 200 ? { code: 'INVALID_RESPONSE' } : { code: 'SERVER_ERROR', status }
    );
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

it('preserves a synchronous send guard failure without starting HTTP', async () => {
  const fetcher = vi.fn<Fetcher>().mockResolvedValue(Response.json({ data: { value: 'ok' } }));
  const client = new ApiClient('https://example.com', fetcher);
  const error = new ApiError('ACCESS_REVOKED', 403);
  await expect(
    client.request('/expenses', schema, {
      method: 'POST',
      body: { amount: 100 },
      beforeSend: () => {
        throw error;
      },
    })
  ).rejects.toBe(error);
  expect(fetcher).not.toHaveBeenCalled();
  await expect(client.request('/expenses', schema)).resolves.toEqual({ value: 'ok' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

// B5c-1: new requests default to v2; v1 and v2 addresses are one environment with one wait.
describe('environment identity and transport', () => {
  const ok = () => Response.json({ data: { value: 'ok' } });
  it('accepts either configured version as the same original environment', () => {
    expect(validateBaseUrl('https://example.com/api/v2/', false)).toBe(
      'https://example.com/api/v1'
    );
    expect(validateBaseUrl('https://example.com/api/v1', false)).toBe('https://example.com/api/v1');
    expect(() => validateBaseUrl('https://example.com/api/v3', false)).toThrow('CONFIGURATION');
    expect(() => validateBaseUrl('https://example.com/api', false)).toThrow('CONFIGURATION');
  });
  it('takes the backend origin alone, as the same environment as the older spellings', () => {
    for (const origin of ['https://example.com', 'https://example.com/'])
      expect(validateBaseUrl(origin, false)).toBe('https://example.com/api/v1');
    expect(validateBaseUrl('http://localhost:3000/', true)).toBe('http://localhost:3000/api/v1');
    // The identity keeps the address exactly as typed, so an existing scope is never renamed.
    expect(validateBaseUrl('https://Example.com:443/api/v2', false)).toBe(
      'https://Example.com:443/api/v1'
    );
    expect(validateBaseUrl('https://Example.com:443', false)).toBe(
      'https://Example.com:443/api/v1'
    );
    expect(() => validateBaseUrl('https://example.com/other', false)).toThrow('CONFIGURATION');
    expect(() => validateBaseUrl('http://example.com', false)).toThrow('CONFIGURATION');
  });
  it('sends an origin-configured client to v2', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(ok());
    await new ApiClient(validateBaseUrl('https://example.com', false), fetcher).request(
      '/me',
      z.object({ value: z.string() })
    );
    expect(fetcher.mock.calls[0][0]).toBe('https://example.com/api/v2/me');
  });
  it('sends every request to v2', async () => {
    const fetcher = vi.fn<Fetcher>().mockImplementation(async () => ok());
    const api = new ApiClient(validateBaseUrl('https://example.com/api/v2', false), fetcher);
    expect(api.environment).toBe('https://example.com/api/v1');
    for (const path of ['/auth/login', '/auth/refresh', '/me', '/capabilities', '/trips'])
      await api.request(path, schema, { method: 'POST' });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://example.com/api/v2/auth/login',
      'https://example.com/api/v2/auth/refresh',
      'https://example.com/api/v2/me',
      'https://example.com/api/v2/capabilities',
      'https://example.com/api/v2/trips',
    ]);
  });
  it('keeps a Retry-After wait for later requests to the same path', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      );
    const api = new ApiClient('https://example.com/api/v1', fetcher);
    await expect(api.request('/auth/login', schema)).rejects.toMatchObject({
      status: 429,
    });
    await expect(api.request('/auth/login', schema)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfter: 60,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not quietly fall back to v1 when the server has no v2 route', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response('missing', { status: 404 }));
    const api = new ApiClient('https://example.com/api/v1', fetcher);
    await expect(
      api.request('/auth/login', schema, { method: 'POST', body: { username: 'a' } })
    ).rejects.toMatchObject({ code: 'LEDGER_SERVICE_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('https://example.com/api/v2/auth/login');
  });
});
