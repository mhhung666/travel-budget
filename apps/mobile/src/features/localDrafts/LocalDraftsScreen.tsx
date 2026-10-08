import { FormPage, PageHeader } from '@/components/screen';
import { RecoveryCard } from '@/components/RecoveryCard';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { goBack } from '@/components/navigation';
import { useState } from 'react';
import { router } from 'expo-router';
import { Action, Card, Copy, DetailRow, Notice, Page, Section } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { LocalDraftForm } from '@/features/expenses/NewExpenseScreen';
import { usePendingExpenses } from '@/features/expenses/entryProvider';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useLocalTrips } from './provider';

function LocalSessionActions() {
  const { status, manager, error } = useAuth();
  const online = useOnline();
  const t = useMessages();
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>();
  return (
    <>
      {status === 'local' && (
        <>
          <Notice tone="warning">{t.localSessionHint}</Notice>
          {!!error && <Notice tone="danger">{errorMessage(error, t)}</Notice>}
          <Action
            testID="local-restore-login"
            label={t.restoreOnline}
            disabled={!online || busy}
            busy={busy}
            onPress={() => {
              setBusy(true);
              void manager.restore().finally(() => setBusy(false));
            }}
          />
        </>
      )}
      <Action
        variant="ghost"
        label={t.logout}
        disabled={!online || busy}
        busy={busy}
        onPress={() => {
          setBusy(true);
          setLogoutError(undefined);
          void manager
            .logout()
            .catch(setLogoutError)
            .finally(() => setBusy(false));
        }}
      />
      {!!logoutError && <Notice tone="danger">{errorMessage(logoutError, t)}</Notice>}
    </>
  );
}
export function LocalTripsScreen() {
  const query = useLocalTrips();
  const t = useMessages();
  const { status } = useAuth();
  const format = useDisplayFormat();
  const items = query.isError || query.isPending ? undefined : query.data;
  return (
    <Page>
      <PageHeader
        title={t.localDrafts}
        backLabel={t.backShort}
        onBack={() => goBack(status === 'local' ? '/work' : '/me')}
      />
      <Copy>{t.localDraftHint}</Copy>
      <Action variant="secondary" label={t.queueTitle} onPress={() => router.push('/queue')} />
      <LocalSessionActions />
      {query.storageFailed && <Notice tone="danger">{t.localSnapshotFailed}</Notice>}
      {query.isPending && <RecoveryCard message={t.loading} />}
      {query.isError && (
        <RecoveryCard message={t.draftLoadFailed} tone="danger">
          <Action label={t.retry} onPress={() => void query.refetch()} />
        </RecoveryCard>
      )}
      {items?.length === 0 && (
        <RecoveryCard message={t.localTripsEmpty} testID="local-trips-empty" />
      )}
      {items?.map((trip) => (
        <Card key={trip.tripId}>
          <Section title={trip.name ?? t.cachedTrip}>
            <DetailRow label={t.localUpdated} value={format.instant(trip.updatedAt)} />
            {!trip.options && <Notice tone="warning">{t.localTripUnavailable}</Notice>}
            <Action
              testID={`local-trip-${trip.tripId}`}
              label={t.draftRestore}
              onPress={() => router.push({ pathname: '/drafts/[id]', params: { id: trip.tripId } })}
            />
          </Section>
        </Card>
      ))}
    </Page>
  );
}
export function LocalDraftScreen({ tripId }: { tripId: string }) {
  const { manager, user } = useAuth();
  // A new account/environment gets fresh component state and editor.
  return (
    <ScopedLocalDraftScreen
      key={JSON.stringify([manager.api.baseUrl, user?.id, tripId])}
      tripId={tripId}
    />
  );
}
function ScopedLocalDraftScreen({ tripId }: { tripId: string }) {
  const query = useLocalTrips(tripId);
  const pending = usePendingExpenses(tripId);
  const { status } = useAuth();
  const t = useMessages();
  const online = useOnline();
  const format = useDisplayFormat();
  const trip = query.isError || query.isPending ? undefined : query.data?.[0];
  return (
    <FormPage title={t.localDrafts} backLabel={t.backShort} onBack={() => goBack('/drafts')}>
      <Copy>{t.localDraftHint}</Copy>
      <LocalSessionActions />
      {query.storageFailed && <Notice tone="danger">{t.localSnapshotFailed}</Notice>}
      {(query.isPending || pending.isPending) && <RecoveryCard message={t.loading} />}
      {(query.isError || pending.isError) && (
        <RecoveryCard message={t.draftLoadFailed} tone="danger">
          <Action
            label={t.retry}
            onPress={() => {
              void query.refetch();
              void pending.refetch();
            }}
          />
        </RecoveryCard>
      )}
      {!query.isPending && !query.isError && (!trip || !trip.options) && (
        <Notice tone="warning">{t.localTripUnavailable}</Notice>
      )}
      {!!pending.data?.length && <Notice tone="warning">{t.pendingBlocks}</Notice>}
      {trip && (
        <Section title={trip.name ?? t.cachedTrip}>
          <DetailRow label={t.localUpdated} value={format.instant(trip.updatedAt)} />
        </Section>
      )}
      {trip?.options &&
        query.scope &&
        !pending.isPending &&
        !pending.isError &&
        !pending.data?.length && (
          <LocalDraftForm scope={query.scope} tripId={tripId} options={trip.options} />
        )}
      {status === 'signedIn' && (
        <Action
          testID="local-review-online"
          label={t.reviewOnline}
          disabled={!online}
          onPress={() =>
            router.replace({ pathname: '/trips/[id]/expenses/new', params: { id: tripId } })
          }
        />
      )}
    </FormPage>
  );
}
