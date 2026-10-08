import {
  mutationRequestSchema,
  tripAccessResultSchema,
  type TripAccessResult,
  memberMutationResultSchema,
  type MemberMutationResult,
  tripMutationResultSchema,
  tripManagementResultSchema,
  type TripManagementResult,
  expenseMutationResultSchema,
  paymentMutationResultSchema,
  type PaymentMutationResult,
  type MutationRequest,
  type TripMutationResult,
  type ExpenseMutationResult,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { LocalRateLimitError, type EntryRequest } from '@/features/expenses/entry';
import type { PendingScope } from '@/storage/pendingExpenses';
import {
  mutationPayload,
  type MutationPayload,
  type MutationStore,
  type PendingMutation,
} from '@/storage/mutations';
export type MutationOutcome =
  | { kind: 'completed'; result: MutationRequest; refreshed?: boolean }
  | { kind: 'pending'; error?: unknown }
  | { kind: 'not-sent'; error?: unknown }
  | { kind: 'blocked' };
interface Deps {
  store: () => Promise<MutationStore>;
  request: EntryRequest;
  newId: () => string;
  active: (scope: PendingScope) => boolean;
  /** Capture a synchronous guard before SQLite/serial waits; rejects intervening sign-in changes. */
  guard?: (scope: PendingScope) => (tripId?: string | null) => void;
  now?: () => number;
  changed?: (scope: PendingScope) => void;
  exited?: (scope: PendingScope, tripId: string) => void | Promise<void>;
  committed?: (scope: PendingScope, tripId: string, result: MutationRequest) => unknown;
}
export class TripEntry {
  private flights = new Map<string, Promise<MutationOutcome>>();
  private now: () => number;
  constructor(private deps: Deps) {
    this.now = deps.now ?? Date.now;
  }
  list(scope: PendingScope) {
    return this.deps.store().then((store) => store.list(scope));
  }
  private run(
    scope: PendingScope,
    task: (guard: (tripId?: string | null) => void) => Promise<MutationOutcome>
  ): Promise<MutationOutcome> {
    const key = JSON.stringify([scope.environment, scope.accountId]);
    const running = this.flights.get(key);
    if (running) return Promise.resolve({ kind: 'blocked' });
    const captured = this.deps.guard?.(scope);
    const guard = (tripId?: string | null) => {
      captured?.(tripId);
      if (!this.deps.active(scope)) throw new ApiError('CANCELLED');
    };
    const work = Promise.resolve()
      .then(() => task(guard))
      .finally(() => {
        if (this.flights.get(key) === work) this.flights.delete(key);
        this.deps.changed?.(scope);
      });
    this.flights.set(key, work);
    return work;
  }
  confirm(
    scope: PendingScope,
    payload: MutationPayload extends infer P
      ? P extends MutationPayload
        ? Omit<P, 'body'> & { body: Omit<P['body'], 'client_request_id'> }
        : never
      : never
  ) {
    return this.run(scope, async (guard) => {
      let record: PendingMutation;
      let store: MutationStore;
      try {
        guard('tripId' in payload ? payload.tripId : undefined);
        store = await this.deps.store();
        await this.ready(store, scope, guard);
        const parsed = mutationPayload.parse({
          ...payload,
          body: { ...payload.body, client_request_id: this.deps.newId() },
        });
        record = {
          ...scope,
          operation: parsed.operation,
          payload: parsed,
          result: null,
          clientRequestId: parsed.body.client_request_id,
          status: 'pending',
          conflict: false,
          createdAt: this.now(),
          tripId: 'tripId' in parsed ? parsed.tripId : null,
        };
        if (!(await store.insert(record))) return { kind: 'blocked' };
      } catch (error) {
        return { kind: 'not-sent', error };
      }
      return this.send(store, record, guard);
    });
  }
  lookup(scope: PendingScope, key: string) {
    return this.run(scope, async (guard) => {
      try {
        const store = await this.deps.store();
        const record = await store.get(scope, key);
        if (!record) return { kind: 'blocked' };
        if (record.result) return { kind: 'completed', result: record.result };
        return await this.query(store, record, guard);
      } catch (error) {
        return { kind: 'pending', error };
      }
    });
  }
  retry(scope: PendingScope, key: string) {
    return this.run(scope, async (guard) => {
      try {
        const store = await this.deps.store();
        const record = await store.get(scope, key);
        if (!record) return { kind: 'blocked' };
        if (record.result) return { kind: 'completed', result: record.result };
        // Every retry first asks for the original terminal result, including after a crash before POST.
        const queried = await this.query(store, record, guard);
        if (queried.kind !== 'pending' || queried.error || record.conflict) return queried;
        return this.send(store, record, guard);
      } catch (error) {
        return { kind: 'pending', error };
      }
    });
  }
  async recover(scope: PendingScope) {
    const records = await this.list(scope);
    for (const record of records) {
      if (!this.deps.active(scope)) return;
      if (record.status === 'pending') await this.lookup(scope, record.clientRequestId);
    }
  }
  async dismiss(scope: PendingScope, key: string) {
    await (await this.deps.store()).dismiss(scope, key);
    this.deps.changed?.(scope);
  }
  private async ready(
    store: MutationStore,
    scope: PendingScope,
    guard: (tripId?: string | null) => void
  ) {
    guard('tripId' in scope ? (scope as PendingMutation).tripId : undefined);
    const until = await store.retryAt(scope);
    guard('tripId' in scope ? (scope as PendingMutation).tripId : undefined);
    if (until > this.now()) throw new LocalRateLimitError(until, this.now());
  }
  private beforeSend(
    store: MutationStore,
    scope: PendingScope,
    guard: (tripId?: string | null) => void
  ) {
    return () => {
      guard('tripId' in scope ? (scope as PendingMutation).tripId : undefined);
      const until = store.rateLimitUntil(scope);
      if (until > this.now()) throw new LocalRateLimitError(until, this.now());
    };
  }
  private async failed(
    store: MutationStore,
    record: PendingMutation,
    error: unknown
  ): Promise<MutationOutcome> {
    try {
      if (
        error instanceof ApiError &&
        error.status === 429 &&
        !(error instanceof LocalRateLimitError)
      )
        await store.pause(record, this.now() + (error.retryAfter ?? 30) * 1000);
      if (error instanceof ApiError && error.status === 409 && error.source === 'request')
        await store.conflict(record, record.clientRequestId);
    } catch (saveError) {
      return { kind: 'pending', error: saveError };
    }
    return { kind: 'pending', error };
  }
  private async finish(
    store: MutationStore,
    record: PendingMutation,
    result: MutationRequest
  ): Promise<MutationOutcome> {
    if (result.status === 'not_found') return { kind: 'pending' };
    if (
      result.status === 'committed' &&
      result.operation === 'trip.access' &&
      'exited' in result.result &&
      result.result.exited
    ) {
      // Drain older catalog saves before the atomic final tombstone; a failed separate
      // denial must not prevent complete() from persisting its own tombstone.
      await Promise.resolve()
        .then(() => this.deps.exited?.(record, result.result.tripId))
        .catch(() => undefined);
    }
    await store.complete(record, record.clientRequestId, result);
    let refreshed = true;
    if (result.status === 'committed') {
      try {
        await this.deps.committed?.(record, result.result.tripId, result);
      } catch {
        refreshed = false;
      }
    }
    return { kind: 'completed', result, refreshed };
  }
  private async query(
    store: MutationStore,
    record: PendingMutation,
    guard: (tripId?: string | null) => void
  ): Promise<MutationOutcome> {
    // After an exit the trip is hidden, but an account-scoped minimal receipt remains readable.
    const exiting =
      record.payload?.operation === 'trip.access' &&
      ['leave', 'delete'].includes(record.payload.body.action);
    const receiptScope = exiting
      ? { environment: record.environment, accountId: record.accountId }
      : record;
    try {
      await this.ready(store, receiptScope, guard);
      const result = await this.deps.request(
        record.accountId,
        `/mutation-requests/${record.clientRequestId}`,
        mutationRequestSchema,
        { beforeSend: this.beforeSend(store, receiptScope, guard) }
      );
      guard(exiting ? undefined : record.tripId);
      // A UUID collision may resolve another operation: display its result without replaying ours.
      return await this.finish(store, record, result);
    } catch (error) {
      return this.failed(store, record, error);
    }
  }
  private async send(
    store: MutationStore,
    record: PendingMutation,
    guard: (tripId?: string | null) => void
  ): Promise<MutationOutcome> {
    try {
      await this.ready(store, record, guard);
      const result = await this.deps.request<
        | TripMutationResult
        | ExpenseMutationResult
        | PaymentMutationResult
        | TripManagementResult
        | MemberMutationResult
        | TripAccessResult
      >(
        record.accountId,
        record.operation === 'trip.access'
          ? `/trips/${record.tripId}/access`
          : record.operation === 'member.create'
            ? `/trips/${record.tripId}/members`
            : record.operation === 'member.rename'
              ? `/trips/${record.tripId}/members/${record.payload?.operation === 'member.rename' ? record.payload.memberId : ''}`
              : record.operation === 'trip.update'
                ? `/trips/${record.tripId}`
                : record.operation === 'trip.archive'
                  ? `/trips/${record.tripId}/archive`
                  : record.operation === 'payment.create'
                    ? `/trips/${record.tripId}/payments`
                    : record.operation === 'payment.delete'
                      ? `/trips/${record.tripId}/payments/${record.payload?.operation === 'payment.delete' ? record.payload.paymentId : ''}`
                      : record.operation === 'trip.create'
                        ? '/trips'
                        : record.operation === 'trip.join'
                          ? '/trips/join'
                          : `/trips/${record.tripId}/expenses/${'expenseId' in record.payload! ? record.payload.expenseId : ''}`,
        record.operation === 'trip.access'
          ? tripAccessResultSchema
          : record.operation.startsWith('member.')
            ? memberMutationResultSchema
            : record.operation === 'trip.update' || record.operation === 'trip.archive'
              ? tripManagementResultSchema
              : record.operation.startsWith('payment.')
                ? paymentMutationResultSchema
                : record.operation.startsWith('expense.')
                  ? expenseMutationResultSchema
                  : tripMutationResultSchema,
        {
          method:
            record.operation === 'member.rename' ||
            record.operation === 'expense.update' ||
            record.operation === 'trip.update'
              ? 'PATCH'
              : record.operation === 'expense.delete' || record.operation === 'payment.delete'
                ? 'DELETE'
                : 'POST',
          body: record.payload!.body,
          beforeSend: this.beforeSend(store, record, guard),
        }
      );
      guard(record.tripId);
      return await this.finish(store, record, {
        status: 'committed',
        operation: record.operation,
        resourceId:
          'memberId' in result
            ? result.memberId
            : 'expenseId' in result
              ? result.expenseId
              : 'paymentId' in result
                ? result.paymentId
                : result.tripId,
        result,
      });
    } catch (error) {
      const failed = await this.failed(store, record, error);
      // Preserve all earlier ambiguity, even API input rejection; only a terminal receipt clears it.
      if (
        failed.kind === 'pending' &&
        failed.error === error &&
        error instanceof ApiError &&
        ([404, 409].includes(error.status) ||
          ((record.operation === 'trip.update' ||
            record.operation === 'trip.access' ||
            record.operation.startsWith('member.')) &&
            error.status === 403 &&
            error.code === 'FORBIDDEN')) &&
        error.source === 'request'
      )
        return this.query(store, record, guard);
      return failed;
    }
  }
}
