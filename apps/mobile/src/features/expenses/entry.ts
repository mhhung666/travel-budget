import { retiredExpense } from '@/api/recovery';
import { baseCurrency } from '@/api/ledger';
import type { z } from 'zod';
import { ApiError, type RequestOptions } from '@/api/client';
import {
  expenseCreateInput,
  expenseDetailSchema,
  expenseRequestSchema,
  type ExpenseCreateInput,
  type ExpenseDetail,
} from '@/api/contracts';
import type { PendingExpense, PendingExpenseStore, PendingScope } from '@/storage/pendingExpenses';
import type { ExpenseFields } from './draft';
import type { DraftRef } from '@/storage/expenseDrafts';

export type EntryRequest = <T>(
  userId: string,
  path: string,
  schema: z.ZodType<T>,
  options?: Pick<RequestOptions, 'method' | 'body' | 'beforeSend'>
) => Promise<T>;

export interface EntryDeps {
  /** Opened on first use; a failure means nothing can be saved, so nothing is sent. */
  store: () => Promise<PendingExpenseStore>;
  /** Must send as the given account only and forward beforeSend to transport (`requestAs`). */
  request: EntryRequest;
  newId: () => string;
  now?: () => number;
  /** The server confirmed a request. The promise settles once dependent data was reloaded. */
  onCommitted?: (scope: PendingScope, tripId: string, expense: ExpenseDetail) => unknown;
  /** The set of pending records of a trip changed. */
  onChange?: (scope: PendingScope, tripId: string) => void;
}

export type UnconfirmedReason =
  | 'network'
  | 'timeout'
  | 'server'
  | 'busy'
  | 'unauthorized'
  | 'access'
  | 'conflict'
  | 'cancelled'
  | 'not-found'
  /** Saved by a release that sent v1: never sent or looked up again, only discarded. */
  | 'retired';
export type EntryOutcome =
  /** The server confirmed it; the pending record is gone. `differs`: the stored expense is not what was entered. */
  | { kind: 'saved'; expense: ExpenseDetail; differs: boolean; refreshed: Promise<boolean> }
  /** The server refused it before writing anything; the record is gone and the user may edit. */
  | { kind: 'rejected'; error: ApiError }
  /** No answer yet. The record stays and only the same request may be repeated. */
  | { kind: 'unconfirmed'; clientRequestId: string; reason: UnconfirmedReason; error?: unknown }
  /** Nothing was saved on the device, so nothing was sent. */
  | { kind: 'not-sent'; error?: unknown }
  /** An earlier request of this trip is still unresolved. */
  | { kind: 'blocked' }
  /** That request is no longer pending. */
  | { kind: 'gone' };

/**
 * What an HTTP failure proves about the request, per the API contract: only a 4xx from the API
 * itself says nothing was written by that attempt. A gateway's bare 4xx proves nothing.
 * 401/403/404 do not clear it: an earlier attempt may have been written before access was lost.
 */
type Verdict = 'rejected' | 'conflict' | 'refused' | 'uncertain';
export function verdictOf(error: unknown): Verdict {
  if (!(error instanceof ApiError)) return 'uncertain';
  if (error.source === 'refresh') return 'refused';
  if (error.status === 409) return 'conflict';
  if ([401, 403, 404, 429].includes(error.status)) return 'refused';
  if (error.status >= 400 && error.status < 500 && error.code !== 'SERVER_ERROR') return 'rejected';
  return 'uncertain';
}
export function reasonOf(error: unknown): UnconfirmedReason {
  if (!(error instanceof ApiError)) return 'server';
  if (error.code === 'NETWORK') return 'network';
  if (error.code === 'TIMEOUT') return 'timeout';
  if (error.code === 'CANCELLED') return 'cancelled';
  if (error.status === 429) return 'busy';
  if (error.status === 401) return 'unauthorized';
  if (error.source === 'refresh') return 'server';
  if (error.status === 409) return 'conflict';
  if (error.status === 403 || error.status === 404) return 'access';
  return 'server';
}

/** A local guard is not a new server 429 and must not extend the existing deadline. */
export class LocalRateLimitError extends ApiError {
  constructor(
    public until: number,
    now: number
  ) {
    super('RATE_LIMITED', 429, Math.ceil((until - now) / 1000));
  }
}

