import {
  accountProfileInput,
  accountProfileSchema,
  type AccountProfile,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';

export type ProfileState = {
  profile?: AccountProfile;
  name: string;
  busy: boolean;
  error?: unknown;
  result?: 'saved' | 'current';
  uncertain: boolean;
  localFailed: boolean;
};
/** Online-only self profile. No email, input or request is persisted in the expense journal. */
export class ProfileEditor {
  private state: ProfileState = { name: '', busy: false, uncertain: false, localFailed: false };
  private listeners = new Set<() => void>();
  private version: number;
  private accountId: string;
  private active = true;
  constructor(
    private manager: SessionManager,
    private available: () => boolean
  ) {
    this.version = manager.getSignInVersion();
    this.accountId = manager.getSnapshot().user?.id ?? '';
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
  }
  private current() {
    return (
      this.active &&
      this.manager.getSignInVersion() === this.version &&
      this.manager.getSnapshot().status === 'signedIn' &&
      this.manager.getSnapshot().user?.id === this.accountId
    );
  }
  private publish(patch: Partial<ProfileState>) {
    if (!this.current()) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private guard = () => {
    if (!this.current()) throw new ApiError('CANCELLED');
    if (!this.available()) throw new ApiError('PROFILE_OFFLINE');
  };
  edit(name: string) {
    if (this.state.busy || this.state.uncertain) return;
    this.publish({ name, error: undefined, result: undefined });
  }
  private async accept(profile: AccountProfile) {
    if (!this.current() || profile.id !== this.accountId) throw new ApiError('CANCELLED');
    const { id, username, displayName } = profile;
    try {
      await this.manager.updateUser({ id, username, displayName }, this.version);
      return false;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'STORAGE') return true;
      throw error;
    }
  }
  async read() {
    if (!this.current() || this.state.busy) return;
    const keepInput =
      this.state.uncertain ||
      (!!this.state.profile && this.state.name !== this.state.profile.displayName);
    this.publish({ busy: true, error: undefined, result: undefined });
    try {
      this.guard();
      const profile = await this.manager.requestAs(
        this.accountId,
        '/me/profile',
        accountProfileSchema,
        { beforeSend: this.guard }
      );
      const localFailed = await this.accept(profile);
      const hadProfile = !!this.state.profile;
      const name = keepInput ? this.state.name : profile.displayName;
      this.publish({
        profile,
        name,
        uncertain: false,
        localFailed,
        result: hadProfile ? 'current' : undefined,
      });
    } catch (error) {
      this.publish({ error });
    } finally {
      this.publish({ busy: false });
    }
  }
  async save() {
    if (!this.current() || this.state.busy || this.state.uncertain || !this.state.profile) return;
    const input = accountProfileInput.safeParse({ displayName: this.state.name });
    if (!input.success) {
      this.publish({ error: new ApiError('PROFILE_NAME_INVALID') });
      return;
    }
    this.publish({ busy: true, error: undefined, result: undefined });
    let sent = false;
    try {
      this.guard();
      const profile = await this.manager.requestAs(
        this.accountId,
        '/me/profile',
        accountProfileSchema,
        {
          method: 'PATCH',
          body: input.data,
          beforeSend: () => {
            this.guard();
            sent = true;
          },
        }
      );
      const localFailed = await this.accept(profile);
      this.publish({ profile, name: profile.displayName, localFailed, result: 'saved' });
    } catch (error) {
      const definite =
        error instanceof ApiError &&
        ['VALIDATION_ERROR', 'RATE_LIMITED', 'PROFILE_OFFLINE'].includes(error.code);
      this.publish({ error, uncertain: sent && !definite });
    } finally {
      this.publish({ busy: false });
    }
  }
  async retryLocal() {
    if (!this.current() || this.state.busy || !this.state.profile) return;
    this.publish({ busy: true });
    try {
      const user = this.manager.getSnapshot().user;
      if (!this.current() || !user) throw new ApiError('CANCELLED');
      await this.manager.updateUser(user, this.version);
      this.publish({ localFailed: false, error: undefined });
    } catch (error) {
      this.publish({ error, localFailed: true });
    } finally {
      this.publish({ busy: false });
    }
  }
}
