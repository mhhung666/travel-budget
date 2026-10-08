import { z } from 'zod';
import { responseSchema } from './contracts';

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
  apiVersion?: 1 | 2;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  signal?: AbortSignal;
  /** Synchronous guard immediately before each fetch, including a session refresh replay. */
  beforeSend?: () => void;
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
  /** Clear an obsolete wait only after the server explicitly reports a state change. */
  clearCooldown(path: string) {
    this.cooldowns.delete(path);
  }
  async request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
    if (!this.baseUrl) throw new ApiError('CONFIGURATION');
    const version =
      options.apiVersion ?? (/^\/(trips(?:[/?]|$)|mutation-requests(?:[/?]|$))/.test(path) ? 2 : 1);
    const url = version === 2 ? this.baseUrl.replace(/\/v1$/, '/v2') : this.baseUrl;
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
      const init: RequestInit = {
        method: options.method ?? 'GET',
        headers,
        credentials: 'omit',
        redirect: 'error',
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      };
      options.beforeSend?.();
      const response = await this.fetcher(`${url}${path}`, init);
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
        if (version === 2 && response.status === 404 && !error.success)
          throw new ApiError('LEDGER_SERVICE_UNAVAILABLE', 503);
        throw new ApiError(
          error.success ? error.data.error.code : 'SERVER_ERROR',
          response.status,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
        );
      }
      const parsed = z.object({ data: responseSchema(schema, version) }).safeParse(body);
      if (!parsed.success) throw new ApiError('INVALID_RESPONSE');
      const data = parsed.data.data;
      if (version === 2 && data && typeof data === 'object' && 'ledger' in data) {
        const unit = (data as { ledger: { baseCurrency: string } }).ledger.baseCurrency;
        const children = 'items' in data ? (data as { items: unknown[] }).items : [];
        for (const child of [
          ...children,
          ...['expense', 'options', 'settlement', 'result'].flatMap((key) =>
            key in data ? [(data as Record<string, unknown>)[key]] : []
          ),
        ]) {
          if (
            child &&
            typeof child === 'object' &&
            'ledger' in child &&
            (child as { ledger: { baseCurrency: string } }).ledger.baseCurrency !== unit
          )
            throw new ApiError('INVALID_RESPONSE');
        }
      }
      return data;
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
