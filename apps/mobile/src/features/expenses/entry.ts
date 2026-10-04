import type { z } from 'zod';
import { ApiError } from '@/api/client';
import {
  expenseCreateInput,
  expenseDetailSchema,
  expenseRequestSchema,
  type ExpenseCreateInput,
  type ExpenseDetail,
} from '@/api/contracts';
import type { PendingExpense, PendingExpenseStore, PendingScope } from '@/storage/pendingExpenses';
import type { ExpenseFields } from './draft';

export type EntryRequest = <T>(
  userId: string,
  path: string,
  schema: z.ZodType<T>,
  options?: { method?: 'GET' | 'POST'; body?: unknown }
) => Promise<T>;

export interface EntryDeps {
  /** Opened on first use; a failure means nothing can be saved, so nothing is sent. */
  store: () => Promise<PendingExpenseStore>;
  /** Must send as the given account only (`SessionManager.requestAs`). */
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
  | 'not-found';
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
    cents(expense.amount) === cents(payload.original_amount) &&
    shares(expense.splits.map((split) => [split.userId, split.shareAmount])) ===
      shares(payload.splits.map((split) => [split.user_id, split.share_amount]))
  );
}

const tripPath = (tripId: string) => `/trips/${encodeURIComponent(tripId)}`;
const unconfirmed = (
  record: PendingExpense,
  reason: UnconfirmedReason,
  error?: unknown
): EntryOutcome => ({
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
  private resolved = new Set<string>();
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
        await this.drop(store, record);
      else live.push(record);
    }
    return live;
  }

  /**
   * One user-confirmed submission: freezes the fields under a new id, saves them, then sends.
   * Refused while an earlier request of the same trip is unresolved, so a duplicate cannot be
   * started by re-entering something that may already have been saved.
   */
  async submit(scope: PendingScope, tripId: string, fields: ExpenseFields): Promise<EntryOutcome> {
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
      const now = this.now();
      record = {
        ...scope,
        tripId,
        clientRequestId: payload.client_request_id,
        payload,
        status: 'sending',
        createdAt: now,
        updatedAt: now,
      };
      // A request that could not be saved is never sent.
      await store.insert(record);
    } catch (error) {
      return { kind: 'not-sent', error };
    } finally {
      this.opening.delete(lock);
    }
    this.deps.onChange?.(scope, tripId);
    return this.serial(scope, record.clientRequestId, () => this.post(store, record));
  }

  /** Asks the server what it has for a pending request. Read-only. */
  lookup(scope: PendingScope, clientRequestId: string): Promise<EntryOutcome> {
    return this.serial(scope, clientRequestId, async () => {
      const loaded = await this.load(scope, clientRequestId);
      return 'store' in loaded ? this.lookupCore(loaded.store, loaded.record) : loaded;
    });
  }

  /** Repeats a pending request exactly: same id, same body. */
  retry(scope: PendingScope, clientRequestId: string): Promise<EntryOutcome> {
    return this.serial(scope, clientRequestId, async () => {
      const loaded = await this.load(scope, clientRequestId);
      return 'store' in loaded ? this.post(loaded.store, loaded.record) : loaded;
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
    | Extract<EntryOutcome, { kind: 'not-sent' | 'gone' }>
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
    return { store, record };
  }

  private async post(store: PendingExpenseStore, record: PendingExpense): Promise<EntryOutcome> {
    if (record.status !== 'sending') await this.mark(store, record, 'sending');
    let expense: ExpenseDetail;
    try {
      expense = await this.deps.request(
        record.accountId,
        `${tripPath(record.tripId)}/expenses`,
        expenseDetailSchema,
        { method: 'POST', body: record.payload }
      );
    } catch (error) {
      return this.failed(store, record, error);
    }
    return this.settle(store, record, expense);
  }

  private async failed(
    store: PendingExpenseStore,
    record: PendingExpense,
    error: unknown
  ): Promise<EntryOutcome> {
    const verdict = verdictOf(error);
    if (verdict === 'rejected') {
      await this.drop(store, record);
      return { kind: 'rejected', error: error as ApiError };
    }
    await this.mark(store, record, 'unconfirmed');
    if (verdict === 'refused') return unconfirmed(record, reasonOf(error), error);
    // The server may hold the request (a lost answer, a 409): ask before reporting anything.
    const found = await this.lookupCore(store, record);
    if (found.kind !== 'unconfirmed') return found;
    // An answer about access or the session says more than the transport failure that preceded it.
    if (['access', 'unauthorized', 'cancelled'].includes(found.reason)) return found;
    if (found.reason === 'not-found' && verdict !== 'conflict') return found;
    return unconfirmed(record, reasonOf(error), error);
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
        expenseRequestSchema
      );
    } catch (error) {
      return unconfirmed(record, reasonOf(error), error);
    }
    if (result.status === 'committed') return this.settle(store, record, result.expense);
    await this.mark(store, record, 'unconfirmed');
    return unconfirmed(record, 'not-found');
  }

  private async settle(
    store: PendingExpenseStore,
    record: PendingExpense,
    expense: ExpenseDetail
  ): Promise<EntryOutcome> {
    // The server's answer is final. A removal that fails here is retried when records are next read.
    await this.drop(store, record);
    const refreshed = Promise.resolve()
      .then(() => this.deps.onCommitted?.(scopeOf(record), record.tripId, expense))
      .then(
        () => true,
        () => false
      );
    return { kind: 'saved', expense, differs: !sameExpense(record.payload, expense), refreshed };
  }

  private async drop(store: PendingExpenseStore, record: PendingExpense) {
    const key = this.keyOf(record, record.clientRequestId);
    try {
      await store.remove(scopeOf(record), record.clientRequestId);
      this.resolved.delete(key);
      this.deps.onChange?.(scopeOf(record), record.tripId);
    } catch {
      this.resolved.add(key);
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
