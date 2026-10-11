import {
  accountProfileSchema,
  emailChangeRequestInput,
  emailChangeConfirmInput,
  emailChangeSentSchema,
  emailChangeResultSchema,
  emailChangeCancelledSchema,
  type AccountProfile,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';
export class EmailChanger {
  private state = {
    profile: undefined as AccountProfile | undefined,
    email: '',
    code: '',
    busy: false,
    stage: 'edit' as 'edit' | 'verify',
    uncertain: false,
    result: '' as '' | 'sent' | 'changed' | 'cancelled' | 'current',
    sendUntil: 0,
    verifyUntil: 0,
    error: undefined as unknown,
  };
  private listeners = new Set<() => void>();
  private active = true;
  private version: number;
  private actor: string;
  constructor(
    private manager: SessionManager,
    private available: () => boolean,
    private now = Date.now
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
    this.state = { ...this.state, email: '', code: '', profile: undefined };
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
  private guard = () => {
    if (!this.current()) throw new ApiError('CANCELLED');
    if (!this.available()) throw new ApiError('EMAIL_OFFLINE');
  };
  edit(field: 'email' | 'code', value: string) {
    if (
      this.state.busy ||
      this.state.uncertain ||
      (field === 'email' && this.state.stage !== 'edit')
    )
      return;
    this.publish({ [field]: value, error: undefined, result: '' });
  }
  async read() {
    if (!this.current() || this.state.busy) return;
    this.publish({ busy: true, error: undefined });
    try {
      this.guard();
      const profile = await this.manager.requestAs(
        this.actor,
        '/me/profile',
        accountProfileSchema,
        { beforeSend: this.guard }
      );
      if (profile.id !== this.actor) throw new ApiError('CANCELLED');
      const recovering = this.state.uncertain;
      // This is the current value, not proof of a particular request. No implicit replay.
      this.publish({
        profile,
        email: this.state.profile ? this.state.email : '',
        uncertain: false,
        stage: recovering ? 'verify' : this.state.stage,
        result: recovering ? 'current' : this.state.result,
      });
    } catch (error) {
      this.publish({ error });
    } finally {
      this.publish({ busy: false });
    }
  }
  async send(locale: string) {
    const parsed = emailChangeRequestInput.safeParse({ new_email: this.state.email, locale });
    if (!parsed.success) {
      this.publish({ error: new ApiError('EMAIL_INVALID') });
      return;
    }
    await this.write('send', '/me/email/request', parsed.data, emailChangeSentSchema, (result) => ({
      email: result.newEmail,
      stage: 'verify',
      result: 'sent',
      sendUntil: this.now() + 60000,
    }));
  }
  async confirm() {
    const parsed = emailChangeConfirmInput.safeParse({
      new_email: this.state.email,
      code: this.state.code,
    });
    if (!parsed.success) {
      this.publish({ error: new ApiError('EMAIL_CODE_INVALID') });
      return;
    }
    await this.write(
      'verify',
      '/me/email/confirm',
      parsed.data,
      emailChangeResultSchema,
      (result) => ({
        profile: this.state.profile && { ...this.state.profile, email: result.email },
        email: '',
        stage: 'edit',
        result: 'changed',
      })
    );
  }
  async cancel() {
    await this.write('cancel', '/me/email/cancel', {}, emailChangeCancelledSchema, () => ({
      email: '',
      stage: 'edit',
      result: 'cancelled',
    }));
  }
  private async write<T>(
    kind: 'send' | 'verify' | 'cancel',
    path: string,
    body: unknown,
    schema: import('zod').z.ZodType<T>,
    success: (value: T) => Partial<typeof this.state>
  ) {
    if (!this.current() || this.state.busy || this.state.uncertain || !this.state.profile) return;
    const until =
      kind === 'send' ? this.state.sendUntil : kind === 'verify' ? this.state.verifyUntil : 0;
    if (until > this.now()) return;
    this.publish({ busy: true, error: undefined, result: '' });
    let sent = false;
    try {
      this.guard();
      const result = await this.manager.requestAs(this.actor, path, schema, {
        method: 'POST',
        body,
        retryAuthentication: false,
        beforeSend: () => {
          this.guard();
          sent = true;
        },
      });
      this.publish({ ...success(result), code: '' });
    } catch (error) {
      const definite =
        error instanceof ApiError &&
        [
          'EMAIL_OFFLINE',
          'VALIDATION_ERROR',
          'SAME_EMAIL',
          'CONFLICT',
          'RESOURCE_CHANGED',
          'INVALID_CODE',
          'CODE_EXPIRED',
          'TOO_MANY_ATTEMPTS',
          'RATE_LIMITED',
          'EMAIL_DELIVERY_FAILED',
          'NOT_FOUND',
        ].includes(error.code);
      const patch: Partial<typeof this.state> = { error, uncertain: sent && !definite, code: '' };
      if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
        const wait = this.now() + Math.max(1, error.retryAfter ?? 60) * 1000;
        if (kind === 'send') patch.sendUntil = Math.max(this.state.sendUntil, wait);
        if (kind === 'verify') patch.verifyUntil = Math.max(this.state.verifyUntil, wait);
      }
      this.publish(patch);
    } finally {
      this.publish({ busy: false });
    }
  }
}