const cents = (value: number) => Math.round(value * 100);
/** Whether the stored expense is the one that was entered (it can only differ after a 409). */
export function sameExpense(payload: ExpenseCreateInput, expense: ExpenseDetail) {
  const shares = (entries: [string | null, number][]) =>
    entries
      .map(([id, amount]) => `${id}:${cents(amount)}`)
      .sort()
      .join(',');
  return (
    expense.description === payload.description &&
    expense.date === payload.date &&
    expense.category === payload.category &&
    expense.payerId === payload.payer_id &&
    expense.currency === payload.currency &&
    expense.exchangeRate === payload.exchange_rate &&
    expense.originalAmount === payload.original_amount &&
    cents(expense.amount) ===
      payload.splits.reduce((sum, split) => sum + cents(split.share_amount), 0) &&
    shares(expense.splits.map((split) => [split.userId, split.shareAmount])) ===
      shares(payload.splits.map((split) => [split.user_id, split.share_amount]))
  );
}

const tripPath = (tripId: string) => `/trips/${encodeURIComponent(tripId)}`;
const unconfirmed = (
  record: PendingExpense,
  reason: UnconfirmedReason,
  error?: unknown
): Extract<EntryOutcome, { kind: 'unconfirmed' }> => ({
  kind: 'unconfirmed',
  clientRequestId: record.clientRequestId,
  reason,
  ...(error === undefined ? {} : { error }),
});
const scopeKey = (scope: PendingScope) => `${scope.environment}\n${scope.accountId}`;
const scopeOf = ({ environment, accountId }: PendingScope): PendingScope => ({
  environment,
  accountId,
});

/**
 * Online expense entry that survives a lost answer. Before anything is sent, the frozen request
 * (id, body, account, environment, trip) is saved on the device; only an explicit server answer
 * removes it. After an unclear outcome the only moves are asking the server what it has for that
 * id and repeating the same id with the same body, which is safe because the server deduplicates.
 * It is independent of any screen: leaving a screen never cancels or clears a request.
 */
export class ExpenseEntry {
  private chains = new Map<string, Promise<unknown>>();
  private opening = new Set<string>();
  /** Requests the server settled whose local record could not be removed yet. */
  private resolved = new Map<string, 'committed' | 'rejected' | 'conflict'>();
  private recovering = new Map<string, Promise<EntryOutcome[]>>();
  constructor(private deps: EntryDeps) {}

  private now = () => (this.deps.now ?? Date.now)();
  private keyOf = (scope: PendingScope, id: string) => `${scopeKey(scope)}\n${id}`;

  /** Operations on one request id run one after another, so a lookup never overlaps its retry. */
  private serial<T>(scope: PendingScope, id: string, task: () => Promise<T>): Promise<T> {
    const key = this.keyOf(scope, id);
    const run = (this.chains.get(key) ?? Promise.resolve()).then(task);
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.chains.set(key, tail);
    void tail.then(() => {
      if (this.chains.get(key) === tail) this.chains.delete(key);
    });
    return run;
  }

  /** Pending requests of an account, optionally of one trip. */
  async list(scope: PendingScope, tripId?: string): Promise<PendingExpense[]> {
    return this.visible(await this.deps.store(), scope, tripId);
  }
  private async visible(store: PendingExpenseStore, scope: PendingScope, tripId?: string) {
    const live: PendingExpense[] = [];
    for (const record of await store.list(scope, tripId)) {
      if (this.resolved.has(this.keyOf(record, record.clientRequestId)))
        await this.drop(
          store,
          record,
          this.resolved.get(this.keyOf(record, record.clientRequestId))
        );
      else live.push(record);
    }
    return live;
  }

  /**
   * One user-confirmed submission: freezes the fields under a new id, saves them, then sends.
   * Refused while an earlier request of the same trip is unresolved, so a duplicate cannot be
   * started by re-entering something that may already have been saved.
   */
  async submit(
    scope: PendingScope,
    tripId: string,
    fields: ExpenseFields,
    draft?: DraftRef,
    beforeSend?: () => void
  ): Promise<EntryOutcome> {
    const lock = `${scopeKey(scope)}\n${tripId}`;
    if (this.opening.has(lock)) return { kind: 'blocked' };
    this.opening.add(lock);
    let store: PendingExpenseStore;
    let record: PendingExpense;
    try {
      store = await this.deps.store();
      if ((await this.visible(store, scope, tripId)).length > 0) return { kind: 'blocked' };
      const payload = expenseCreateInput.parse({
        ...fields,
        client_request_id: this.deps.newId(),
      });
      // Only a v2 body (one that names its ledger unit) can be sent.
      if (!('base_currency' in payload)) throw new Error('INVALID_PENDING_LEDGER');
      const now = this.now();
      record = {
        ...scope,
        tripId,
        clientRequestId: payload.client_request_id,
        apiVersion: 2,
        baseCurrency: payload.base_currency,
        moneyScale: 2,
        payload,
        status: 'sending',
        createdAt: now,
        updatedAt: now,
      };
      // A request that could not be saved is never sent.
      await store.insert(record, draft);
    } catch (error) {
      return { kind: 'not-sent', error };
    } finally {
      this.opening.delete(lock);
    }
    this.deps.onChange?.(scope, tripId);
    // New submissions share the durable account cooldown used by recovery and manual retry.
    return this.retry(scope, record.clientRequestId, beforeSend);
  }

