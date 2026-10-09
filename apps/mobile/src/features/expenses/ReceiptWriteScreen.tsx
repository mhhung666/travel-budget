import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { receiptAttachmentsV2Schema, type ReceiptAttachments } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { Action, Card, Copy, Notice, Page, Section } from '@/components/ui';
import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { openReceiptWriteStore } from '@/storage/receiptWriteDatabase';
import { expenseReadGuard, expenseReadWait } from './readGuard';
import { ReceiptWriter } from './receiptWriter';
import {
  pickReceipt,
  removeReceiptFile,
  uploadReceiptFile,
  cleanupReceiptFiles,
  type SelectedReceipt,
} from './receiptFiles';
export function ReceiptWriteScreen({ tripId, expenseId }: { tripId: string; expenseId: string }) {
  const { manager, scope } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const t = useMessages();
  const online = useOnline();
  const [selected, setSelected] = useState<SelectedReceipt | null>(null);
  const selection = useRef<SelectedReceipt | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [items, setItems] = useState<ReceiptAttachments | null>(null);
  const [error, setError] = useState<unknown>();
  const [working, setWorking] = useState(false);
  const locked = useRef(false);
  const focused = useRef(false);
  const [access] = useState(() => {
    const version = manager.getSignInVersion();
    let until = 0;
    const current = () => {
      if (
        !scope ||
        manager.api.environment !== scope.environment ||
        manager.getSignInVersion() !== version ||
        manager.getSnapshot().status !== 'signedIn' ||
        manager.getSnapshot().user?.id !== scope.accountId
      )
        throw new ApiError('CANCELLED');
    };
    return {
      guard: async () => {
        current();
        const guard = await expenseReadGuard(manager, catalog, scope!, tripId, until);
        return () => {
          if (!focused.current) throw new ApiError('CANCELLED');
          guard();
        };
      },
      failure: async (e: unknown) => {
        current();
        const wait = expenseReadWait(e);
        if (wait) {
          until = Math.max(until, wait);
          await (await openMutationStore()).pause(scope!, until);
        }
        if (e instanceof ApiError && e.status === 404 && e.code === 'NOT_FOUND')
          await catalog.deny(scope!, tripId);
      },
    };
  });
  const [writer] = useState(
    () =>
      new ReceiptWriter({
        scope: scope!,
        tripId,
        expenseId,
        store: openReceiptWriteStore,
        ...access,
        request: (account, path, schema, options) =>
          manager.requestAs(account, path, schema, options),
        upload: uploadReceiptFile,
        removeFile: removeReceiptFile,
      })
  );
  const state = useSyncExternalStore(writer.subscribe, writer.getSnapshot, writer.getSnapshot);
  const run = async (work: () => Promise<void>) => {
    if (locked.current || state.busy) return;
    locked.current = true;
    setWorking(true);
    setError(undefined);
    try {
      await work();
    } catch (e) {
      try {
        await access.failure(e);
      } catch (failure) {
        e = failure;
      }
      setError(e);
    } finally {
      locked.current = false;
      setWorking(false);
      if (!focused.current && selection.current) {
        const file = selection.current;
        selection.current = null;
        setSelected(null);
        await removeReceiptFile(file.file).catch(() => {});
      }
    }
  };
  const refreshList = useCallback(async () => {
    const check = await access.guard();
    check();
    const list = await manager.requestAs(
      scope!.accountId,
      `/trips/${tripId}/expenses/${expenseId}/attachments`,
      receiptAttachmentsV2Schema,
      { beforeSend: check }
    );
    check();
    setItems(list);
  }, [access, manager, scope, tripId, expenseId]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      focused.current = true;
      void writer.load();
      void (async () => {
        try {
          const store = await openReceiptWriteStore();
          await cleanupReceiptFiles(await store.files());
          if (active) await refreshList();
        } catch (e) {
          try {
            await access.failure(e);
          } catch {
            /* Guard error is already displayed by writer. */
          }
          if (active) setError(e);
        }
      })();
      return () => {
        active = false;
        focused.current = false;
        const file = locked.current ? null : selection.current;
        if (!locked.current) {
          selection.current = null;
          setSelected(null);
        }
        if (file) void removeReceiptFile(file.file).catch(() => {});
      };
    }, [writer, access, refreshList])
  );
  const visible =
    !!scope &&
    manager.api.environment === scope.environment &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    catalog.isVisible(scope, tripId);
  const disabled = !online || !visible || working || state.busy || !state.loaded;
  const pick = (source: 'camera' | 'library' | 'pdf') =>
    run(async () => {
      const check = await access.guard();
      check();
      const file = await pickReceipt(source);
      if (!file) return;
      try {
        check();
      } catch (e) {
        await removeReceiptFile(file.file);
        throw e;
      }
      selection.current = file;
      setSelected(file);
      setRemoving(null);
    });
  const failure = error ?? state.error;
  const message =
    failure instanceof ApiError && failure.code === 'RECEIPT_PERMISSION'
      ? t.receiptPermission
      : failure instanceof ApiError && failure.code === 'RECEIPT_FILE_SIZE'
        ? t.receiptFileSize
        : failure instanceof ApiError && failure.code === 'RECEIPT_FILE_MISSING'
          ? t.receiptFileMissing
          : errorMessage(failure, t);
  return (
    <Page>
      <PageHeader
        title={t.receiptManage}
        backLabel={t.backShort}
        onBack={() =>
          goBack({
            pathname: '/trips/[id]/expenses/[expenseId]/receipts',
            params: { id: tripId, expenseId },
          })
        }
      />
      <Copy>{t.receiptWriteHint}</Copy>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!visible && <Notice tone="danger">{t.expenseUnavailable}</Notice>}
      {!!failure && (
        <Notice tone="warning" announce="polite">
          {message}
        </Notice>
      )}
      {!state.loaded && (
        <Action label={t.retry} onPress={() => void writer.load()} busy={state.busy} />
      )}
      {visible && state.record ? (
        <Section title={t.receiptPending}>
          <Copy>
            {state.record.result?.status === 'committed'
              ? t.receiptSaved
              : state.record.result?.status === 'rejected'
                ? t.receiptRejected
                : t.receiptPendingHint}
          </Copy>
          {state.record.result ? (
            <Action
              label={t.receiptDone}
              busy={state.busy}
              onPress={() =>
                void run(async () => {
                  await writer.dismiss();
                  setItems(null);
                })
              }
            />
          ) : (
            <>
              <Action label={t.refresh} disabled={disabled} onPress={() => void writer.lookup()} />
              <Action
                label={t.retry}
                busy={state.busy}
                disabled={disabled}
                onPress={() => void writer.retry()}
              />
              {state.record.input.action === 'add' && (
                <Action
                  label={t.receiptCancelUpload}
                  disabled={disabled}
                  onPress={() => void writer.cancel()}
                />
              )}
            </>
          )}
        </Section>
      ) : (
        visible && (
          <>
            {selected || removing ? (
              <Section title={t.receiptConfirm}>
                <Copy>
                  {removing
                    ? t.receiptRemoveConfirm
                    : `${selected?.contentType === 'application/pdf' ? 'PDF' : t.receiptImage} · ${Math.ceil((selected?.size ?? 0) / 1024)} KB`}
                </Copy>
                <Action
                  label={t.receiptConfirm}
                  disabled={disabled}
                  onPress={() =>
                    void run(async () => {
                      const file = selected;
                      await writer.confirm(
                        removing
                          ? {
                              action: 'remove',
                              client_request_id: randomUUID(),
                              attachmentId: removing,
                            }
                          : {
                              action: 'add',
                              client_request_id: randomUUID(),
                              contentType: file!.contentType,
                              size: file!.size,
                            },
                        file?.file,
                        () => {
                          selection.current = null;
                          setSelected(null);
                        }
                      );
                      // Ownership moves only after SQLite accepted the frozen request.
                      if (writer.getSnapshot().record) {
                        selection.current = null;
                        setSelected(null);
                        setRemoving(null);
                      }
                    })
                  }
                />
                <Action
                  label={t.cancel}
                  disabled={working || state.busy}
                  onPress={() =>
                    void run(async () => {
                      if (selected) await removeReceiptFile(selected.file);
                      selection.current = null;
                      setSelected(null);
                      setRemoving(null);
                    })
                  }
                />
              </Section>
            ) : (
              <>
                <Action
                  label={t.receiptChoose}
                  disabled={disabled}
                  onPress={() => void pick('library')}
                />
                <Action
                  label={t.receiptCamera}
                  disabled={disabled}
                  onPress={() => void pick('camera')}
                />
                <Action
                  label={t.receiptChoosePdf}
                  disabled={disabled}
                  onPress={() => void pick('pdf')}
                />
                {items?.items.map((item, i) => (
                  <Card key={item.id}>
                    <Copy>
                      {t.receipts} {i + 1} ·{' '}
                      {item.contentType === 'application/pdf' ? 'PDF' : t.receiptImage}
                    </Copy>
                    <Action
                      label={t.receiptRemove}
                      disabled={disabled}
                      onPress={() => setRemoving(item.id)}
                    />
                  </Card>
                ))}
              </>
            )}
          </>
        )
      )}
    </Page>
  );
}
