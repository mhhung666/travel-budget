import type { ExpenseDraft, StoredExpenseDraft } from '@/storage/expenseDrafts';
import type { PendingExpenseStore, PendingScope } from '@/storage/pendingExpenses';

export interface DraftEditorState {
  phase: 'loading' | 'choice' | 'editing' | 'error';
  record?: StoredExpenseDraft;
  status: 'saving' | 'saved' | 'failed';
  discardFailed?: boolean;
}
const editorQueues = new Map<string, Promise<unknown>>();

/** Owns queued saves independently of a mounted form. Every write carries a generation/revision. */
export class DraftEditor {
  private state: DraftEditorState = { phase: 'loading', status: 'saving' };
  private listeners = new Set<() => void>();
  private closed = false;
  private started = false;
  constructor(
    private deps: {
      store: () => Promise<PendingExpenseStore>;
      scope: PendingScope;
      tripId: string;
      initial: () => ExpenseDraft;
      newId: () => string;
      now?: () => number;
    }
  ) {}
  /** Updates defaults for future drafts; the current input and its saved revision stay intact. */
  setInitial(initial: () => ExpenseDraft) {
    this.deps.initial = initial;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DraftEditorState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    // A newly mounted editor waits for ALL writes queued by the previous screen of this trip.
    const key = JSON.stringify([
      this.deps.scope.environment,
      this.deps.scope.accountId,
      this.deps.tripId,
    ]);
    const run = (editorQueues.get(key) ?? Promise.resolve()).then(task);
    const tail = run.catch(() => undefined);
    editorQueues.set(key, tail);
    void tail.then(() => {
      if (editorQueues.get(key) === tail) editorQueues.delete(key);
    });
    return run;
  }
  private now = () => (this.deps.now ?? Date.now)();

  initialize = (resume = false) =>
    this.serial(async () => {
      if (this.closed) return;
      this.publish({ phase: 'loading', status: 'saving' });
      try {
        const store = await this.deps.store();
        const record = await store.drafts.load(this.deps.scope, this.deps.tripId);
        this.started = !!record;
        if (record) this.publish({ phase: resume ? 'editing' : 'choice', record, status: 'saved' });
        else await this.start();
      } catch {
        this.publish({ phase: 'error', status: 'failed' });
      }
    });
  private async start() {
    const record: StoredExpenseDraft = {
      ...this.deps.scope,
      tripId: this.deps.tripId,
      draftId: this.deps.newId(),
      revision: 1,
      input: this.deps.initial(),
      updatedAt: this.now(),
    };
    this.started = false;
    this.publish({ phase: 'editing', record, status: 'saving' });
    await this.persist(record);
  }
  restore = () => {
    if (this.state.phase === 'choice') this.publish({ ...this.state, phase: 'editing' });
  };
  edit = (input: ExpenseDraft) => {
    if (this.closed || this.state.phase !== 'editing' || !this.state.record) return;
    const record = {
      ...this.state.record,
      input,
      revision: this.state.record.revision + 1,
      updatedAt: this.now(),
    };
    this.publish({ phase: 'editing', record, status: 'saving' });
    void this.serial(() => this.persist(record));
  };
  private async persist(record: StoredExpenseDraft): Promise<boolean> {
    try {
      const store = await this.deps.store();
      if (!this.started) {
        await store.drafts.start(record);
        this.started = true;
      } else if (!(await store.drafts.save(record))) throw new Error('DRAFT_CHANGED');
      if (!this.closed && this.state.record === record)
        this.publish({ ...this.state, status: 'saved' });
      return true;
    } catch {
      if (!this.closed && this.state.record === record)
        this.publish({ ...this.state, status: 'failed' });
      return false;
    }
  }
  /** Also used on background/unmount: queued edits keep running even when UI disappears. */
  flush = () =>
    this.serial(async () => {
      const record = this.state.record;
      if (this.closed || this.state.phase !== 'editing' || !record)
        throw new Error('DRAFT_NOT_EDITING');
      if (this.state.status !== 'saved') {
        this.publish({ ...this.state, status: 'saving' });
        if (!(await this.persist(record))) throw new Error('DRAFT_SAVE_FAILED');
      }
      return record;
    });
  discard = () =>
    this.serial(async () => {
      if (this.closed || !this.state.record) return;
      const previous = this.state;
      const record = previous.record!;
      this.publish({ ...previous, phase: 'loading', discardFailed: false });
      try {
        await (await this.deps.store()).drafts.discard(record, record.tripId, record.draftId);
        await this.start();
      } catch {
        this.publish({ ...previous, discardFailed: true });
      }
    });
  /** After handoff, old screen cleanup is forbidden from trying to save again. */
  close = () => {
    this.closed = true;
  };
}
