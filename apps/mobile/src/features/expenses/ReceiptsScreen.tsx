import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Image, Linking, ScrollView } from 'react-native';
import { receiptAttachmentsV2Schema, receiptViewV2Schema } from '@travel-budget/contracts';
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
import { expenseReadGuard, expenseReadWait } from './readGuard';
import { ReceiptReader } from './receipts';

export function ReceiptsScreen({ tripId, expenseId }: { tripId: string; expenseId: string }) {
  const { manager, scope } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const online = useOnline();
  const t = useMessages();
  const [reader] = useState(() => {
    const version = manager.getSignInVersion();
    let unsavedUntil = 0;
    const current = () =>
      !!scope &&
      manager.api.environment === scope.environment &&
      manager.getSignInVersion() === version &&
      manager.getSnapshot().status === 'signedIn' &&
      manager.getSnapshot().user?.id === scope.accountId;
    return new ReceiptReader({
      guard: async () => {
        if (!scope || !current()) throw new ApiError('CANCELLED');
        return expenseReadGuard(manager, catalog, scope, tripId, unsavedUntil);
      },
      read: (id, beforeSend, signal) => {
        const path = `/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}/attachments`;
        return id
          ? manager.requestAs(
              scope!.accountId,
              `${path}/${encodeURIComponent(id)}`,
              receiptViewV2Schema,
              { beforeSend, signal }
            )
          : manager.requestAs(scope!.accountId, path, receiptAttachmentsV2Schema, {
              beforeSend,
              signal,
            });
      },
      failure: async (error) => {
        if (!scope || !current()) return;
        const wait = expenseReadWait(error);
        if (wait) {
          unsavedUntil = Math.max(unsavedUntil, wait);
          try {
            await (await openMutationStore()).pause(scope, unsavedUntil);
          } catch {
            throw new ApiError('STORAGE');
          }
        }
        if (error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND')
          await catalog.deny(scope, tripId);
      },
      open: (url) => Linking.openURL(url),
    });
  });
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useFocusEffect(
    useCallback(() => {
      if (AppState.currentState === 'active') void reader.refresh();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void reader.refresh();
        else reader.cancel();
      });
      return () => {
        sub.remove();
        reader.cancel();
      };
    }, [reader])
  );
  const visible =
    !!scope &&
    manager.api.environment === scope.environment &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    catalog.isVisible(scope, tripId);
  const list = visible ? state.list : null;
  const view = visible && online ? state.view : null;
  const failure =
    state.error instanceof ApiError &&
    ['ATTACHMENT_UNAVAILABLE', 'ATTACHMENT_EXPIRED', 'EXPENSE_NOT_FOUND'].includes(state.error.code)
      ? t.receiptUnavailable
      : errorMessage(state.error, t);
  return (
    <Page>
      <PageHeader
        title={t.receipts}
        backLabel={t.backShort}
        onBack={() =>
          goBack({
            pathname: '/trips/[id]/expenses/[expenseId]',
            params: { id: tripId, expenseId },
          })
        }
      />
      <Copy>{t.receiptHint}</Copy>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!visible && <Notice tone="danger">{t.expenseUnavailable}</Notice>}
      {!!state.error && (
        <Notice tone="warning" announce="polite">
          {failure}
        </Notice>
      )}
      <Action
        testID="receipts-refresh"
        label={t.refresh}
        busy={state.busy}
        disabled={!online || !visible}
        onPress={() => void reader.refresh()}
      />
      {list?.items.length === 0 && <Notice>{t.noReceipts}</Notice>}
      {list?.items.map((item, index) => (
        <Card key={item.id}>
          <Copy>
            {t.receipts} {index + 1} ·{' '}
            {item.contentType === 'application/pdf' ? 'PDF' : t.receiptImage} ·{' '}
            {Math.ceil(item.size / 1024)} KB
          </Copy>
          <Action
            testID={`receipt-open-${index}`}
            label={item.contentType === 'application/pdf' ? t.receiptOpenPdf : t.receiptView}
            disabled={!online || state.busy}
            onPress={() => void reader.open(item.id)}
          />
          {item.contentType !== 'application/pdf' && (
            <Action
              variant="secondary"
              label={t.receiptOpenBrowser}
              disabled={!online || state.busy}
              onPress={() => void reader.open(item.id, true)}
            />
          )}
        </Card>
      ))}
      {view && (
        <Section title={t.receiptView}>
          {state.loadingImage && <Notice announce="polite">{t.loading}</Notice>}
          <ScrollView
            key={view.url}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            style={{ height: 480 }}
          >
            <Image
              testID="receipt-image"
              source={{ uri: view.url, cache: 'reload' }}
              accessibilityLabel={t.receiptImage}
              accessible
              resizeMode="contain"
              style={{ width: '100%', height: 480 }}
              onLoad={() => reader.imageLoaded(view)}
              onError={() => reader.imageFailed(view)}
            />
          </ScrollView>
          <Action label={t.receiptClose} variant="secondary" onPress={reader.close} />
        </Section>
      )}
    </Page>
  );
}
