import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollChrome } from '@/components/scrollChrome';
import { ScreenFrame } from '@/components/frame';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { spacing } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import type { Trip } from '@/api/contracts';
import { TripCard } from './TripCard';
import { PersonalArchive } from './PersonalArchive';
import { LocalWorkLink } from './LocalWorkLink';
import { useOnline } from '@/providers/useOnline';
import { useTripList } from './queries';
import { groupHeading, visibleTripRows, usableTripCounts } from './tripListRows';

export function TripsScreen() {
  const params = useLocalSearchParams<{ archive?: string }>();
  const t = useMessages();
  const p = usePalette();
  const { manager, user } = useAuth();
  const owner = `${manager.api.environment}:${user?.id}:${manager.getSignInVersion()}`;
  const [archiveSelection, setArchiveSelection] = useState<{
    owner: string;
    value: 'unarchived' | 'archived';
  }>({ owner, value: params.archive === 'archived' ? 'archived' : 'unarchived' });
  const archive = archiveSelection.owner === owner ? archiveSelection.value : 'unarchived';
  useFocusEffect(
    useCallback(() => {
      if (params.archive !== 'archived') return;
      setArchiveSelection({ owner, value: 'archived' });
      // Consume the navigation request, so a later global entry can select this tab again.
      router.setParams({ archive: undefined });
    }, [params.archive, owner])
  );
  const setArchive = (value: 'unarchived' | 'archived') => setArchiveSelection({ owner, value });
  const [selected, setSelected] = useState<{ trip: Trip; owner: string } | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const query = useTripList({ archive, sort: 'list' });
  const online = useOnline();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.environment, accountId: user.id } : null;
  const denied = isAccessDenied(query.error);
  const serviceUnavailable =
    query.isError && errorMessage(query.error, t) === t.tripListUnavailable;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const trips =
    !scope || denied || serviceUnavailable
      ? []
      : visibleTripRows(items, (id) => catalog.isVisible(scope, id));
  const hidden = !!scope && catalog.hasDenied(scope);
  const counts = usableTripCounts(
    query.data?.pages[0]?.metadata,
    !!scope && !hidden && !query.isError && !query.isFetching
  );
  const shown =
    selected &&
    selected.owner === owner &&
    scope &&
    !denied &&
    catalog.isVisible(scope, selected.trip.id)
      ? selected.trip
      : null;
  const { refresh } = query;
  useEffect(() => {
    if (hidden && online) void refresh();
  }, [hidden, online, refresh]);
  return (
    <ScreenFrame>
      <FlatList
        key={`${owner}:${archive}`}
        testID="trips-list"
        data={trips}
        keyExtractor={(trip) => trip.id}
        contentContainerStyle={[styles.page, { flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refresh()}
            tintColor={p.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.compact, marginBottom: spacing.medium }}>
            <ScrollChrome />
            <Title>{t.trips}</Title>
            <View style={{ gap: spacing.small }}>
              <Action
                testID="create-trip"
                label={t.createTrip}
                disabled={!online}
                onPress={() => router.push('/trips/create')}
              />
              <Action
                testID="join-trip"
                variant="secondary"
                label={t.joinTrip}
                disabled={!online}
                onPress={() => router.push('/trips/join')}
              />
            </View>
            <LocalWorkLink />
            {(archive === 'archived' ||
              (query.data?.pages[0]?.metadata?.counts.archived ?? 0) > 0 ||
              hidden) && (
              <View style={{ gap: spacing.small }}>
                <Action
                  testID="trips-unarchived"
                  selected={archive === 'unarchived'}
                  variant={archive === 'unarchived' ? 'primary' : 'secondary'}
                  label={`${t.tripListGeneral}${counts ? ` (${counts.unarchived})` : ''}`}
                  disabled={archiveBusy}
                  onPress={() => setArchive('unarchived')}
                />
                <Action
                  testID="trips-archived"
                  selected={archive === 'archived'}
                  variant={archive === 'archived' ? 'primary' : 'secondary'}
                  label={`${t.archived}${counts ? ` (${counts.archived})` : ''}`}
                  disabled={archiveBusy}
                  onPress={() => setArchive('archived')}
                />
              </View>
            )}
            {!online && <Notice tone="warning">{t.offline}</Notice>}
            {query.isError && (
              <>
                <Notice tone={query.data && !denied ? 'warning' : 'danger'}>
                  {serviceUnavailable || !query.data || denied
                    ? errorMessage(query.error, t)
                    : t.staleData}
                </Notice>
                <Action
                  label={t.retry}
                  disabled={!online || query.isFetching}
                  onPress={() => void query.refresh()}
                />
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            online ? (
              <ActivityIndicator accessibilityLabel={t.loading} color={p.primary} />
            ) : null
          ) : !query.isError ? (
            <View style={{ gap: spacing.compact }}>
              <Title>{archive === 'archived' ? t.noArchivedTrips : t.noGeneralTrips}</Title>
              <Copy>{archive === 'archived' ? t.noArchivedTripsHint : t.noGeneralTripsHint}</Copy>
              {archive === 'archived' && (
                <Action label={t.tripListGeneral} onPress={() => setArchive('unarchived')} />
              )}
              <Action
                variant="secondary"
                label={t.refresh}
                disabled={!online || query.isFetching}
                onPress={() => void query.refresh()}
              />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const group = groupHeading(trips, index);
          return (
            <View>
              {group && (
                <Title>
                  {group === 'current'
                    ? t.currentTripsGroup
                    : group === 'no-date'
                      ? t.unscheduled
                      : group}
                </Title>
              )}
              <TripCard trip={item} actions onMore={() => setSelected({ trip: item, owner })} />
            </View>
          );
        }}
        ListFooterComponent={
          query.hasNextPage && !denied && !serviceUnavailable ? (
            <Action
              testID="trips-load-more"
              variant="secondary"
              label={query.isFetchingNextPage ? t.loading : t.loadMore}
              busy={query.isFetchingNextPage}
              disabled={!online}
              onPress={() => void query.fetchNextPage()}
            />
          ) : null
        }
      />
      <Modal
        visible={!!shown}
        animationType="slide"
        onRequestClose={() => {
          if (!archiveBusy) setSelected(null);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
          <ScrollView contentContainerStyle={styles.page}>
            {shown && (
              <>
                <Title>{shown.name}</Title>
                <PersonalArchive
                  tripId={shown.id}
                  archived={shown.archived}
                  onBusy={setArchiveBusy}
                />
              </>
            )}
            <Action
              testID="trip-more-close"
              variant="ghost"
              label={t.close}
              disabled={archiveBusy}
              onPress={() => setSelected(null)}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScreenFrame>
  );
}
