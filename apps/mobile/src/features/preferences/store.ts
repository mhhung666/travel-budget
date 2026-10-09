import { z } from 'zod';

export const preferencesSchema = z
  .object({
    version: z.literal(1),
    language: z.enum(['system', 'zh', 'zh-CN', 'en', 'jp']),
    appearance: z.enum(['system', 'light', 'dark']),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaults: Preferences = { version: 1, language: 'system', appearance: 'system' };
export interface PreferenceStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}
interface State {
  value: Preferences;
  ready: boolean;
  loaded: boolean;
  busy: boolean;
  error: 'load' | 'save' | null;
}
/** Device-wide, non-sensitive preferences. Publish a selection only after it is durable. */
export class PreferenceStore {
  private state: State = { value: defaults, ready: false, loaded: false, busy: false, error: null };
  private listeners = new Set<() => void>();
  private tail: Promise<void> = Promise.resolve();
  private starting?: Promise<void>;
  constructor(private readonly storage: PreferenceStorage) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private enqueue(work: () => Promise<void>) {
    const next = this.tail.then(work);
    this.tail = next.catch(() => {});
    return next;
  }
  start = () => (this.starting ??= this.reload());
  reload = () =>
    this.enqueue(async () => {
      this.publish({ busy: true, error: null });
      try {
        const raw = await this.storage.read();
        const value = raw === null ? defaults : preferencesSchema.parse(JSON.parse(raw));
        this.publish({ value, loaded: true });
      } catch {
        this.publish({ error: 'load', loaded: false });
      } finally {
        this.publish({ ready: true, busy: false });
      }
    });
  update = (patch: Partial<Omit<Preferences, 'version'>>) =>
    this.enqueue(async () => {
      if (!this.state.loaded) return;
      await this.save({ ...this.state.value, ...patch });
    });
  // Explicit recovery for corrupt/unreadable preferences; never touches account or queue data.
  reset = () => this.enqueue(() => this.save(defaults));
  private async save(input: Preferences) {
    this.publish({ busy: true, error: null });
    try {
      const value = preferencesSchema.parse(input);
      await this.storage.write(JSON.stringify(value));
      this.publish({ value, loaded: true });
    } catch {
      this.publish({ error: 'save' });
    } finally {
      this.publish({ ready: true, busy: false });
    }
  }
}
