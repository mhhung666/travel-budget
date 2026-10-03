import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { money } from '@/i18n/format';
import { useOnline } from '@/providers/useOnline';
import { useTrips } from './queries';

export function TripsScreen() {
  const { manager, user } = useAuth();
  const t = useMessages();
  const p = usePalette();
  const query = useTrips();
  const online = useOnline();
  const [logoutError, setLogoutError] = useState<unknown>();
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = async () => {
    setLoggingOut(true);
    setLogoutError(undefined);
    try {
      await manager.logout();
    } catch (error) {
      setLogoutError(error);
    } finally {
      setLoggingOut(false);
    }
  };
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  // Page membership can shift after a concurrent Web edit; avoid duplicate cards.
  const trips = [...new Map(items.map((trip) => [trip.id, trip])).values()];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
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
            <Copy>{user?.displayName}</Copy>
            <Title>{t.trips}</Title>
            <Copy>{t.tripsHint}</Copy>
            <Action
              testID="logout"
              secondary
              label={loggingOut ? t.loggingOut : t.logout}
              busy={loggingOut}
              onPress={() => void logout()}
            />
            {!!logoutError && <Notice>{errorMessage(logoutError, t)}</Notice>}
            {!online && <Notice>{t.offline}</Notice>}
            {query.isError && (
              <>
                <Notice>{query.data ? t.staleData : errorMessage(query.error, t)}</Notice>
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
    </SafeAreaView>
  );
}
