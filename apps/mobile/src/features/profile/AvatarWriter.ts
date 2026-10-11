import {
  avatarWriteInput,
  avatarWriteStateSchema,
  avatarUploadTicketSchema,
  type AvatarWriteInput,
  type AvatarWriteState,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';
import type { AvatarWriteStore, LocalAvatarWrite } from '@/storage/avatarWrites';
interface Dependencies {
  manager: SessionManager;
  available(): boolean;
  store(): Promise<AvatarWriteStore>;
  upload(
    file: string,
    ticket: { url: string; contentType: string },
    check: () => void
  ): Promise<void>;
  removeFile(file: string): Promise<void>;
  changed(): Promise<void>;
}
/** Dedicated confirmed profile work, independent of all expense journals. Restart only queries. */
export class AvatarWriter {
  private state: {
    record: LocalAvatarWrite | null;
    busy: boolean;
    loaded: boolean;
    error?: unknown;
  } = { record: null, busy: false, loaded: false };
  private listeners = new Set<() => void>();
  private version: number;
  private scope: { environment: string; accountId: string };
  constructor(private deps: Dependencies) {
    this.version = deps.manager.getSignInVersion();
    this.scope = {
      environment: deps.manager.api.environment,
      accountId: deps.manager.getSnapshot().user?.id ?? '',
    };
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private current() {
    const s = this.deps.manager.getSnapshot();
    return (
      this.deps.manager.getSignInVersion() === this.version &&
      s.status === 'signedIn' &&
      s.user?.id === this.scope.accountId
    );
  }
  private check = () => {
    if (!this.current()) throw new ApiError('CANCELLED');
    if (!this.deps.available()) throw new ApiError('PROFILE_OFFLINE');
  };
  private publish(patch: Partial<typeof this.state>) {
    if (!this.current()) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private async run(work: () => Promise<void>) {
    if (!this.current() || this.state.busy) return;
    this.publish({ busy: true, error: undefined });
    try {
      await work();
    } catch (error) {
      this.publish({ error });
    } finally {
      this.publish({ busy: false });
    }
  }
  load = () =>
    this.run(async () => {
      const store = await this.deps.store();
      const records = await store.list(this.scope);
      if (!this.current()) return;
      this.publish({ record: records[0] ?? null, loaded: true });
      if (this.state.record && !this.state.record.result && this.deps.available())
        await this.resume(false);
    });
  confirm = (raw: AvatarWriteInput, file?: string, persisted?: () => void) =>
    this.run(async () => {
      if (!this.state.loaded || this.state.record) return;
      this.check();
      const input = avatarWriteInput.parse(raw),
        record: LocalAvatarWrite = { input, file, cancel: false, result: null };
      if ((input.action === 'replace') !== !!file) throw new ApiError('VALIDATION_ERROR');
      const store = await this.deps.store();
      this.check();
      await store.insert(this.scope, record);
      // Ownership of the confirmed file transfers even if the user signs out during persistence.
      persisted?.();
      this.publish({ record });
      this.check();
      await this.resume(true);
    });
  lookup = () => this.run(() => this.resume(false));
  retry = () => this.run(() => this.resume(true));
  cancel = () =>
    this.run(async () => {
      const record = this.state.record;
      if (!record || record.result) return;
      const next = { ...record, cancel: true };
      await (await this.deps.store()).save(this.scope, next);
      this.publish({ record: next });
      this.check();
      await this.resume(true);
    });
  dismiss = () =>
    this.run(async () => {
      const record = this.state.record;
      if (!record?.result) return;
      if (record.file) await this.deps.removeFile(record.file);
      await (await this.deps.store()).remove(this.scope, record);
      this.publish({ record: null });
    });
  private async complete(result: AvatarWriteState) {
    const record = this.state.record!;
    if (result.clientRequestId.toLowerCase() !== record.input.client_request_id)
      throw new ApiError('INVALID_RESPONSE');
    if (result.status !== 'committed' && result.status !== 'rejected') return false;
    if (result.status === 'committed' && !result.avatar) throw new ApiError('INVALID_RESPONSE');
    const next = { ...record, result };
    await (await this.deps.store()).save(this.scope, next);
    this.publish({ record: next });
    if (record.file) await this.deps.removeFile(record.file);
    if (this.current()) await this.deps.changed();
    return true;
  }
  private async resume(send: boolean) {
    const record = this.state.record;
    if (!record || record.result) return;
    this.check();
    const base = '/me/avatar/requests',
      path = `${base}/${record.input.client_request_id}`;
    const request = <T>(p: string, schema: import('zod').z.ZodType<T>, body?: unknown) =>
      this.deps.manager.requestAs(this.scope.accountId, p, schema, {
        method: body ? 'POST' : 'GET',
        body,
        beforeSend: this.check,
      });
    const status = await request(path, avatarWriteStateSchema);
    this.check();
    if ((await this.complete(status)) || !send) return;
    const command = async (action: 'upload' | 'finish' | 'cancel') => {
      const r = await request(path, avatarUploadTicketSchema, { action });
      this.check();
      return r;
    };
    if (record.cancel) {
      await this.complete(await command('cancel'));
      return;
    }
    if (status.status === 'not_found') {
      // Cancel intent can be resolved locally only with a server terminal record. Never drop UUID.
      const begun = await request(base, avatarWriteStateSchema, record.input);
      this.check();
      if (await this.complete(begun)) return;
    }
    try {
      if (await this.complete(await command('finish'))) return;
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.code !== 'UPLOAD_INCOMPLETE' ||
        error.source !== 'request'
      )
        throw error;
    }
    const ticket = await command('upload');
    if (await this.complete(ticket)) return;
    if (!record.file || !ticket.upload || ticket.upload.expiresAt <= Date.now())
      throw new ApiError('UPLOAD_INCOMPLETE');
    this.check();
    await this.deps.upload(record.file, ticket.upload, this.check);
    this.check();
    await this.complete(await command('finish'));
  }
}
