import { ApiError } from '@/api/client';
import type { TripSettings } from '@/api/contracts';
import type { MutationOutcome } from '@/features/tripEntry/engine';

type State = {
  status: 'idle' | 'reading' | 'review' | 'sending' | 'conflict' | 'done' | 'pending' | 'error';
  context?: TripSettings;
  archived?: boolean;
  error?: unknown;
  refreshed?: boolean;
  refreshing?: boolean;
};
export type ArchiveDependencies = {
  current: () => boolean;
  guard: () => Promise<() => void>;
  read: (guard: () => void) => Promise<TripSettings>;
  confirm: (body: { expected_revision: string; archived: boolean }) => Promise<MutationOutcome>;
  refresh?: () => Promise<void>;
  failed: (error: unknown) => Promise<void>;
};
/** Unconfirmed review stays in memory; confirmation delegates to the existing durable E engine. */
export class ArchiveFlow {
  private state: State = { status: 'idle' };
  private listeners = new Set<() => void>();
  private lifetime = 0;
  private active = true;
  private flight = false;
  constructor(
    private deps: ArchiveDependencies,
    private baseline?: Pick<TripSettings, 'archived'> &
      Partial<Pick<TripSettings, 'archiveRevision'>>
  ) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  activate() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    this.lifetime++;
  }
  cancel() {
    if (!this.flight && this.state.status !== 'pending')
      this.publish({ status: 'idle', context: this.state.context });
  }
  invalidate() {
    if (this.state.status === 'review') this.cancel();
  }
  private publish(state: State) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  private async run(task: (guard: () => void, current: () => boolean) => Promise<void>) {
    if (!this.active || this.flight || this.state.status === 'pending') return;
    this.flight = true;
    const lifetime = this.lifetime;
    try {
      const captured = await this.deps.guard();
      const guard = () => {
        captured();
        if (!this.active || lifetime !== this.lifetime) throw new Error('CANCELLED');
      };
      guard();
      await task(guard, () => this.active && lifetime === this.lifetime && this.deps.current());
    } catch (error) {
      if (this.active && lifetime === this.lifetime && this.deps.current()) {
        try {
          await this.deps.failed(error);
        } catch {
          error = new ApiError('STORAGE');
        }
        if (this.active && lifetime === this.lifetime && this.deps.current())
          this.publish(
            this.state.status === 'done'
              ? { ...this.state, refreshing: false, refreshed: false, error }
              : { status: 'error', error }
          );
      }
    } finally {
      this.flight = false;
    }
  }
  review() {
    return this.run(async (guard) => {
      this.publish({ status: 'reading' });
      const data = await this.deps.read(guard);
      guard();
      const changed =
        this.baseline &&
        (data.archived !== this.baseline.archived ||
          (this.baseline.archiveRevision !== undefined &&
            data.archiveRevision !== this.baseline.archiveRevision));
      this.baseline = data;
      this.publish(
        changed
          ? { status: 'conflict', context: data }
          : { status: 'review', context: data, archived: !data.archived }
      );
    });
  }
  refresh() {
    if (this.state.status !== 'done' || !this.deps.refresh || this.flight) return Promise.resolve();
    this.publish({ ...this.state, refreshing: true });
    return this.run(async (guard, current) => {
      guard();
      await this.deps.refresh!();
      if (current())
        this.publish({ ...this.state, refreshing: false, refreshed: true, error: undefined });
    });
  }
  submit() {
    const prepared = this.state;
    if (prepared.status !== 'review' || !prepared.context || prepared.archived === undefined)
      return Promise.resolve();
    return this.run(async (guard, current) => {
      guard();
      this.publish({ ...prepared, status: 'sending' });
      const outcome = await this.deps.confirm({
        expected_revision: prepared.context!.archiveRevision,
        archived: prepared.archived!,
      });
      if (!current()) return;
      if (outcome.kind === 'pending') this.publish({ status: 'pending' });
      else if (outcome.kind === 'completed') {
        this.baseline = undefined;
        this.publish(
          outcome.result.status === 'committed'
            ? { status: 'done', archived: prepared.archived, refreshed: outcome.refreshed }
            : { status: 'conflict' }
        );
      } else
        this.publish({
          status: 'error',
          error:
            outcome.kind === 'blocked'
              ? 'blocked'
              : outcome.kind === 'not-sent'
                ? (outcome.error ?? 'not-sent')
                : 'not-sent',
        });
    });
  }
}
