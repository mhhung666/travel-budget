import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { onlineManager } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { ScreenFrame } from '@/components/frame';
import { PageHeader } from '@/components/screen';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { goBack } from '@/components/navigation';
import { useMessages } from '@/i18n/useMessages';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTripCandidates } from '@/features/trips/queries';
import { useDraftCatalog, useLocalTrips } from '@/features/localDrafts/provider';
import { useOnline } from '@/providers/useOnline';
import { onlineCandidates, localCandidates } from './tripCandidates';
import { TripCandidateRow } from './TripCandidateRow';

/** The global entry always requires an explicit choice in T3a, including offline snapshots. */
export function SelectTripScreen() {
  const online = useOnline();
  const { manager, user, status } = useAuth();
  const live = online && status === 'signedIn';
  const trips = useTripCandidates(live);
  const local = useLocalTrips();
  const { catalog } = useDraftCatalog();
  const p = usePalette();
  const t = useMessages();
  const opening = useRef(false);
  const owner = `${manager.api.environment}:${user?.id}:${manager.getSignInVersion()}`;
  const scope = user ? { environment: manager.api.environment, accountId: user.id } : null;
  const access = scope ? catalog.captureAccess(scope) : null;
  const denied = isAccessDenied(trips.error);
  const unavailable = trips.isError && errorMessage(trips.error, t) === t.tripListUnavailable;
  const hidden = !!scope && catalog.hasDenied(scope);
  const allowed = (id: string) => !!scope && catalog.isVisible(scope, id);
  const data = live
    ? denied || unavailable
      ? []
      : onlineCandidates(trips.data?.pages.flatMap((page) => page.items) ?? [], allowed)
    : localCandidates(local.data ?? [], allowed, t.cachedTrip);
  const failed = live ? trips.isError : local.isError || local.storageFailed;
  const loading = live ? trips.isPending : local.isPending;
  // A known denial suppresses totals, but must not remove the manual archive entry.
  const showArchived =
    hidden || (!failed && (trips.data?.pages[0]?.metadata.counts.archived ?? 0) > 0);
  const refresh = () => {
    if (live) void trips.refresh();
    else void local.refetch();
  };
  const { refresh: refreshRemote } = trips;
  useEffect(() => {
    if (live && hidden) void refreshRemote();
  }, [live, hidden, refreshRemote]);
  const currentOwner = () => {
    const current = manager.getSnapshot();
    return (
      owner === `${manager.api.environment}:${current.user?.id}:${manager.getSignInVersion()}` &&
      ['signedIn', 'local'].includes(current.status) &&
      (!live || current.status === 'signedIn') &&
      onlineManager.isOnline() === online
    );
  };
  return (
    <ScreenFrame>
      <FlatList
        key={`${owner}:${live}`}
        testID="record-trips"
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={live ? trips.isRefetching && !trips.isFetchingNextPage : local.isRefetching}
            onRefresh={refresh}
            tintColor={p.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <PageHeader
              title={t.chooseTrip}
              backLabel={t.cancel}
              backTestID="record-cancel"
              onBack={() => goBack('/trips')}
            />
            <Copy>{t.chooseTripHint}</Copy>
            {!live && (
              <Notice tone="warning" announce="none">
                {t.localCandidatesHint}
              </Notice>
            )}
            {live && local.storageFailed && <Notice tone="warning">{t.draftLoadFailed}</Notice>}
            {failed && (
              <>
                <Notice tone="danger">
                  {live ? errorMessage(trips.error, t) : t.draftLoadFailed}
                </Notice>
                <Action label={t.retry} onPress={refresh} />
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator accessibilityLabel={t.loading} />
          ) : !failed ? (
            <View style={{ gap: 16 }}>
              <Notice>
                {live ? (hidden ? t.notFound : t.noRecordTrips) : t.localTripUnavailable}
              </Notice>
              {live && (
                <>
                  {showArchived && (
                    <Action
                      testID="record-view-archived"
                      label={t.viewArchivedTrips}
                      variant="secondary"
                      onPress={() => {
                        if (opening.current || !currentOwner()) return;
                        opening.current = true;
                        router.replace({ pathname: '/trips', params: { archive: 'archived' } });
                      }}
                    />
                  )}
                  <Action label={t.createTrip} onPress={() => router.replace('/trips/create')} />
                  <Action
                    label={t.joinTrip}
                    variant="secondary"
                    onPress={() => router.replace('/trips/join')}
                  />
                </>
              )}
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <View>
            {!live &&
              item.localGroup &&
              (index === 0 || data[index - 1].localGroup !== item.localGroup) && (
                <Title>
                  {item.localGroup === 'general'
                    ? t.localGeneralTrips
                    : item.localGroup === 'archived'
                      ? t.localArchivedTrips
                      : t.localUnknownTrips}
                </Title>
              )}
            <TripCandidateRow
              item={item}
              onPress={() => {
                if (opening.current || !currentOwner() || !allowed(item.id)) return;
                try {
                  access?.(item.id);
                } catch {
                  return;
                }
                opening.current = true;
                router.replace(
                  live
                    ? { pathname: '/trips/[id]/expenses/new', params: { id: item.id } }
                    : { pathname: '/drafts/[id]', params: { id: item.id } }
                );
              }}
            />
          </View>
        )}
        ListFooterComponent={
          live && trips.hasNextPage ? (
            <Action
              label={t.loadMore}
              busy={trips.isFetchingNextPage}
              disabled={trips.isFetching}
              onPress={() => void trips.fetchNextPage()}
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}
