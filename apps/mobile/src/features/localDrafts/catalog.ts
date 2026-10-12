import { tripSettingsSchema } from '@travel-budget/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { expenseOptionsSchema, landingSchema, tripsSchema } from '@/api/contracts';
import type { DraftTripStore } from '@/storage/draftTrips';
import type { PendingScope } from '@/storage/pendingExpenses';

const keyOf = (scope: PendingScope, tripId: string) =>
  JSON.stringify([scope.environment, scope.accountId, tripId]);
/** Observes validated server reads without persisting Query cache or any ledger data. */
export class DraftCatalog {
  private tail: Promise<unknown> = Promise.resolve();
  private blocked = new Map<string, { scope: PendingScope; tripId: string }>();
  private events = new Map<string, object>();
  private archives = new Map<string, object>();
  private denials = new Map<string, object>();
  private unsavedDenials = new Map<string, { scope: PendingScope; tripId: string }>();
  private failures = new Set<string>();
  private listeners = new Set<() => void>();
  private state = { revision: 0, storageFailed: false };
  constructor(
    private open: () => Promise<DraftTripStore>,
    private now = Date.now
  ) {}
  hasDenied(scope: PendingScope) {
    return [...this.blocked.values()].some(
      (item) =>
        item.scope.environment === scope.environment && item.scope.accountId === scope.accountId
    );
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(storageFailed = this.state.storageFailed) {
    this.state = { revision: this.state.revision + 1, storageFailed };
    this.listeners.forEach((listener) => listener());
  }
  private enqueue(
    taskKey: string,
    task: (store: DraftTripStore) => Promise<void>,
    notifyFailure = true
  ) {
    const run = this.tail.then(async () => task(await this.open()));
    this.tail = run.then(
      () => {
        this.failures.delete(taskKey);
        this.publish(this.failures.size > 0);
      },
      () => {
        this.failures.add(taskKey);
        if (notifyFailure) this.publish(true);
      }
    );
    return run;
  }
  deny(scope: PendingScope, tripId: string) {
    const key = keyOf(scope, tripId);
    const denied = { scope, tripId };
    this.denials.set(key, denied);
    this.archives.set(key, denied);
    this.events.set(key, denied);
    this.blocked.set(key, denied);
    this.unsavedDenials.set(key, denied);
    this.publish(); // Hide immediately, before SQLite resolves (even if it fails).
    return this.enqueue(`deny:${key}`, async (store) => {
      await store.deny(scope, tripId);
      if (this.unsavedDenials.get(key) === denied) this.unsavedDenials.delete(key);
    });
  }
  rememberOptions(scope: PendingScope, tripId: string, input: unknown) {
    const options = expenseOptionsSchema.parse(input);
    const key = keyOf(scope, tripId);
    const event = {};
    this.events.set(key, event);
    return this.enqueue(`options:${key}`, async (store) => {
      await store.rememberOptions(scope, tripId, options, this.now());
      if (this.events.get(key) === event) {
        this.blocked.delete(key);
        this.unsavedDenials.delete(key);
        this.failures.delete(`deny:${key}`);
      }
    });
  }
  rememberName(scope: PendingScope, tripId: string, name: string) {
    return this.enqueue(`name:${keyOf(scope, tripId)}`, (store) =>
      store.rememberName(scope, tripId, name, this.now())
    );
  }
  /** Drain catalog writes and invalidate older reads before SQLite completes the receipt. */
  beforeArchiveCompletion(scope: PendingScope, tripId: string) {
    this.archives.set(keyOf(scope, tripId), {});
    return this.tail.then(() => undefined);
  }
  archiveSaved(scope: PendingScope, tripId: string) {
    const key = keyOf(scope, tripId);
    this.archives.set(key, {});
    this.failures.delete(`archive:${key}`);
    this.publish(this.failures.size > 0);
  }
  captureArchive(scope: PendingScope) {
    const versions = new Map(this.archives);
    return (tripId: string) =>
      versions.get(keyOf(scope, tripId)) === this.archives.get(keyOf(scope, tripId));
  }
  /** A known read or committed receipt only; never grants access or alters drafts. */
  rememberArchived(scope: PendingScope, tripId: string, archived: boolean) {
    const key = keyOf(scope, tripId);
    this.archives.set(key, {});
    return this.enqueue(`archive:${key}`, (store) =>
      store.rememberArchived(scope, tripId, archived, this.now())
    );
  }
  private async readable() {
    await this.tail;
    // A failed tombstone is retried before exposing any persisted snapshot.
    for (const [key, denied] of this.unsavedDenials) {
      await this.enqueue(
        `deny:${key}`,
        async (store) => {
          // A queued successful authorization may have already replaced this failed denial.
          if (this.unsavedDenials.get(key) !== denied) return;
          await store.deny(denied.scope, denied.tripId);
          if (this.unsavedDenials.get(key) === denied) this.unsavedDenials.delete(key);
        },
        false
      );
    }
    return this.open();
  }
  /** Capture every trip's denial generation before asynchronous storage/refresh waits. */
  captureAccess(scope: PendingScope) {
    const versions = new Map(this.denials);
    return (tripId?: string) => {
      if (tripId && versions.get(keyOf(scope, tripId)) !== this.denials.get(keyOf(scope, tripId)))
        throw new ApiError('CANCELLED');
    };
  }
  accessVersion(scope: PendingScope, tripId: string) {
    return this.denials.get(keyOf(scope, tripId));
  }
  isVisible(scope: PendingScope, tripId: string) {
    return !this.blocked.has(keyOf(scope, tripId));
  }
  async list(scope: PendingScope) {
    return (await (await this.readable()).list(scope)).filter(
      (trip) => !this.blocked.has(keyOf(scope, trip.tripId))
    );
  }
  async get(scope: PendingScope, tripId: string) {
    await this.tail;
    if (this.blocked.has(keyOf(scope, tripId))) return null;
    const trip = await (await this.readable()).get(scope, tripId);
    return this.blocked.has(keyOf(scope, tripId)) ? null : trip;
  }
  observe(client: QueryClient) {
    const reads = new WeakMap<object, { denial: object | undefined }>();
    const archiveReads = new WeakMap<
      object,
      { versions: Map<string, object>; retainedPages: Set<unknown> }
    >();
    return client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const [environment, accountId, resource, tripId] = event.query.queryKey;
      if (typeof environment !== 'string' || typeof accountId !== 'string') return;
      const scope = { environment, accountId };
      const optionsKey =
        resource === 'expense-options' && typeof tripId === 'string' ? keyOf(scope, tripId) : null;
      if (
        event.action.type === 'fetch' &&
        ['trips', 'trip', 'trip-settings'].includes(String(resource))
      ) {
        const old = event.query.state.data as { pages?: unknown[] } | undefined;
        archiveReads.set(event.query, {
          versions: new Map(this.archives),
          // Only fetch-more retains old pages. A fresh refetch must be observed even when
          // React Query structurally shares an identical page with its previous cache.
          retainedPages: new Set(event.query.state.fetchMeta?.fetchMore ? old?.pages : []),
        });
      }
      if (event.action.type === 'fetch' && optionsKey) {
        // Authorization belongs to the generation in which the read began, not when it arrived.
        reads.set(event.query, { denial: this.denials.get(optionsKey) });
      }
      if (event.action.type === 'error') {
        reads.delete(event.query);
        const error = event.action.error;
        // A missing individual expense is not evidence of losing trip membership.
        if (
          typeof tripId === 'string' &&
          ['trip', 'expense-options', 'expenses', 'settlement'].includes(String(resource)) &&
          error instanceof ApiError &&
          error.source === 'request' &&
          [403, 404].includes(error.status)
        )
          void this.deny(scope, tripId).catch(() => undefined);
      }
      if (event.action.type === 'setState') {
        const error = event.query.state.error;
        if (
          resource === 'expense-options' &&
          typeof tripId === 'string' &&
          error instanceof ApiError &&
          error.source === 'request' &&
          [403, 404].includes(error.status)
        )
          void this.deny(scope, tripId).catch(() => undefined);
      }
      if (event.action.type !== 'success' || event.action.manual) return;
      const data = event.action.data;
      const readArchives = archiveReads.get(event.query);
      archiveReads.delete(event.query);
      const rememberArchive = (id: string, archived: boolean) => {
        const key = keyOf(scope, id);
        if (
          !readArchives ||
          readArchives.versions.get(key) !== this.archives.get(key) ||
          !this.isVisible(scope, id)
        )
          return;
        void this.rememberArchived(scope, id, archived).catch(() => undefined);
      };
      if (resource === 'expense-options' && typeof tripId === 'string') {
        const read = reads.get(event.query);
        reads.delete(event.query);
        // Unknown starts and reads superseded by a denial cannot overwrite the disk tombstone.
        if (!read || read.denial !== this.denials.get(optionsKey!)) return;
        const options = expenseOptionsSchema.safeParse(data);
        if (options.success)
          void this.rememberOptions(scope, tripId, options.data).catch(() => undefined);
      }
      if (resource === 'trip') {
        const trip = landingSchema.safeParse(data);
        if (trip.success) {
          void this.rememberName(scope, trip.data.id, trip.data.name).catch(() => undefined);
          rememberArchive(trip.data.id, trip.data.archived);
        }
      }
      if (resource === 'trip-settings') {
        const trip = tripSettingsSchema.safeParse(data);
        if (trip.success) rememberArchive(trip.data.tripId, trip.data.archived);
      }
      if (resource === 'trips') {
        const pages = data as { pages?: unknown[] } | undefined;
        for (const page of pages?.pages ?? []) {
          // Infinite-query successes also contain earlier pages. Do not replay their old
          // archive states when a different page arrives after a confirmed change.
          if (!page || typeof page !== 'object' || readArchives?.retainedPages.has(page)) continue;
          const parsed = tripsSchema.safeParse(page);
          if (parsed.success)
            for (const trip of parsed.data.items) {
              void this.rememberName(scope, trip.id, trip.name).catch(() => undefined);
              rememberArchive(trip.id, trip.archived);
            }
        }
      }
    });
  }
}
