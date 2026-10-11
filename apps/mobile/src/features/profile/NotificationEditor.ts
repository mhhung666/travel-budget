import {
  notificationPreferencesInput,
  notificationPreferencesSchema,
  type NotificationPreferences,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';
export type NotificationState = {
  preferences?: NotificationPreferences;
  draft?: NotificationPreferences;
  busy: boolean;
  uncertain: boolean;
  error?: unknown;
  result?: 'saved' | 'current';
};
/** Online account settings only. No private settings in device preferences or expense journals. */
export class NotificationEditor {
  private state: NotificationState = { busy: false, uncertain: false };
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
  private publish(patch: Partial<NotificationState>) {
    if (!this.current()) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private guard = () => {
    if (!this.current()) throw new ApiError('CANCELLED');
    if (!this.available()) throw new ApiError('PROFILE_OFFLINE');
  };
  edit(patch: Partial<NotificationPreferences>) {
    if (!this.state.draft || this.state.busy || this.state.uncertain) return;
    const draft = notificationPreferencesSchema.safeParse({ ...this.state.draft, ...patch });
    if (draft.success) this.publish({ draft: draft.data, error: undefined, result: undefined });
  }
  async read() {
    if (!this.current() || this.state.busy) return;
    const { preferences, draft, uncertain } = this.state;
    const dirty =
      !!preferences &&
      !!draft &&
      (preferences.notifyByEmail !== draft.notifyByEmail || preferences.locale !== draft.locale);
    this.publish({ busy: true, error: undefined, result: undefined });
    try {
      this.guard();
      const current = await this.manager.requestAs(
        this.accountId,
        '/me/notification-preferences',
        notificationPreferencesSchema,
        { beforeSend: this.guard }
      );
      this.publish({
        preferences: current,
        draft:
          dirty && !uncertain && draft && preferences
            ? {
                notifyByEmail:
                  draft.notifyByEmail !== preferences.notifyByEmail
                    ? draft.notifyByEmail
                    : current.notifyByEmail,
                locale: draft.locale !== preferences.locale ? draft.locale : current.locale,
              }
            : current,
        uncertain: false,
        result: preferences ? 'current' : undefined,
      });
    } catch (error) {
      this.publish({ error });
    } finally {
      this.publish({ busy: false });
    }
  }
  async save() {
    if (!this.current() || this.state.busy || this.state.uncertain) return;
    const { preferences, draft } = this.state;
    if (!preferences || !draft) return;
    // Only changed fields; a switch save must not overwrite a remote language change.
    const input = notificationPreferencesInput.safeParse({
      ...(draft.notifyByEmail === preferences.notifyByEmail
        ? {}
        : { notifyByEmail: draft.notifyByEmail }),
      ...(draft.locale === preferences.locale ? {} : { locale: draft.locale }),
    });
    if (!input.success) return;
    this.publish({ busy: true, error: undefined, result: undefined });
    let sent = false;
    try {
      this.guard();
      const current = await this.manager.requestAs(
        this.accountId,
        '/me/notification-preferences',
        notificationPreferencesSchema,
        {
          method: 'PATCH',
          body: input.data,
          beforeSend: () => {
            this.guard();
            sent = true;
          },
        }
      );
      this.publish({ preferences: current, draft: current, result: 'saved' });
    } catch (error) {
      const definite =
        error instanceof ApiError &&
        (error.code === 'PROFILE_OFFLINE' ||
          ['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED'].includes(error.code));
      this.publish({ error, uncertain: sent && !definite });
    } finally {
      this.publish({ busy: false });
    }
  }
}