  /** Asks the server what it has for a pending request. Read-only. */
  lookup(scope: PendingScope, clientRequestId: string): Promise<EntryOutcome> {
    return this.serial(scope, clientRequestId, async () => {
      const loaded = await this.load(scope, clientRequestId);
      if (!('store' in loaded)) return loaded;
      if (retiredExpense(loaded.record)) return unconfirmed(loaded.record, 'retired');
      return this.lookupCore(loaded.store, loaded.record);
    });
  }

  /**
   * Asks for the receipt first, then repeats the frozen request only if the server has none;
   * transport checks beforeSend after all waits and before any replay.
   */
  retry(
    scope: PendingScope,
    clientRequestId: string,
    beforeSend?: () => void
  ): Promise<EntryOutcome> {
    return this.serial(scope, clientRequestId, async () => {
      const loaded = await this.load(scope, clientRequestId);
      if (!('store' in loaded)) return loaded;
      if (retiredExpense(loaded.record)) return unconfirmed(loaded.record, 'retired');
      const found = await this.lookupCore(loaded.store, loaded.record);
      if (found.kind !== 'unconfirmed' || found.reason !== 'not-found') return found;
      return this.post(loaded.store, loaded.record, beforeSend);
    });
  }

  /**
   * Removes a request saved by a release that sent v1, at the user's explicit request. Its outcome
   * stays unknown; nothing is sent. A failure to remove it is reported, never retried silently.
   */
  abandon(scope: PendingScope, clientRequestId: string): Promise<void> {
    return this.serial(scope, clientRequestId, async () => {
      const store = await this.deps.store();
      const record = await store.get(scope, clientRequestId);
      if (!record) return;
      if (!retiredExpense(record)) throw new Error('NOT_RETIRED');
      await store.remove(scopeOf(record), clientRequestId, 'abandoned');
      this.deps.onChange?.(scopeOf(record), record.tripId);
    });
  }

  /** Looks up every pending request of an account (app start, foreground, back online). Sends nothing. */
  recover(scope: PendingScope): Promise<EntryOutcome[]> {
    const key = scopeKey(scope);
    const running = this.recovering.get(key);
    if (running) return running;
    const run = (async () => {
      let records: PendingExpense[];
      try {
        records = await this.visible(await this.deps.store(), scope);
      } catch {
        return [];
      }
      const outcomes: EntryOutcome[] = [];
      for (const record of records) outcomes.push(await this.lookup(scope, record.clientRequestId));
      return outcomes;
    })().finally(() => this.recovering.delete(key));
    this.recovering.set(key, run);
    return run;
  }

  private async load(
    scope: PendingScope,
    id: string
  ): Promise<
    | { store: PendingExpenseStore; record: PendingExpense }
    | Extract<EntryOutcome, { kind: 'not-sent' | 'gone' | 'unconfirmed' }>
  > {
    let store: PendingExpenseStore;
    let record: PendingExpense | null;
    try {
      store = await this.deps.store();
      record = await store.get(scope, id);
    } catch (error) {
      return { kind: 'not-sent', error };
    }
    if (!record || this.resolved.has(this.keyOf(scope, id))) return { kind: 'gone' };
    try {
      const nextAt = (await store.retryAt?.(scope, id)) ?? 0;
      if (nextAt > this.now())
        return unconfirmed(record, 'busy', new LocalRateLimitError(nextAt, this.now()));
    } catch (error) {
      return { kind: 'not-sent', error };
    }
    return { store, record };
  }

  private guardRateLimit(store: PendingExpenseStore, scope: PendingScope) {
    const until = store.rateLimitUntil?.(scope) ?? 0;
    if (until > this.now()) throw new LocalRateLimitError(until, this.now());
  }

  private async post(
    store: PendingExpenseStore,
    record: PendingExpense,
    beforeSend?: () => void
  ): Promise<EntryOutcome> {
    // Also after the receipt check, which marks a request it did not find as unconfirmed.
    await this.mark(store, record, 'sending');
    let expense: ExpenseDetail;
    try {
      expense = await this.deps.request(
        record.accountId,
        `${tripPath(record.tripId)}/expenses`,
        expenseDetailSchema,
        {
          method: 'POST',
          body: record.payload,
          beforeSend: () => {
            beforeSend?.();
            this.guardRateLimit(store, record);
          },
        }
      );
    } catch (error) {
      return this.failed(store, record, error);
    }
    if (
      ('base_currency' in record.payload ? record.payload.base_currency : 'TWD') !==
      (expense.ledger?.baseCurrency ?? 'TWD')
    )
      return unconfirmed(record, 'server', new ApiError('LEDGER_CURRENCY_MISMATCH'));
    return this.settle(store, record, expense);
  }

