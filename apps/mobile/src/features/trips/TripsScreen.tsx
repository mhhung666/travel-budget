import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ScreenFrame } from '@/components/frame';
import { router } from 'expo-router';
import { errorMessage } from '@/features/auth/errorMessage';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { money } from '@/i18n/format';
import { useOnline } from '@/providers/useOnline';
import { useTrips } from './queries';

export function TripsScreen() {
  const t = useMessages();
  const p = usePalette();
  const query = useTrips();
  const online = useOnline();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  // Page membership can shift after a concurrent Web edit; avoid duplicate cards.
  const trips = [...new Map(items.map((trip) => [trip.id, trip])).values()];
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
          <View style={{ gap: 16, marginBottom: 20 }}>
            <Title>{t.trips}</Title>
            <Action
              testID="create-trip"
              label={t.createTrip}
              disabled={!online}
              onPress={() => router.push('/trips/create')}
            />
            <Action
              testID="join-trip"
              label={t.joinTrip}
              disabled={!online}
              onPress={() => router.push('/trips/join')}
            />
            <Copy>{t.tripsHint}</Copy>
            <Action
              testID="local-work"
              variant="secondary"
              label={t.localWork}
              onPress={() => router.push('/work')}
            />
            {!online && <Notice tone="warning">{t.offline}</Notice>}
            {query.isError && (
              <>
                <Notice tone={query.data ? 'warning' : 'danger'}>
                  {query.data ? t.staleData : errorMessage(query.error, t)}
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
        renderItem={({ item }) => (
          <Pressable
            testID={`trip-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => router.push({ pathname: '/trips/[id]', params: { id: item.id } })}
            style={({ pressed }) => ({
              backgroundColor: p.surface,
              borderColor: p.border,
              borderWidth: 1,
              borderRadius: 22,
              padding: 22,
              marginBottom: 16,
              gap: 10,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: p.primary, fontSize: 14, fontWeight: '600' }}>
              {item.archived ? t.archived : t[item.phase]}
            </Text>
            <Text style={{ color: p.text, fontSize: 24, fontWeight: '700' }}>{item.name}</Text>
            {!!item.destination && <Copy>{item.destination}</Copy>}
            <Copy>
              {item.startDate ?? t.unscheduled}
              {item.endDate ? ` — ${item.endDate}` : ''}
            </Copy>
            <View style={{ borderTopWidth: 1, borderColor: p.border, paddingTop: 12, gap: 4 }}>
              <Copy>{t.mySpent}</Copy>
              <Text style={{ color: p.text, fontSize: 22, fontWeight: '600' }}>
                {money(item.mySpent)}
              </Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          query.hasNextPage ? (
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
