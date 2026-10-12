import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollChrome } from '@/components/scrollChrome';
import { ScreenFrame } from '@/components/frame';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { Action, Copy, Notice, Title, styles, usePalette } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
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
  const [focusedTab, setFocusedTab] = useState<'unarchived' | 'archived' | null>(null);
  const [resultOwner, setResultOwner] = useState('');
  const archiveSettled = useCallback(() => {
    setResultOwner(owner);
    setSelected(null);
  }, [owner]);
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
  const focusTarget = useRef<Text>(null);
  const restoreFocus = () => {
    const handle = focusTarget.current && findNodeHandle(focusTarget.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };
  const closeMore = () => {
    if (!archiveBusy) setSelected(null);
  };

  const noTrips =
    archive === 'unarchived' &&
    counts?.unarchived === 0 &&
    counts.archived === 0 &&
    !query.isPending;
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
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.small,
              }}
            >
              <Text
                ref={focusTarget}
                accessibilityRole="header"
                style={[typography.page, { color: p.text, fontWeight: '700' }]}
              >
                {t.trips}
              </Text>
              {!noTrips && (
                <View style={{ maxWidth: '100%' }}>
                  <Action
                    testID="create-trip"
                    variant="secondary"
                    icon="plus"
                    label={t.createTrip}
                    disabled={!online}
                    onPress={() => router.push('/trips/create')}
                  />
                </View>
              )}
            </View>
            {!noTrips && (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.small,
                }}
              >
                <Copy>{t.joinTripHint}</Copy>
                <View style={{ maxWidth: '100%' }}>
                  <Action
                    testID="join-trip"
                    variant="ghost"
                    label={t.joinTrip}
                    disabled={!online}
                    onPress={() => router.push('/trips/join')}
                  />
                </View>
              </View>
            )}
            {(archive === 'archived' ||
              (query.data?.pages[0]?.metadata?.counts.archived ?? 0) > 0 ||
              hidden) && (
              <View
                accessibilityRole="tablist"
                style={{
                  flexDirection: 'row',
                  gap: spacing.small,
                  borderBottomWidth: sizing.border,
                  borderColor: p.border,
                }}
              >
                {(['unarchived', 'archived'] as const).map((value) => {
                  const label = value === 'archived' ? t.archived : t.tripListGeneral;
                  const chosen = archive === value;
                  return (
                    <Pressable
                      key={value}
                      testID={`trips-${value}`}
                      accessibilityRole="tab"
                      accessibilityLabel={`${label}${counts ? ` (${counts[value]})` : ''}`}
                      accessibilityState={{ selected: chosen, disabled: archiveBusy }}
                      disabled={archiveBusy}
                      onFocus={() => setFocusedTab(value)}
                      onBlur={() => setFocusedTab(null)}
                      onPress={() => setArchive(value)}
                      style={({ pressed }) => ({
                        flex: 1,
                        minWidth: sizing.touch,
                        minHeight: sizing.touch,
                        padding: spacing.small,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderTopWidth: 2,
                        borderLeftWidth: 2,
                        borderRightWidth: 2,
                        borderColor: focusedTab === value ? p.focus : 'transparent',
                        borderBottomWidth: 2,
                        borderBottomColor: chosen ? p.primary : 'transparent',
                        backgroundColor: pressed ? p.selected : 'transparent',
                      })}
                    >
                      <Text
                        style={[
                          typography.body,
                          {
                            color: chosen ? p.primary : p.muted,
                            fontWeight: chosen ? '700' : '400',
                          },
                        ]}
                      >
                        {label}
                        {counts ? ` (${counts[value]})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <LocalWorkLink />
            {resultOwner === owner && <Notice tone="success">{t.operationDone}</Notice>}
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
              <Title>
                {noTrips
                  ? t.noTrips
                  : archive === 'archived'
                    ? t.noArchivedTrips
                    : t.noGeneralTrips}
              </Title>
              <Copy>
                {noTrips
                  ? t.noTripsHint
                  : archive === 'archived'
                    ? t.noArchivedTripsHint
                    : t.noGeneralTripsHint}
              </Copy>
              {noTrips && (
                <>
                  <Action
                    testID="create-trip"
                    label={t.createFirstTrip}
                    disabled={!online}
                    onPress={() => router.push('/trips/create')}
                  />
                  <Action
                    testID="join-trip"
                    variant="ghost"
                    label={t.joinTrip}
                    disabled={!online}
                    onPress={() => router.push('/trips/join')}
                  />
                </>
              )}
              {!noTrips && archive === 'unarchived' && (counts?.archived ?? 0) > 0 && (
                <Action variant="ghost" label={t.archived} onPress={() => setArchive('archived')} />
              )}
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
                <View
                  style={{
                    marginTop: index ? spacing.large : spacing.small,
                    marginBottom: spacing.medium,
                  }}
                >
                  <Title>
                    {group === 'current'
                      ? t.currentTripsGroup
                      : group === 'no-date'
                        ? t.unscheduled
                        : group}
                  </Title>
                </View>
              )}
              <TripCard
                trip={item}
                actions
                onMore={() => {
                  setResultOwner('');
                  setSelected({ trip: item, owner });
                }}
              />
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
        transparent
        animationType="slide"
        onRequestClose={closeMore}
        onDismiss={restoreFocus}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: `${p.scrim}99` }}>
          <Pressable
            accessible={false}
            disabled={archiveBusy}
            onPress={closeMore}
            style={{ flex: 1, minHeight: sizing.touch }}
          />
          <SafeAreaView
            edges={['bottom', 'left', 'right']}
            accessibilityViewIsModal
            style={{
              maxHeight: '85%',
              backgroundColor: p.background,
              borderTopLeftRadius: radius.card,
              borderTopRightRadius: radius.card,
            }}
          >
            <ScrollView contentContainerStyle={styles.page}>
              {shown && (
                <View accessibilityViewIsModal style={{ gap: spacing.medium }}>
                  <Title>{shown.name}</Title>
                  <PersonalArchive
                    tripId={shown.id}
                    archived={shown.archived}
                    onCloseBlocked={setArchiveBusy}
                    onSettled={archiveSettled}
                  />
                </View>
              )}
              <Action
                testID="trip-more-close"
                variant="ghost"
                label={t.close}
                disabled={archiveBusy}
                onPress={closeMore}
              />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </ScreenFrame>
  );
}
