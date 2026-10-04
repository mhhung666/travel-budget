import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryAfter?: number,
    /** A refresh failure says nothing about whether the caller's resource request was written. */
    public source: 'request' | 'refresh' = 'request'
  ) {
    super(code);
  }
}

// React Native signals expose aborted/events, but may omit throwIfAborted and reason.
export function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new ApiError('CANCELLED');
}

export type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  accessToken?: string;
  signal?: AbortSignal;
};
export function validateBaseUrl(value: string | undefined, development: boolean) {
  if (!value) throw new ApiError('CONFIGURATION');
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/api\/v1\/?$/.test(url.pathname)
    )
      throw new Error();
    return value.replace(/\/$/, '');
  } catch {
    throw new ApiError('CONFIGURATION');
  }
}
export type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;

export class ApiClient {
  private cooldowns = new Map<string, number>();
  constructor(
    public readonly baseUrl: string,
    private fetcher: Fetcher = fetch,
    private timeoutMs = 15_000
  ) {}
  async request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
    if (!this.baseUrl) throw new ApiError('CONFIGURATION');
    const remaining = (this.cooldowns.get(path) ?? 0) - Date.now();
    if (remaining > 0) throw new ApiError('RATE_LIMITED', 429, Math.ceil(remaining / 1000));
    checkAborted(options.signal);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        credentials: 'omit',
        redirect: 'error',
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch((error: unknown) => {
        // Malformed JSON is a payload error; interrupted body reads are transport failures.
        if (error instanceof SyntaxError) return null;
        throw error;
      });
      checkAborted(options.signal);
      if (timedOut) throw new ApiError('TIMEOUT');
      if (!response.ok) {
        const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(body);
        const rawRetry = response.headers.get('Retry-After');
        const retryAfter =
          rawRetry && !/^\d+$/.test(rawRetry)
            ? Math.ceil((Date.parse(rawRetry) - Date.now()) / 1000)
            : Number(rawRetry);
        if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0)
          this.cooldowns.set(path, Date.now() + retryAfter * 1000);
        throw new ApiError(
          error.success ? error.data.error.code : 'SERVER_ERROR',
          response.status,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
        );
      }
      const parsed = z.object({ data: schema }).safeParse(body);
      if (!parsed.success) throw new ApiError('INVALID_RESPONSE');
      return parsed.data.data;
    } catch (error) {
      checkAborted(options.signal);
      if (timedOut) throw new ApiError('TIMEOUT');
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
