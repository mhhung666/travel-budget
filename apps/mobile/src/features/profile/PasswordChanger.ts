import { passwordChangeInput, passwordChangeResultSchema } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';

const empty = { current: '', password: '', confirmation: '' };
export class PasswordChanger {
  private state = {
    ...empty,
    busy: false,
    uncertain: false,
    ending: false,
    error: undefined as unknown,
  };
  private listeners = new Set<() => void>();
  private active = true;
  private version: number;
  private actor: string;
  constructor(
    private manager: SessionManager,
    private available: () => boolean
  ) {
    this.version = manager.getSignInVersion();
    this.actor = manager.getSnapshot().user?.id ?? '';
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dispose() {
    this.active = false;
    this.state = { ...this.state, ...empty };
  }
  private current = () =>
    this.active &&
    this.manager.getSignInVersion() === this.version &&
    this.manager.getSnapshot().status === 'signedIn' &&
    this.manager.getSnapshot().user?.id === this.actor;
  private publish(patch: Partial<typeof this.state>) {
    if (!this.current()) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  edit(field: keyof typeof empty, value: string) {
    if (!this.state.busy && !this.state.uncertain)
      this.publish({ [field]: value, error: undefined });
  }
  private guard = () => {
    if (!this.current()) throw new ApiError('CANCELLED');
    if (!this.available()) throw new ApiError('PASSWORD_OFFLINE');
  };
  async submit(): Promise<boolean> {
    if (!this.current() || this.state.busy || this.state.uncertain) return false;
    if (this.state.password !== this.state.confirmation) {
      this.publish({ error: new ApiError('PASSWORD_MISMATCH') });
      return false;
    }
    const input = passwordChangeInput.safeParse({
      current_password: this.state.current,
      new_password: this.state.password,
    });
    if (!input.success) {
      this.publish({ error: new ApiError('PASSWORD_INVALID') });
      return false;
    }
    this.publish({ busy: true, error: undefined });
    let sent = false;
    try {
      this.guard();
      await this.manager.requestAs(this.actor, '/me/password', passwordChangeResultSchema, {
        method: 'POST',
        body: input.data,
        retryAuthentication: false,
        beforeSend: () => {
          this.guard();
          sent = true;
        },
      });
      if (!this.current()) return false;
      this.publish({ ...empty, busy: false, ending: true });
      await this.manager.endCredentialSession(this.version);
      return true;
    } catch (error) {
      const definite =
        error instanceof ApiError &&
        [
          'PASSWORD_OFFLINE',
          'INVALID_CURRENT_PASSWORD',
          'VALIDATION_ERROR',
          'RESOURCE_CHANGED',
          'RATE_LIMITED',
          'NOT_FOUND',
        ].includes(error.code);
      this.publish({ error, uncertain: sent && !definite });
      return false;
    } finally {
      // Erase secrets on every attempted write; neither persistence nor query cache owns these fields.
      this.state = { ...this.state, ...empty, busy: false };
      if (this.current()) this.listeners.forEach((l) => l());
    }
  }
  async reauthenticate() {
    if (!this.current() || this.state.busy) return false;
    this.publish({ busy: true });
    try {
      this.publish({ ...empty, busy: false, ending: true });
      await this.manager.endCredentialSession(this.version);
      return true;
    } catch (error) {
      this.publish({ error });
      return false;
    } finally {
      this.publish({ busy: false });
    }
  }
}
