import type { QueryClient } from '@tanstack/react-query';
import { expenseSearchFiltersSchema, type ExpenseSearchFilters } from '@travel-budget/contracts';
import { emptySearch, ExpenseSearchReader, type SearchState } from './search';
import { ApiError } from '@/api/client';

export const hasSearchFilters = (filters: ExpenseSearchFilters) =>
  Object.values(filters).some(Boolean);
export interface BrowseState {
  search: SearchState;
  fields: ExpenseSearchFilters;
  tools: boolean;
  analysis: boolean;
  invalid: boolean;
  dirty: boolean;
  updated: boolean;
  positionVersion: number;
}
/** One in-memory list session per login/trip. Typing never performs a read. */
export class ExpenseBrowseSession {
  private state: BrowseState;
  private listeners = new Set<() => void>();
  private stop: () => void;
  private revision = 0;
  offset = 0;
  focused = false;
  focus = () => {
    this.focused = true;
  };
  blur = () => {
    this.focused = false;
    this.reader.cancel();
  };
  saveOffset = (offset: number) => {
    this.offset = Math.max(0, offset);
  };
  constructor(readonly reader: ExpenseSearchReader) {
    this.state = {
      search: reader.getSnapshot(),
      fields: emptySearch,
      tools: false,
      analysis: false,
      invalid: false,
      dirty: false,
      updated: false,
      positionVersion: 0,
    };
    this.stop = reader.subscribe(() => this.publish({ search: reader.getSnapshot() }));
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<BrowseState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((fn) => fn());
  }
  get searching() {
    return this.state.analysis || hasSearchFilters(this.state.search.filters);
  }
  fields = (fields: ExpenseSearchFilters) => this.publish({ fields, invalid: false });
  tools = () => this.publish({ tools: !this.state.tools });
  private top() {
    this.offset = 0;
    this.publish({ positionVersion: this.state.positionVersion + 1 });
  }
  apply = async (input = this.state.fields) => {
    const parsed = expenseSearchFiltersSchema.safeParse(input);
    this.publish({ invalid: !parsed.success });
    if (!parsed.success) return;
    this.publish({ fields: parsed.data, updated: false });
    this.top();
    if (hasSearchFilters(parsed.data) || this.state.analysis) {
      const revision = this.revision;
      if ((await this.reader.apply(parsed.data)) && revision === this.revision) this.finishUpdate();
    } else {
      this.reader.reset();
    }
  };
  clear = () => {
    this.reader.reset();
    this.publish({ fields: emptySearch, analysis: false, invalid: false, updated: false });
    this.top();
  };
  toggleAnalysis = async () => {
    const wasSearching = this.searching;
    this.publish({ analysis: !this.state.analysis });
    if (wasSearching !== this.searching) {
      this.top();
      // Opening analysis is an explicit snapshot read. A closed snapshot may have changed
      // through ordinary refresh or Web writes, even when Query has already become fresh.
      if (this.searching) this.reader.reset();
    }
    if (this.searching) await this.ensureSearch();
    else this.reader.cancel();
  };
  ensureSearch = async () => {
    if (!this.searching || this.state.search.busy) return;
    if (
      this.state.dirty ||
      (!this.state.search.data &&
        (!this.state.search.error ||
          (this.state.search.error instanceof ApiError &&
            this.state.search.error.code === 'CANCELLED')))
    )
      await this.refreshSearch();
  };
  refreshSearch = async () => {
    const revision = this.revision;
    if ((await this.reader.refresh()) && revision === this.revision) this.finishUpdate();
  };
  more = () => (this.state.dirty ? Promise.resolve(false) : this.reader.more());
  invalidate = () => {
    this.revision++;
    this.reader.invalidate();
    this.publish({ dirty: true });
  };
  finishUpdate = () => {
    if (!this.state.dirty) return;
    this.publish({ dirty: false, updated: true });
    this.top();
  };
  afterRead = () => {
    const revision = this.revision;
    return () => {
      if (revision === this.revision) this.finishUpdate();
    };
  };
  deny = () => {
    this.clear();
    this.publish({ tools: false, dirty: false, updated: false });
  };
  dispose = () => {
    this.deny();
    this.stop();
    this.listeners.clear();
  };
}

export class ExpenseBrowseRegistry {
  private sessions = new Map<string, ExpenseBrowseSession>();
  constructor(private readonly create: (tripId: string) => ExpenseSearchReader) {}
  get(tripId: string) {
    let session = this.sessions.get(tripId);
    if (!session) {
      session = new ExpenseBrowseSession(this.create(tripId));
      this.sessions.set(tripId, session);
    }
    return session;
  }
  denyHidden(visible: (tripId: string) => boolean) {
    for (const [id, session] of this.sessions) if (!visible(id)) session.deny();
  }
  invalidate(tripId: string) {
    this.sessions.get(tripId)?.invalidate();
  }
  suspend() {
    this.sessions.forEach((session) => session.reader.cancel());
  }
  resume() {
    this.sessions.forEach((session) => {
      if (session.focused) void session.ensureSearch();
    });
  }
  dispose() {
    this.sessions.forEach((session) => session.dispose());
    this.sessions.clear();
  }
}
// The existing confirmed-write refresh notifies the screen reader as well as Query.
const readers = new WeakMap<
  QueryClient,
  Set<{
    environment: string;
    accountId: string;
    registry: ExpenseBrowseRegistry;
  }>
>();
export function registerExpenseBrowsers(
  client: QueryClient,
  environment: string,
  accountId: string,
  registry: ExpenseBrowseRegistry
) {
  const registrations = readers.get(client) ?? new Set();
  readers.set(client, registrations);
  const registration = { environment, accountId, registry };
  registrations.add(registration);
  return () => {
    registrations.delete(registration);
    registry.suspend();
    // React StrictMode replays effects. Retain sessions if this registry immediately reattaches.
    queueMicrotask(() => {
      if (![...registrations].some((entry) => entry.registry === registry)) registry.dispose();
    });
  };
}
export function invalidateExpenseBrowsers(
  client: QueryClient,
  environment: string,
  accountId: string,
  tripId: string
) {
  for (const reader of readers.get(client) ?? [])
    if (reader.environment === environment && reader.accountId === accountId)
      reader.registry.invalidate(tripId);
}
