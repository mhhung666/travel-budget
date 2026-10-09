import {
  expenseSearchFiltersSchema,
  expenseSearchV2Schema,
  type ExpenseSearchFilters,
  type ExpenseSearchResult,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { isAccessDenied } from '@/features/auth/errorMessage';
export const emptySearch: ExpenseSearchFilters = { keyword: '' };
export function searchPath(tripId: string, filters: ExpenseSearchFilters, cursor?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(expenseSearchFiltersSchema.parse(filters)))
    if (value) params.set(key, value);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return `/trips/${encodeURIComponent(tripId)}/expense-search${query ? `?${query}` : ''}`;
}
export interface SearchState {
  filters: ExpenseSearchFilters;
  data: ExpenseSearchResult | null;
  busy: boolean;
  error: unknown;
  restart: boolean;
}
interface Dependencies {
  guard(): Promise<() => void>;
  read(
    filters: ExpenseSearchFilters,
    cursor: string | undefined,
    beforeSend: () => void,
    signal: AbortSignal
  ): Promise<unknown>;
  failure(error: unknown): Promise<void>;
}
/** Screen-only data. A new filter cancels the old read; pages may never span revisions. */
export class ExpenseSearchReader {
  private state: SearchState = {
    filters: emptySearch,
    data: null,
    busy: false,
    error: null,
    restart: false,
  };
  private generation = 0;
  private controller?: AbortController;
  private listeners = new Set<() => void>();
  constructor(private readonly deps: Dependencies) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(change: Partial<SearchState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((fn) => fn());
  }
  cancel = () => {
    this.generation++;
    this.controller?.abort();
    this.publish({ busy: false });
  };
  apply = (input: ExpenseSearchFilters) => {
    const filters = expenseSearchFiltersSchema.parse(input);
    this.publish({ filters, data: null, error: null, restart: false });
    return this.load(false);
  };
  refresh = () => this.load(false);
  more = () =>
    this.state.busy || this.state.restart || !this.state.data?.nextCursor
      ? Promise.resolve()
      : this.load(true);
  private async load(append: boolean) {
    const v = ++this.generation;
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    const { filters, data: previous } = this.state;
    const cursor = append ? (previous?.nextCursor ?? undefined) : undefined;
    this.publish({ busy: true, error: null });
    try {
      const access = await this.deps.guard();
      const beforeSend = () => {
        if (v !== this.generation || controller.signal.aborted) throw new ApiError('CANCELLED');
        access();
      };
      beforeSend();
      const data = expenseSearchV2Schema.parse(
        await this.deps.read(filters, cursor, beforeSend, controller.signal)
      );
      beforeSend();
      if (JSON.stringify(data.filters) !== JSON.stringify(filters))
        throw new ApiError('INVALID_RESPONSE');
      if (
        append &&
        (data.revision !== previous?.revision ||
          data.ledger.baseCurrency !== previous.ledger.baseCurrency)
      )
        throw new ApiError('RESOURCE_CHANGED', 409);
      this.publish({
        data: append ? { ...data, items: [...previous!.items, ...data.items] } : data,
        restart: false,
      });
    } catch (error) {
      if (isAccessDenied(error)) this.publish({ data: null });
      // A late server denial/rate limit still applies to the current account, even after filter changes.
      try {
        await this.deps.failure(error);
      } catch (failure) {
        error = failure;
      }
      if (v === this.generation)
        this.publish({
          error,
          restart:
            this.state.restart || (error instanceof ApiError && error.code === 'RESOURCE_CHANGED'),
        });
    } finally {
      if (v === this.generation) this.publish({ busy: false });
    }
  }
}
