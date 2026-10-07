import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { ScreenFrame } from '@/components/frame';
import { router } from 'expo-router';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { spacing } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { TripCard } from './TripCard';
import { LocalWorkLink } from './LocalWorkLink';
import { useOnline } from '@/providers/useOnline';
import { useTrips } from './queries';

export function TripsScreen() {
  const t = useMessages();
  const p = usePalette();
  const query = useTrips();
  const online = useOnline();
  const { manager, user } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  // Page membership can shift after a concurrent Web edit; avoid duplicate cards.
  const denied = isAccessDenied(query.error);
  const trips =
    !scope || denied
      ? []
      : [...new Map(items.map((trip) => [trip.id, trip])).values()].filter((trip) =>
          catalog.isVisible(scope, trip.id)
        );
  return (
    <ScreenFrame>
      <FlatList
        testID="trips-list"
        data={trips}
        keyExtractor={(trip) => trip.id}
        contentContainerStyle={[styles.page, { flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={p.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.small, marginBottom: spacing.medium }}>
            <Title>{t.trips}</Title>
            <View style={{ flexDirection: 'row', gap: spacing.small }}>
              <View style={{ flex: 1 }}>
                <Action
                  testID="create-trip"
                  label={t.createTrip}
                  disabled={!online}
                  onPress={() => router.push('/trips/create')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Action
                  testID="join-trip"
                  variant="secondary"
                  label={t.joinTrip}
                  disabled={!online}
                  onPress={() => router.push('/trips/join')}
                />
              </View>
            </View>
            <LocalWorkLink />
            {!online && <Notice tone="warning">{t.offline}</Notice>}
            {query.isError && (
              <>
                <Notice tone={query.data && !denied ? 'warning' : 'danger'}>
                  {query.data && !denied ? t.staleData : errorMessage(query.error, t)}
                </Notice>
                <Action
                  label={t.retry}
                  disabled={!online || query.isFetching}
                  onPress={() => void query.refetch()}
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
            <View style={{ gap: 16 }}>
              <Title>{t.noTrips}</Title>
              <Copy>{t.noTripsHint}</Copy>
              <Action
                secondary
                label={t.refresh}
                disabled={!online}
                onPress={() => void query.refetch()}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => <TripCard trip={item} />}
        ListFooterComponent={
          query.hasNextPage && !denied ? (
            <Action
              testID="trips-load-more"
              secondary
              label={query.isFetchingNextPage ? t.loading : t.loadMore}
              busy={query.isFetchingNextPage}
              disabled={!online}
              onPress={() => void query.fetchNextPage()}
            />
          ) : null
        }
      />
    </ScreenFrame>
  );
}
