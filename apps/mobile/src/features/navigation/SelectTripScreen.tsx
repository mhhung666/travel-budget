import { useRef } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { ScreenFrame } from '@/components/frame';
import { PageHeader } from '@/components/screen';
import { Action, Copy, Notice, styles, usePalette } from '@/components/ui';
import { goBack } from '@/components/navigation';
import { useMessages } from '@/i18n/useMessages';
import { errorMessage } from '@/features/auth/errorMessage';
import { useTrips } from '@/features/trips/queries';
import { useDraftCatalog, useLocalTrips } from '@/features/localDrafts/provider';
import { useOnline } from '@/providers/useOnline';

/** Reads only the existing paged trip list or available local snapshots; never picks implicitly. */
export function SelectTripScreen() {
  const online = useOnline();
  const trips = useTrips();
  const local = useLocalTrips();
  const { catalog } = useDraftCatalog();
  const p = usePalette();
  const t = useMessages();
  const opening = useRef(false);
  const remote =
    trips.data?.pages
      .flatMap((page) => page.items)
      .filter((trip) => !local.scope || catalog.isVisible(local.scope, trip.id)) ?? [];
  const data = online
    ? [...new Map(remote.map((trip) => [trip.id, { id: trip.id, name: trip.name }])).values()]
    : (local.data ?? [])
        .filter((trip) => !!trip.options)
        .map((trip) => ({ id: trip.tripId, name: trip.name ?? t.cachedTrip }));
  const failed = online ? trips.isError : local.isError || local.storageFailed;
  const loading = online ? trips.isPending : local.isPending;
  const refresh = () => {
    if (online) void trips.refetch();
    else void local.refetch();
  };
  return (
    <ScreenFrame>
      <FlatList
        testID="record-trips"
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={
              online ? trips.isRefetching && !trips.isFetchingNextPage : local.isRefetching
            }
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
            {!online && (
              <Notice tone="warning" announce="none">
                {t.localDraftHint}
              </Notice>
            )}
            {failed && (
              <>
                <Notice tone="danger">
                  {online ? errorMessage(trips.error, t) : t.draftLoadFailed}
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
              <Notice>{online ? t.noTripsHint : t.localTripUnavailable}</Notice>
              {online && (
                <>
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
        renderItem={({ item }) => (
          <Action
            testID={`record-trip-${item.id}`}
            variant="secondary"
            label={item.name}
            onPress={() => {
              if (opening.current) return;
              opening.current = true;
              router.replace(
                online
                  ? { pathname: '/trips/[id]/expenses/new', params: { id: item.id } }
                  : { pathname: '/drafts/[id]', params: { id: item.id } }
              );
            }}
          />
        )}
        ListFooterComponent={
          online && trips.hasNextPage ? (
            <Action
              label={t.loadMore}
              busy={trips.isFetchingNextPage}
              onPress={() => void trips.fetchNextPage()}
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}
