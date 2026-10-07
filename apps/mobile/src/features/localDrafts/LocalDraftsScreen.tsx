import { FormPage } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Action, Card, Copy, Notice, Page, Title } from '@/components/ui';
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
          <Notice>{t.localSessionHint}</Notice>
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
        secondary
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
      {status === 'signedIn' && <Action secondary label={t.back} onPress={() => goBack('/me')} />}
    </>
  );
}
export function LocalTripsScreen() {
  const query = useLocalTrips();
  const t = useMessages();
  return (
    <Page>
      <Title>{t.localDrafts}</Title>
      <Notice>{t.localDraftHint}</Notice>
      <Action label={t.queueTitle} onPress={() => router.push('/queue')} />
      <LocalSessionActions />
      {query.storageFailed && <Notice tone="danger">{t.localSnapshotFailed}</Notice>}
      {query.isPending && <ActivityIndicator accessibilityLabel={t.loading} />}
      {query.isError && (
        <>
          <Notice tone="danger">{t.draftLoadFailed}</Notice>
          <Action label={t.retry} onPress={() => void query.refetch()} />
        </>
      )}
      {query.data?.length === 0 && <Notice tone="warning">{t.localTripUnavailable}</Notice>}
      {query.data?.map((trip) => (
        <Card key={trip.tripId}>
          <Title>{trip.name ?? t.cachedTrip}</Title>
          <Copy>
            {t.localUpdated}: {new Date(trip.updatedAt).toLocaleString()}
          </Copy>
          {!trip.options && <Notice tone="warning">{t.localTripUnavailable}</Notice>}
          <Action
            testID={`local-trip-${trip.tripId}`}
            label={t.draftRestore}
            onPress={() => router.push({ pathname: '/drafts/[id]', params: { id: trip.tripId } })}
          />
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
  const trip = query.data?.[0];
  return (
    <FormPage title={t.localDrafts} backLabel={t.backShort} onBack={() => goBack('/drafts')}>
      <Notice>{t.localDraftHint}</Notice>
      <LocalSessionActions />
      {query.storageFailed && <Notice tone="danger">{t.localSnapshotFailed}</Notice>}
      {(query.isPending || pending.isPending) && (
        <ActivityIndicator accessibilityLabel={t.loading} />
      )}
      {(query.isError || pending.isError) && (
        <>
          <Notice tone="danger">{t.draftLoadFailed}</Notice>
          <Action
            label={t.retry}
            onPress={() => {
              void query.refetch();
              void pending.refetch();
            }}
          />
        </>
      )}
      {!query.isPending && !query.isError && (!trip || !trip.options) && (
        <Notice tone="warning">{t.localTripUnavailable}</Notice>
      )}
      {!!pending.data?.length && <Notice tone="warning">{t.pendingBlocks}</Notice>}
      {trip && (
        <>
          <Title>{trip.name ?? t.cachedTrip}</Title>
          <Copy>
            {t.localUpdated}: {new Date(trip.updatedAt).toLocaleString()}
          </Copy>
        </>
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
