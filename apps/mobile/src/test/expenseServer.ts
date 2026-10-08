import type { Fetcher } from '@/api/client';
import { expenseCreateInput, type ExpenseDetail } from '@/api/contracts';

export const hex = (n: number) => n.toString(16).padStart(24, '0');
export const uuidOf = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

/** Ways a request can go wrong, each applied once to the next request that matches. */
export type Fault =
  /** The connection fails before the server sees anything. */
  | { kind: 'network' }
  /** The server handles the request completely, then the answer never arrives. */
  | { kind: 'drop-response' }
  /** The server never sees it and never answers; only the client's timeout ends it. */
  | { kind: 'hang' }
  /** An error answer; `after` means the request was committed first (an unclear 5xx). */
  | {
      kind: 'status';
      status: number;
      code?: string;
      after?: boolean;
      retryAfter?: number;
      /** A gateway's page instead of the API's error envelope. */
      bare?: boolean;
    }
  /** A 200 whose body is not the contract, after committing. */
  | { kind: 'garbage' };

interface Receipt {
  fingerprint: string;
  expense: ExpenseDetail;
}
export interface Seen {
  method: string;
  path: string;
  body?: unknown;
  authorization?: string;
}

/**
 * A small stand-in for the real backend with the semantics the client relies on: bearer sessions,
 * trip membership (404 for outsiders), contract validation (400), and idempotent creation with a
 * receipt per account, trip and key (replay, 409 on different content, lookup by key).
 */
