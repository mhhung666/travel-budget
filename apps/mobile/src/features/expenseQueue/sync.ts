import { ApiError } from '@/api/client';
import {
  expenseOptionsSchema,
  expensePreviewSchema,
  expenseCreateInput,
  expensePreviewInput,
  type ExpenseOptions,
} from '@/api/contracts';
import type { StoredExpenseDraft } from '@/storage/expenseDrafts';
import type { PendingScope } from '@/storage/pendingExpenses';
import type { ExpenseQueueStore, QueuedExpense } from '@/storage/expenseQueue';
import { confirmedFields, previewInputOf, validateDraft } from '@/features/expenses/draft';
import {
  reasonOf,
  type EntryRequest,
  type ExpenseEntry,
  type EntryOutcome,
} from '@/features/expenses/entry';

export interface QueueDeps {
  store: () => Promise<ExpenseQueueStore>;
  entry: ExpenseEntry;
  request: EntryRequest;
  newId: () => string;
  /** Checks foreground, connectivity and the current authenticated account before every step. */
  active: (scope: PendingScope) => boolean;
  authorizationVersion?: (scope: PendingScope, tripId: string) => unknown;
  now?: () => number;
  onChange?: (scope: PendingScope) => void;
}
/** The user confirms an equal-split rule, never locally computed shares. HTTP stays backend-owned. */
export class ExpenseQueue {
  private runs = new Map<string, Promise<void>>();
  private state = { failedScopes: [] as string[] };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private failure(key: string, failed: boolean) {
    const scopes = new Set(this.state.failedScopes);
    if (failed) scopes.add(key);
    else scopes.delete(key);
    this.state = { failedScopes: [...scopes] };
    this.listeners.forEach((listener) => listener());
  }
  constructor(private deps: QueueDeps) {}
  private now = () => (this.deps.now ?? Date.now)();
  list(scope: PendingScope) {
    return this.deps.store().then((s) => s.list(scope));
  }
  async enqueue(draft: StoredExpenseDraft, options: ExpenseOptions) {
    if (validateDraft(draft.input, options).length) throw new Error('INVALID_DRAFT');
    // Shared HTTP schema enforces member count, IDs, amount and date without calculating splits.
    const input = previewInputOf(draft.input, options);
    if (!input) throw new Error('INVALID_DRAFT');
    expensePreviewInput.parse(input);
    await (await this.deps.store()).enqueue(draft, options, this.deps.newId());
    this.deps.onChange?.(draft);
  }
  async discard(record: QueuedExpense) {
    await (await this.deps.store()).discard(record);
    this.deps.onChange?.(record);
  }
  async restore(record: QueuedExpense, discardCurrent = false) {
    await (await this.deps.store()).restore(record, this.deps.newId(), discardCurrent);
    this.deps.onChange?.(record);
  }
  synchronize(scope: PendingScope): Promise<void> {
    const key = JSON.stringify([scope.environment, scope.accountId]);
    const existing = this.runs.get(key);
    if (existing) return existing;
    const run = this.run(scope)
      .then(
        () => this.failure(key, false),
        (error: unknown) => {
          this.failure(key, true);
          throw error;
        }
      )
      .finally(() => this.runs.delete(key));
    this.runs.set(key, run);
    return run;
  }
  private async pause(
    store: ExpenseQueueStore,
    r: QueuedExpense,
    error: unknown,
    attention = false
  ) {
    const seconds = error instanceof ApiError ? error.retryAfter : undefined;
    await store.pause(
      r,
      reasonOf(error),
      this.now() + Math.max(30, seconds ?? 30) * 1000,
      attention
    );
  }
  private async outcome(store: ExpenseQueueStore, r: QueuedExpense, outcome: EntryOutcome) {
    if (outcome.kind === 'saved' || outcome.kind === 'rejected' || outcome.kind === 'gone')
      return true;
    if (outcome.kind === 'unconfirmed') {
      const seconds = outcome.error instanceof ApiError ? outcome.error.retryAfter : undefined;
      await store.pause(r, outcome.reason, this.now() + Math.max(30, seconds ?? 30) * 1000);
    } else await store.pause(r, 'storage', this.now() + 30_000);
    return false;
  }
  private async run(scope: PendingScope) {
    if (!this.deps.active(scope)) return;
    const store = await this.deps.store();
    try {
      for (const r of await store.list(scope)) {
        if (!this.deps.active(scope)) return;
        if (r.status === 'attention' || r.status === 'resolved') continue;
        if (r.nextAt > this.now()) return;
        const version = this.deps.authorizationVersion?.(scope, r.tripId);
        const stillAuthorized = () => version === this.deps.authorizationVersion?.(scope, r.tripId);
        // C awaits its serial queue and SQLite reads/status writes; refresh can await again.
        // Pass this guard all the way to transport, which runs it synchronously before each fetch.
        const beforeSend = () => {
          if (!stillAuthorized()) throw new ApiError('ACCESS_REVOKED', 403);
          if (!this.deps.active(scope)) throw new ApiError('CANCELLED');
        };
        if (r.status === 'prepared') {
          // After a crash / lost response, ask before repeating the frozen UUID and payload.
          const found = await this.deps.entry.lookup(scope, r.clientRequestId);
          if (
            found.kind === 'unconfirmed' &&
            found.reason === 'not-found' &&
            this.deps.active(scope)
          ) {
            // A previous 409 is an ID conflict to investigate, not authorization to overwrite it.
            if (r.reason === 'conflict') return;
            const sent = await this.deps.entry.retry(scope, r.clientRequestId, beforeSend);
            if (!(await this.outcome(store, r, sent))) return;
          } else if (!(await this.outcome(store, r, found))) return;
          continue;
        }
        try {
          const path = `/trips/${encodeURIComponent(r.tripId)}`;
          const options = await this.deps.request(
            scope.accountId,
            `${path}/expense-options`,
            expenseOptionsSchema
          );
          if (!this.deps.active(scope)) return;
          if (!stillAuthorized()) {
            await store.pause(r, 'access', 0, true);
            continue;
          }
          if (
            JSON.stringify(options.members.map((m) => m.id)) !== JSON.stringify(r.roster) ||
            validateDraft(r.input, options).length
          ) {
            await store.pause(r, 'members', 0, true);
            continue;
          }
          const preview = await this.deps.request(
            scope.accountId,
            `${path}/expenses/preview`,
            expensePreviewSchema,
            { method: 'POST', body: previewInputOf(r.input, options) }
          );
          if (!this.deps.active(scope)) return;
          if (!stillAuthorized()) {
            await store.pause(r, 'access', 0, true);
            continue;
          }
          const payload = expenseCreateInput.parse({
            ...confirmedFields(r.input, options, preview),
            client_request_id: r.clientRequestId,
          });
          if (!(await store.prepare(r, payload))) return;
          if (!this.deps.active(scope)) return;
          // SQLite handoff is asynchronous too: a newer denial may arrive during its transaction.
          // Keep the frozen request under C, but do not start a write using the stale preflight.
          if (!stillAuthorized()) {
            await store.pause(r, 'access', 0);
            return;
          }
          const sent = await this.deps.entry.retry(scope, r.clientRequestId, beforeSend);
          if (!(await this.outcome(store, r, sent))) return;
        } catch (error) {
          // Before prepare no write was attempted; denial requires explicit review, credentials pause.
          const live = (await store.list(scope)).find(
            (item) => item.clientRequestId === r.clientRequestId
          );
          if (!live) continue;
          const review =
            live.status === 'queued' &&
            error instanceof ApiError &&
            error.source === 'request' &&
            [400, 403, 404, 413, 415].includes(error.status);
          await this.pause(store, live, error, review);
          return;
        }
      }
    } finally {
      this.deps.onChange?.(scope);
    }
  }
}