  private async failed(
    store: PendingExpenseStore,
    record: PendingExpense,
    error: unknown
  ): Promise<EntryOutcome> {
    const verdict = verdictOf(error);
    await this.mark(store, record, 'unconfirmed');
    try {
      // Record 409 before its follow-up lookup, and 429 before returning to any caller.
      await this.rememberFailure(store, record, error);
    } catch (storageError) {
      return unconfirmed(record, 'server', storageError);
    }
    if (verdict === 'refused') return unconfirmed(record, reasonOf(error), error);
    // The server may hold the request (a lost answer, a 409): ask before reporting anything.
    const found = await this.lookupCore(store, record);
    if (found.kind !== 'unconfirmed') return found;
    // Preserve access/session failures and the lookup's own Retry-After in the returned outcome.
    if (['access', 'unauthorized', 'cancelled', 'busy'].includes(found.reason)) return found;
    if (found.reason === 'not-found' && verdict !== 'conflict') return found;
    return unconfirmed(record, reasonOf(error), error);
  }

  private async rememberFailure(
    store: PendingExpenseStore,
    record: PendingExpense,
    error: unknown
  ) {
    if (!(error instanceof ApiError) || error instanceof LocalRateLimitError) return;
    if (error.status !== 429 && verdictOf(error) !== 'conflict') return;
    if (!store.pause) return;
    await store.pause(
      scopeOf(record),
      record.clientRequestId,
      reasonOf(error),
      this.now() + Math.max(30, error.retryAfter ?? 30) * 1000
    );
    this.deps.onChange?.(scopeOf(record), record.tripId);
  }

  private async lookupCore(
    store: PendingExpenseStore,
    record: PendingExpense
  ): Promise<EntryOutcome> {
    let result;
    try {
      result = await this.deps.request(
        record.accountId,
        `${tripPath(record.tripId)}/expense-requests/${encodeURIComponent(record.clientRequestId)}`,
        expenseRequestSchema,
        { beforeSend: () => this.guardRateLimit(store, record) }
      );
    } catch (error) {
      try {
        await this.rememberFailure(store, record, error);
      } catch (storageError) {
        return unconfirmed(record, 'server', storageError);
      }
      return unconfirmed(record, reasonOf(error), error);
    }
    if (result.status === 'committed') {
      if (
        ('base_currency' in record.payload ? record.payload.base_currency : 'TWD') !==
        baseCurrency(result.expense)
      )
        return unconfirmed(record, 'server', new ApiError('LEDGER_CURRENCY_MISMATCH'));
      return this.settle(store, record, result.expense);
    }
    if (result.status === 'rejected') {
      await this.drop(store, record, 'rejected');
      return { kind: 'rejected', error: new ApiError(result.code, 409) };
    }
    await this.mark(store, record, 'unconfirmed');
    return unconfirmed(record, 'not-found');
  }

  private async settle(
    store: PendingExpenseStore,
    record: PendingExpense,
    expense: ExpenseDetail
  ): Promise<EntryOutcome> {
    // The server's answer is final. A removal that fails here is retried when records are next read.
    const differs = !sameExpense(record.payload, expense);
    await this.drop(store, record, differs ? 'conflict' : 'committed');
    const refreshed = Promise.resolve()
      .then(() => this.deps.onCommitted?.(scopeOf(record), record.tripId, expense))
      .then(
        () => true,
        () => false
      );
    return { kind: 'saved', expense, differs, refreshed };
  }

  private async drop(
    store: PendingExpenseStore,
    record: PendingExpense,
    resolution: 'committed' | 'rejected' | 'conflict' = 'committed'
  ) {
    const key = this.keyOf(record, record.clientRequestId);
    try {
      await store.remove(scopeOf(record), record.clientRequestId, resolution);
      this.resolved.delete(key);
      this.deps.onChange?.(scopeOf(record), record.tripId);
    } catch {
      this.resolved.set(key, resolution);
    }
  }

  /** The status is informational; the record itself is what keeps a request from being lost. */
  private async mark(
    store: PendingExpenseStore,
    record: PendingExpense,
    status: PendingExpense['status']
  ) {
    try {
      await store.setStatus(scopeOf(record), record.clientRequestId, status);
    } catch {
      /* keep going */
    }
  }
}