export function fakeExpenseServer() {
  const accounts = new Map<string, { id: string; name: string }>();
  const tokens = new Map<string, string>();
  const members = new Map<string, Set<string>>();
  const receipts = new Map<string, Receipt>();
  const expenses: ExpenseDetail[] = [];
  const seen: Seen[] = [];
  const revoked = new Set<string>();
  const faults: { method: string; pattern: RegExp; fault: Fault }[] = [];
  let counter = 0;
  const names = () => new Map([...accounts.values()].map((account) => [account.id, account.name]));

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers });
  const failure = (status: number, code: string, headers?: Record<string, string>) =>
    json(status, { error: { code }, requestId: 'test' }, headers);
  const session = (userId: string) => {
    const account = [...accounts.values()].find((entry) => entry.id === userId)!;
    const n = ++counter;
    tokens.set(`access-${n}`, userId);
    tokens.set(`refresh-${n}`, userId);
    return {
      data: {
        accessToken: `access-${n}`,
        refreshToken: `refresh-${n}`,
        expiresIn: 900,
        user: { id: userId, username: account.name, displayName: account.name },
      },
    };
  };
  const receiptKey = (tripId: string, userId: string, key: string) =>
    `${tripId}:${userId}:${key.toLowerCase()}`;

  function detailOf(body: ReturnType<typeof expenseCreateInput.parse>): ExpenseDetail {
    const label = names();
    return {
      ...('base_currency' in body
        ? { ledger: { baseCurrency: body.base_currency, moneyScale: 2 as const } }
        : {}),
      id: hex(10_000 + expenses.length + 1),
      date: body.date,
      description: body.description,
      category: body.category,
      payerId: body.payer_id,
      payerName: label.get(body.payer_id) ?? '',
      amount:
        body.currency === ('base_currency' in body ? body.base_currency : 'TWD')
          ? body.original_amount
          : body.splits.reduce((sum, s) => sum + Math.round(s.share_amount * 100), 0) / 100,
      originalAmount: body.original_amount,
      currency: body.currency,
      exchangeRate: body.exchange_rate,
      splits: body.splits.map((split) => ({
        userId: split.user_id,
        displayName: label.get(split.user_id) ?? '',
        shareAmount: split.share_amount,
      })),
    };
  }

  function takeFault(method: string, path: string): Fault | undefined {
    const index = faults.findIndex((entry) => entry.method === method && entry.pattern.test(path));
    return index < 0 ? undefined : faults.splice(index, 1)[0].fault;
  }

  const fetcher: Fetcher = async (url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ method, path, body, authorization: headers.Authorization });

    if (path === '/auth/login') {
      const account = [...accounts.values()].find((entry) => entry.name === body.username);
      return account ? json(200, session(account.id)) : failure(401, 'INVALID_CREDENTIALS');
    }
    if (path === '/auth/refresh') {
      const userId = tokens.get(body.refreshToken);
      return userId && !revoked.has(userId)
        ? json(200, session(userId))
        : failure(401, 'UNAUTHORIZED');
    }
    if (path === '/auth/logout') return json(200, { data: { loggedOut: true } });

    const fault = takeFault(method, path);
    if (fault?.kind === 'network') throw new TypeError('network down');
    if (fault?.kind === 'hang')
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
      });
    if (fault?.kind === 'status' && !fault.after) {
      if (fault.bare) return new Response('<html>gateway</html>', { status: fault.status });
      return failure(
        fault.status,
        fault.code ?? 'UPSTREAM',
        fault.retryAfter ? { 'Retry-After': String(fault.retryAfter) } : undefined
      );
    }

    const userId = tokens.get(String(headers.Authorization ?? '').replace('Bearer ', ''));
    if (!userId || revoked.has(userId)) return failure(401, 'UNAUTHORIZED');
    const route =
      /^\/trips\/([a-f0-9]{24})\/expenses$/.exec(path) ??
      /^\/trips\/([a-f0-9]{24})\/expense-requests\/([^/]+)$/.exec(path);
    if (!route) return failure(404, 'NOT_FOUND');
    const tripId = route[1];
    if (!members.get(tripId)?.has(userId)) return failure(404, 'NOT_FOUND');

    let response: Response;
    if (method === 'POST') {
      const parsed = expenseCreateInput.safeParse(body);
      if (!parsed.success) return failure(400, 'VALIDATION_ERROR');
      const key = receiptKey(tripId, userId, parsed.data.client_request_id);
      const fingerprint = JSON.stringify(parsed.data);
      const existing = receipts.get(key);
      if (existing && existing.fingerprint !== fingerprint)
        return failure(409, 'IDEMPOTENCY_CONFLICT');
      if (existing) response = json(200, { data: existing.expense });
      else {
        const expense = detailOf(parsed.data);
        expenses.push(expense);
        receipts.set(key, { fingerprint, expense });
        response = json(200, { data: expense });
      }
    } else {
      const found = receipts.get(receiptKey(tripId, userId, decodeURIComponent(route[2])));
      response = json(200, {
        data: found ? { status: 'committed', expense: found.expense } : { status: 'not_found' },
      });
    }
    if (fault?.kind === 'drop-response') throw new TypeError('connection reset');
    if (fault?.kind === 'garbage') return new Response('{"data": 12', { status: 200 });
    if (fault?.kind === 'status') return failure(fault.status, fault.code ?? 'UPSTREAM');
    return response;
  };

  return {
    fetcher,
    expenses,
    receipts,
    seen,
    posts: () => seen.filter((call) => call.method === 'POST' && /\/expenses$/.test(call.path)),
    lookups: () => seen.filter((call) => /\/expense-requests\//.test(call.path)),
    addAccount(id: string, name: string) {
      accounts.set(name, { id, name });
    },
    addMember(tripId: string, userId: string) {
      members.set(tripId, (members.get(tripId) ?? new Set()).add(userId));
    },
    removeMember(tripId: string, userId: string) {
      members.get(tripId)?.delete(userId);
    },
    /** Every session of this account stops working, refresh included. */
    revoke(userId: string) {
      revoked.add(userId);
    },
    restore(userId: string) {
      revoked.delete(userId);
    },
    /** Seeds a receipt as if another request had used this key with different content. */
    seedReceipt(tripId: string, userId: string, key: string, expense: ExpenseDetail) {
      receipts.set(receiptKey(tripId, userId, key), { fingerprint: 'other-content', expense });
    },
    fail(method: 'GET' | 'POST', pattern: RegExp, fault: Fault) {
      faults.push({ method, pattern, fault });
    },
  };
}
