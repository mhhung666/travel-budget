import {
  receiptWriteStateSchema,
  receiptUploadTicketSchema,
  type ReceiptWriteInput,
  type ReceiptWriteState,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { EntryRequest } from './entry';
import type { PendingScope } from '@/storage/pendingExpenses';
import type { ReceiptWriteStore, LocalReceiptWrite } from '@/storage/receiptWrites';
interface Dependencies {
  scope: PendingScope;
  tripId: string;
  expenseId: string;
  store(): Promise<ReceiptWriteStore>;
  guard(): Promise<() => void>;
  request: EntryRequest;
  failure(error: unknown): Promise<void>;
  upload(
    file: string,
    ticket: { url: string; contentType: string },
    check: () => void
  ): Promise<void>;
  removeFile(file: string): Promise<void>;
}
export class ReceiptWriter {
  private state: {
    record: LocalReceiptWrite | null;
    busy: boolean;
    error: unknown;
    loaded: boolean;
  } = { record: null, busy: false, error: null, loaded: false };
  private listeners = new Set<() => void>();
  constructor(private deps: Dependencies) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private path() {
    return `/trips/${this.deps.tripId}/expenses/${this.deps.expenseId}/attachment-requests`;
  }
  private async run(work: () => Promise<void>) {
    if (this.state.busy) return;
    this.publish({ busy: true, error: null });
    try {
      await work();
    } catch (error) {
      try {
        await this.deps.failure(error);
      } catch (failure) {
        error = failure;
      }
      this.publish({ error });
    } finally {
      this.publish({ busy: false });
    }
  }
  load = () =>
    this.run(async () => {
      const records = await (await this.deps.store()).list(this.deps.scope);
      this.publish({
        record:
          records.find(
            (r) => r.tripId === this.deps.tripId && r.expenseId === this.deps.expenseId
          ) ?? null,
        loaded: true,
      });
      if (this.state.record && !this.state.record.result) await this.resume(false);
    });
  confirm = (input: ReceiptWriteInput, file?: string, saved?: () => void) =>
    this.run(async () => {
      const guard = await this.deps.guard();
      guard();
      const store = await this.deps.store();
      guard();
      const record: LocalReceiptWrite = {
        tripId: this.deps.tripId,
        expenseId: this.deps.expenseId,
        input,
        file,
        cancel: false,
        result: null,
      };
      await store.insert(this.deps.scope, record);
      this.publish({ record, loaded: true });
      saved?.();
      await this.resume(true);
    });
  retry = () => this.run(() => this.resume(true));
  lookup = () => this.run(() => this.resume(false));
  cancel = () =>
    this.run(async () => {
      const record = this.state.record;
      if (!record || record.result) return;
      const next = { ...record, cancel: true };
      await (await this.deps.store()).save(this.deps.scope, next);
      this.publish({ record: next });
      await this.resume(true);
    });
  dismiss = () =>
    this.run(async () => {
      const record = this.state.record;
      if (!record?.result) return;
      if (record.file) await this.deps.removeFile(record.file);
      await (await this.deps.store()).remove(this.deps.scope, record);
      this.publish({ record: null });
    });
  private async complete(result: ReceiptWriteState) {
    const record = this.state.record!;
    if (result.clientRequestId.toLowerCase() !== record.input.client_request_id.toLowerCase())
      throw new ApiError('INVALID_RESPONSE');
    if (result.status !== 'committed' && result.status !== 'rejected') return false;
    const next = { ...record, result };
    await (await this.deps.store()).save(this.deps.scope, next);
    this.publish({ record: next });
    if (record.file) await this.deps.removeFile(record.file);
    return true;
  }
  private async resume(send: boolean) {
    const record = this.state.record;
    if (!record || record.result) return;
    const { scope } = this.deps;
    const check = await this.deps.guard();
    check();
    const path = `${this.path()}/${record.input.client_request_id}`;
    const query = await this.deps.request(scope.accountId, path, receiptWriteStateSchema, {
      beforeSend: check,
    });
    check();
    if ((await this.complete(query)) || !send) return;
    if (query.status === 'not_found') {
      const begun = await this.deps.request(scope.accountId, this.path(), receiptWriteStateSchema, {
        method: 'POST',
        body: record.input,
        beforeSend: check,
      });
      check();
      if (await this.complete(begun)) return;
    }
    const command = async (action: 'upload' | 'finish' | 'cancel') => {
      check();
      const result = await this.deps.request(scope.accountId, path, receiptUploadTicketSchema, {
        method: 'POST',
        body: { action },
        beforeSend: check,
      });
      check();
      return result;
    };
    if (record.cancel) {
      await this.complete(await command('cancel'));
      return;
    }
    // A lost PUT response or a killed process may already have uploaded the file.
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
    if (!ticket.upload || ticket.upload.expiresAt <= Date.now() || !record.file)
      throw new ApiError('UPLOAD_INCOMPLETE');
    check();
    await this.deps.upload(record.file, ticket.upload, check);
    check();
    await this.complete(await command('finish'));
  }
}
