import {
  registerInput,
  passwordResetRequestInput,
  passwordResetInput,
  passwordResetAcceptedSchema,
  passwordResetResultSchema,
  userSchema,
} from '@/api/contracts';
import { ApiClient, ApiError } from '@/api/client';
import type { Messages, AppLocale } from '@/i18n/messages';
import { errorMessage } from './errorMessage';

type Fields = {
  username: string;
  display_name: string;
  email: string;
  password: string;
  confirmation: string;
  code: string;
};
export type AccountStage = 'register' | 'request' | 'confirm' | 'done';
type AccountOperation = Exclude<AccountStage, 'done'>;
export type AccountState = {
  stage: AccountStage;
  fields: Fields;
  busy: boolean;
  accepted: boolean;
  error?: unknown;
  invalid?: 'invalidAccount' | 'invalidNewPassword' | 'passwordMismatch' | 'invalidReset';
  retryAt: Record<AccountOperation, number>;
  result?: { username: string; notice: 'registered' | 'passwordResetDone' };
};
const empty = (): Fields => ({
  username: '',
  display_name: '',
  email: '',
  password: '',
  confirmation: '',
  code: '',
});
/** The send and confirm endpoints have independent limits, including their UI controls. */
export function accountRetryAt(state: AccountState, resend = false) {
  return state.stage === 'done' ? 0 : state.retryAt[resend ? 'request' : state.stage];
}
/** Anonymous, explicit requests only. No SQLite, session, query cache or automatic resend. */
export class AccountFlow {
  private state: AccountState;
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private version = 0;
  private active = true;
  constructor(
    private api: ApiClient,
    private mode: 'register' | 'request',
    private locale: AppLocale
  ) {
    this.state = {
      stage: mode,
      fields: empty(),
      busy: false,
      accepted: false,
      retryAt: { register: 0, request: 0, confirm: 0 },
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(update: Partial<AccountState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  activate() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    this.version++;
    this.controller?.abort();
    this.publish({
      stage: this.mode,
      fields: empty(),
      busy: false,
      accepted: false,
      error: undefined,
      invalid: undefined,
      result: undefined,
    });
  }
  setField(key: keyof Fields, value: string) {
    if (!this.active || this.state.busy || this.state.stage === 'done') return;
    // Changing the recipient requires a fresh explicit send; a previous acceptance is not reused.
    const recipientChanged =
      key === 'email' &&
      value.trim().toLowerCase() !== this.state.fields.email.trim().toLowerCase();
    this.publish({
      fields: {
        ...this.state.fields,
        [key]: value,
        ...(recipientChanged ? { code: '', password: '', confirmation: '' } : {}),
      },
      error: undefined,
      invalid: undefined,
      ...(recipientChanged && this.state.stage === 'confirm'
        ? { stage: 'request' as const, accepted: false }
        : {}),
    });
  }
  continueWithCode() {
    if (!this.active || this.state.busy || this.state.stage !== 'request') return;
    const parsed = passwordResetRequestInput.safeParse({ email: this.state.fields.email });
    if (!parsed.success) {
      this.publish({ invalid: 'invalidReset' });
      return;
    }
    this.publish({ stage: 'confirm', error: undefined, invalid: undefined });
  }
  async submit(resend = false) {
    if (!this.active || this.state.busy || this.state.stage === 'done') return;
    const fields = this.state.fields;
    const stage = resend ? 'request' : this.state.stage;
    if (Date.now() < accountRetryAt(this.state, resend)) return;
    if (stage !== 'request' && fields.password !== fields.confirmation) {
      this.publish({ invalid: 'passwordMismatch' });
      return;
    }
    const schema =
      stage === 'register'
        ? registerInput
        : stage === 'request'
          ? passwordResetRequestInput
          : passwordResetInput;
    const raw =
      stage === 'register'
        ? {
            username: fields.username,
            display_name: fields.display_name,
            email: fields.email,
            password: fields.password,
          }
        : stage === 'request'
          ? { email: fields.email, locale: this.locale }
          : { email: fields.email, code: fields.code, new_password: fields.password };
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      this.publish({
        invalid: parsed.error.issues.some((issue) =>
          ['password', 'new_password'].includes(String(issue.path[0]))
        )
          ? 'invalidNewPassword'
          : stage === 'register'
            ? 'invalidAccount'
            : 'invalidReset',
      });
      return;
    }
    const version = this.version;
    this.controller = new AbortController();
    this.publish({ busy: true, error: undefined, invalid: undefined });
    try {
      const options = {
        method: 'POST' as const,
        body: parsed.data,
        signal: this.controller.signal,
      };
      if (stage === 'register') {
        const user = await this.api.request('/auth/register', userSchema, options);
        if (!this.active || version !== this.version) return;
        this.publish({
          stage: 'done',
          fields: empty(),
          result: { username: user.username, notice: 'registered' },
        });
      } else if (stage === 'request') {
        await this.api.request(
          '/auth/password-reset/request',
          passwordResetAcceptedSchema,
          options
        );
        if (!this.active || version !== this.version) return;
        this.publish({
          stage: 'confirm',
          accepted: true,
          fields: { ...fields, code: '', password: '', confirmation: '' },
        });
      } else {
        await this.api.request('/auth/password-reset/confirm', passwordResetResultSchema, options);
        if (!this.active || version !== this.version) return;
        this.publish({
          stage: 'done',
          fields: empty(),
          result: { username: '', notice: 'passwordResetDone' },
        });
      }
    } catch (error) {
      if (!this.active || version !== this.version) return;
      // A locked code can now be replaced earlier than a still-usable code. Let an explicit
      // resend ask the server for the current spacing/quota; never send automatically.
      const lockedCode =
        stage === 'confirm' &&
        error instanceof ApiError &&
        error.status === 400 &&
        error.code === 'TOO_MANY_ATTEMPTS';
      if (lockedCode) this.api.clearCooldown('/auth/password-reset/request');
      this.publish({
        ...(lockedCode ? { retryAt: { ...this.state.retryAt, request: 0 } } : {}),
        error,
        ...(error instanceof ApiError && error.status === 429
          ? {
              retryAt: {
                ...this.state.retryAt,
                [stage]: Math.max(
                  this.state.retryAt[stage],
                  Date.now() + (error.retryAfter ?? 60) * 1000
                ),
              },
            }
          : {}),
      });
    } finally {
      if (this.active && version === this.version) this.publish({ busy: false });
    }
  }
}
export function accountError(state: AccountState, t: Messages) {
  if (state.invalid) return t[state.invalid];
  const error = state.error;
  if (!error) return '';
  if (error instanceof ApiError) {
    if (error.code === 'ACCOUNT_CONFLICT') return t.accountConflict;
    if (error.code === 'INVALID_CODE') return t.invalidCode;
    if (error.code === 'CODE_EXPIRED') return t.codeExpired;
    if (error.code === 'TOO_MANY_ATTEMPTS') return t.tooManyAttempts;
    if (error.status >= 500 || ['NETWORK', 'TIMEOUT', 'INVALID_RESPONSE'].includes(error.code))
      return state.stage === 'register'
        ? t.registrationUnknown
        : state.stage === 'confirm'
          ? t.resetUnknown
          : t.resetRequestUnknown;
  }
  return errorMessage(error, t);
}
