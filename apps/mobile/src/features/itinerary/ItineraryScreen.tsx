import { useState } from 'react';
import { router } from 'expo-router';
import { batchDeletionMessages } from '@/i18n/batchDeletionMessages';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import type { ItineraryActivity, ItineraryLocation } from '@travel-budget/contracts';
import { ScreenFrame } from '@/components/frame';
import { ScrollChrome } from '@/components/scrollChrome';
import { DaySelector } from './DaySelector';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { Disclosure } from '@/components/Disclosure';
import {
  Action,
  Icon,
  Copy,
  DetailRow,
  Notice,
  Page,
  Section,
  Title,
  usePalette,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useMessages, useAppLocale } from '@/i18n/useMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useOnline } from '@/providers/useOnline';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import { useTrip } from '@/features/trips/queries';
import { ActivityActions } from './ActivityActions';
import { DayActions } from './DayActions';
import { useItinerary } from './queries';
import { activityIcon, activityTiming, activityType, dayLabel, locationName } from './presentation';

export function ItineraryScreen({ tripId }: { tripId: string }) {
  const { manager, user, status } = useAuth();
  const { catalog } = useDraftCatalog();
  const query = useItinerary(tripId);
  const t = useMessages();
  const online = useOnline();
  const scope = user ? { environment: manager.api.environment, accountId: user.id } : null;
  const denied =
    status !== 'signedIn' ||
    !scope ||
    !catalog.isVisible(scope, tripId) ||
    isAccessDenied(query.error);
  if (denied)
    return (
      <Page>
        <Notice tone="danger">{t.notFound}</Notice>
      </Page>
    );
  return (
    <ItineraryReader
      key={`${manager.api.environment}:${user?.id}:${manager.getSignInVersion()}:${tripId}`}
      tripId={tripId}
      query={query}
      online={online}
    />
  );
}

