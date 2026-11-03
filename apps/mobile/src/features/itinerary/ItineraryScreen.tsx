import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import type { ItineraryActivity, ItineraryLocation } from '@travel-budget/contracts';
import { ScreenFrame } from '@/components/frame';
import { ScrollChrome } from '@/components/scrollChrome';
import { NavigationMenu } from '@/components/NavigationMenu';
import { Disclosure } from '@/components/Disclosure';
import {
  Action,
  Card,
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
import { spacing, typography } from '@/theme/tokens';
import { DayActions } from './DayActions';
import { useItinerary } from './queries';
import { activityTime, activityType, dayLabel, locationName } from './presentation';

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
          gap: spacing.medium,
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
            {query.data && <DayActions tripId={tripId} dayId={day?.id} />}
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
                <NavigationMenu
                  testID="itinerary-day-picker"
                  title={t.itineraryChooseDay}
                  closeLabel={t.closeNavigation}
                  label={`${dayLabel(day.dayNumber, t)}${day.date ? ` · ${f.date(day.date)}` : ''} · ${day.title}`}
                  choices={days.map((item) => ({
                    label: `${dayLabel(item.dayNumber, t)}${item.date ? ` · ${f.date(item.date)}` : ''} · ${item.title}`,
                    selected: item.id === day.id,
                    testID: `itinerary-day-${item.id}`,
                    onPress: () => setSelectedId(item.id),
                  }))}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
                  <View style={{ flexGrow: 1, flexBasis: 140 }}>
                    <Action
                      testID="itinerary-previous"
                      variant="secondary"
                      label={t.itineraryPrevious}
                      disabled={index === 0}
                      onPress={() => setSelectedId(days[index - 1].id)}
                    />
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 140 }}>
                    <Action
                      testID="itinerary-next"
                      variant="secondary"
                      label={t.itineraryNext}
                      disabled={index === days.length - 1}
                      onPress={() => setSelectedId(days[index + 1].id)}
                    />
                  </View>
                </View>
                <Title>{day.title}</Title>
                {day.outsideTripRange && <Notice tone="warning">{t.itineraryOutside}</Notice>}
                {day.location && <LocationDetails location={day.location} locale={locale} />}
                {!!day.content && (
                  <Section title={t.itineraryDayContent}>
                    <ReadableText>{day.content}</ReadableText>
                  </Section>
                )}
                {day.activities.length === 0 && <Copy>{t.itineraryNoActivities}</Copy>}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => <ActivityCard activity={item} />}
        ListFooterComponent={
          query.data ? (
            <Action
              testID="itinerary-refresh"
              variant="secondary"
              label={t.refresh}
              busy={query.isFetching}
              disabled={!online}
              onPress={() => void query.refresh()}
            />
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
export function ActivityCard({ activity }: { activity: ItineraryActivity }) {
  const t = useMessages();
  const locale = useAppLocale();
  const place = locationName(activity.location, activity.locationName, locale);
  return (
    <Card>
      <Copy>
        {activityTime(activity, t)} · {activityType(activity.type, t)}
      </Copy>
      <Title>{activity.title}</Title>
      {!!place && <Copy>{place}</Copy>}
      <Disclosure
        testID={`itinerary-activity-${activity.id}`}
        title={`${t.itineraryDetails} · ${activity.title}`}
      >
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
    </Card>
  );
}
