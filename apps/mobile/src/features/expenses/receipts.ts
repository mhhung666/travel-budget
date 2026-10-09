import {
  receiptAttachmentsV2Schema,
  receiptViewV2Schema,
  type ReceiptAttachments,
  type ReceiptView,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { isAccessDenied } from '@/features/auth/errorMessage';
interface Dependencies {
  guard(): Promise<() => void>;
  read(id: string | undefined, beforeSend: () => void, signal: AbortSignal): Promise<unknown>;
  failure(error: unknown): Promise<void>;
  open(url: string): Promise<void>;
}
interface State {
  list: ReceiptAttachments | null;
  view: ReceiptView | null;
  busy: boolean;
  loadingImage: boolean;
  error: unknown;
}
/** Screen-only metadata/URLs. Every open gets a fresh ticket; blur/background drops all data. */
export class ReceiptReader {
  private state: State = { list: null, view: null, busy: false, loadingImage: false, error: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private controller?: AbortController;
  private expiry?: ReturnType<typeof setTimeout>;
  constructor(private readonly deps: Dependencies) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private clearView() {
    clearTimeout(this.expiry);
    this.publish({ view: null, loadingImage: false });
  }
  cancel = () => {
    this.generation++;
    this.controller?.abort();
    this.clearView();
    this.publish({ list: null, busy: false, error: null });
  };
  refresh = () => this.load();
  open = (id: string, external = false) => this.load(id, external);
  imageLoaded = (view: ReceiptView) => {
    if (this.state.view === view) this.publish({ loadingImage: false });
  };
  imageFailed = (view: ReceiptView) => {
    if (this.state.view !== view) return;
    this.clearView();
    this.publish({ error: new ApiError('ATTACHMENT_UNAVAILABLE') });
  };
  close = () => this.clearView();
  private async load(id?: string, external = false) {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    const previous = this.state.list;
    this.clearView();
    this.publish({ busy: true, error: null, ...(id ? {} : { list: null }) });
    try {
      const access = await this.deps.guard();
      const check = () => {
        if (generation !== this.generation || controller.signal.aborted)
          throw new ApiError('CANCELLED');
        access();
      };
      check();
      const raw = await this.deps.read(id, check, controller.signal);
      check();
      if (!id) {
        this.publish({ list: receiptAttachmentsV2Schema.parse(raw) });
        return;
      }
      const view = receiptViewV2Schema.parse(raw);
      const item = previous?.items.find((item) => item.id === id);
      if (
        !item ||
        view.id !== id ||
        view.contentType !== item.contentType ||
        view.size !== item.size ||
        view.ledger.baseCurrency !== previous?.ledger.baseCurrency
      )
        throw new ApiError('INVALID_RESPONSE');
      const remaining = view.expiresAt - Date.now();
      if (remaining <= 0 || remaining > 300_000) throw new ApiError('ATTACHMENT_EXPIRED');
      check();
      if (external || view.contentType === 'application/pdf') {
        // URL is handed off only on explicit user action, without API credentials.
        await this.deps.open(view.url);
      } else {
        this.publish({ view, loadingImage: true });
        this.expiry = setTimeout(() => {
          if (generation !== this.generation) return;
          this.clearView();
          this.publish({ error: new ApiError('ATTACHMENT_EXPIRED') });
        }, remaining);
      }
    } catch (error) {
      if (isAccessDenied(error)) {
        this.clearView();
        this.publish({ list: null });
      }
      try {
        await this.deps.failure(error);
      } catch (failure) {
        error = failure;
      }
      if (generation === this.generation) this.publish({ error });
    } finally {
      if (generation === this.generation) this.publish({ busy: false });
    }
  }
}