function ItineraryReader({
  query,
  online,
  tripId,
}: {
  query: ReturnType<typeof useItinerary>;
  online: boolean;
  tripId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const t = useMessages();
  const f = useDisplayFormat();
  const locale = useAppLocale();
  const p = usePalette();
  const trip = useTrip(tripId);
  const canEdit = !trip.isError && trip.data?.role === 'admin';
  const days = query.data?.days ?? [];
  const index = Math.max(
    0,
    days.findIndex((day) => day.id === selectedId)
  );
  const day = days[index];
  return (
    <ScreenFrame style={{ backgroundColor: p.background }}>
      <FlatList
        key={day?.id ?? 'empty'}
        testID="itinerary-list"
        data={day?.activities ?? []}
        keyExtractor={(activity) => activity.id}
        contentContainerStyle={{
          padding: spacing.medium,
          gap: 0,
          width: '100%',
          maxWidth: 640,
          alignSelf: 'center',
        }}
        refreshing={query.isRefetching}
        onRefresh={online ? () => void query.refresh() : undefined}
        ListHeaderComponent={
          <View style={{ gap: spacing.medium }}>
            <ScrollChrome />
            <Title>{t.itinerary}</Title>
            {query.data && <DayActions tripId={tripId} canEdit={canEdit} mode="add" />}
            {!online && <Notice tone="warning">{t.offline}</Notice>}
            {query.isPending && online && <ActivityIndicator accessibilityLabel={t.loading} />}
            {query.isError && (
              <>
                <Notice tone={query.data ? 'warning' : 'danger'}>
                  {query.data ? t.staleData : errorMessage(query.error, t)}
                </Notice>
                <Action
                  label={t.retry}
                  disabled={!online || query.isFetching}
                  onPress={() => void query.refresh()}
                />
              </>
            )}
            {query.data && days.length === 0 && <Copy>{t.itineraryEmpty}</Copy>}
            {day && (
              <>
                {!query.data?.startDate && <Copy>{t.itineraryNoDates}</Copy>}
                <DaySelector days={days} selectedId={day.id} select={setSelectedId} />
                <View
                  testID="itinerary-day-card-header"
                  style={{
                    borderWidth: sizing.border,
                    borderBottomWidth: 0,
                    borderColor: p.border,
                    borderTopLeftRadius: radius.card,
                    borderTopRightRadius: radius.card,
                    backgroundColor: p.surface,
                    padding: spacing.medium,
                    gap: spacing.compact,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      gap: spacing.small,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 140, gap: spacing.tiny }}>
                      <Copy>
                        {dayLabel(day.dayNumber, t)}
                        {day.date ? ` · ${f.date(day.date)}` : ''}
                      </Copy>
                      <Title>{day.title}</Title>
                    </View>
                    <DayActions tripId={tripId} dayId={day.id} canEdit={canEdit} mode="settings" />
                  </View>
                  {day.outsideTripRange && <Notice tone="warning">{t.itineraryOutside}</Notice>}
                  {day.location && <LocationDetails location={day.location} locale={locale} />}
                  {!!day.content && (
                    <Section title={itineraryPresentationMessages[locale].dayNotes}>
                      <ReadableText>{day.content}</ReadableText>
                    </Section>
                  )}
                  {!day.content && (
                    <DayActions tripId={tripId} dayId={day.id} canEdit={canEdit} mode="notes" />
                  )}
                  <View
                    testID="itinerary-activity-toolbar"
                    style={{
                      borderTopWidth: sizing.border,
                      borderColor: p.border,
                      paddingTop: spacing.compact,
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: spacing.small,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      accessibilityRole="header"
                      style={[typography.label, { color: p.text, fontWeight: '700', flexGrow: 1 }]}
                    >
                      {itineraryPresentationMessages[locale].activities} · {day.activities.length}
                    </Text>
                    {canEdit && day.activities.length > 0 && (
                      <Action
                        testID="itinerary-select-activities"
                        variant="ghost"
                        label={batchDeletionMessages[locale].select}
                        disabled={!online}
                        onPress={() => {
                          if (online)
                            router.push({
                              pathname: '/trips/[id]/itinerary/batch-delete',
                              params: { id: tripId, dayId: day.id },
                            });
                        }}
                      />
                    )}
                    <ActivityActions
                      tripId={tripId}
                      dayId={day.id}
                      canEdit={canEdit}
                      online={online}
                    />
                  </View>
                  {day.activities.length === 0 && <Copy>{t.itineraryNoActivities}</Copy>}
                </View>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ActivityCard
            activity={item}
            day={day}
            trip={query.data}
            actions={
              day ? (
                <ActivityActions
                  tripId={tripId}
                  dayId={day.id}
                  activityId={item.id}
                  label={`${activityTiming(item, day, t, itineraryPresentationMessages[locale], query.data).summary} · ${item.title}`}
                  canEdit={canEdit}
                  online={online}
                />
              ) : undefined
            }
          />
        )}
        ListFooterComponent={
          query.data ? (
            <View style={{ gap: spacing.medium }}>
              {day && (
                <View
                  style={{
                    backgroundColor: p.surface,
                    height: spacing.small,
                    borderWidth: sizing.border,
                    borderTopWidth: 0,
                    borderColor: p.border,
                    borderBottomLeftRadius: radius.card,
                    borderBottomRightRadius: radius.card,
                  }}
                />
              )}
              <Action
                testID="itinerary-refresh"
                variant="secondary"
                label={t.refresh}
                busy={query.isFetching}
                disabled={!online}
                onPress={() => void query.refresh()}
              />
            </View>
          ) : null
        }
      />
    </ScreenFrame>
  );
}
function ReadableText({ children }: { children: string }) {
  const p = usePalette();
  return (
    <Text selectable style={[typography.body, { color: p.text }]}>
      {children}
    </Text>
  );
}
function LocationDetails({ location, locale }: { location: ItineraryLocation; locale: string }) {
  const t = useMessages();
  return (
    <View style={{ gap: spacing.small }}>
      <DetailRow label={t.itineraryLocation} value={locationName(location, '', locale)} />
      {!!location.display_name && (
        <DetailRow label={t.itineraryAddress} value={location.display_name} />
      )}
      <DetailRow label={t.itineraryCoordinates} value={`${location.lat}, ${location.lon}`} />
    </View>
  );
}
export function ActivityCard({
  activity,
  actions,
  day = { dayNumber: 1, date: null },
  trip,
}: {
  activity: ItineraryActivity;
  actions?: React.ReactNode;
  day?: { dayNumber: number; date: string | null };
  trip?: { startDate: string | null; endDate: string | null };
}) {
  const t = useMessages(),
    locale = useAppLocale(),
    p = usePalette();
  const copy = itineraryPresentationMessages[locale];
  const place = locationName(activity.location, activity.locationName, locale);
  const timing = activityTiming(activity, day, t, copy, trip);
  return (
    <View
      testID={`itinerary-activity-row-${activity.id}`}
      style={{
        padding: spacing.compact,
        backgroundColor: p.surface,
        borderWidth: sizing.border,
        borderTopWidth: 0,
        borderColor: p.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: spacing.small,
        }}
      >
        <View style={{ width: 76, gap: spacing.tiny }}>
          <Text style={[typography.label, { color: p.muted, fontVariant: ['tabular-nums'] }]}>
            {timing.start}
          </Text>
          <Text style={[typography.meta, { color: p.muted }]}>{timing.end}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 110, gap: spacing.tiny }}>
          <View style={{ flexDirection: 'row', gap: spacing.small, alignItems: 'flex-start' }}>
            <Icon name={activityIcon(activity.type)} color={p.primary} />
            <Text style={[typography.body, { color: p.text, fontWeight: '700', flex: 1 }]}>
              {activity.title}
            </Text>
          </View>
          <Copy>{activityType(activity.type, t)}</Copy>
          {!!place && <Copy>{place}</Copy>}
        </View>
        {actions}
      </View>
      {timing.showSummary && <Copy>{timing.summary}</Copy>}
      {timing.outsideRange && <Notice tone="warning">{copy.outsideRange}</Notice>}
      <Disclosure
        testID={`itinerary-activity-${activity.id}`}
        title={t.itineraryDetails}
        accessibilityLabel={`${t.itineraryDetails} · ${timing.summary} · ${activity.title}`}
      >
        <DetailRow label={copy.summary} value={timing.summary} />
        {activity.location && <LocationDetails location={activity.location} locale={locale} />}
        {!!activity.locationName && activity.locationName !== place && (
          <DetailRow label={t.itineraryLocation} value={activity.locationName} />
        )}
        {!!activity.note && (
          <Section title={t.itineraryNote}>
            <ReadableText>{activity.note}</ReadableText>
          </Section>
        )}
        {!!activity.confirmationCode && (
          <DetailRow label={t.itineraryConfirmation} value={activity.confirmationCode} />
        )}
      </Disclosure>
    </View>
  );
}
