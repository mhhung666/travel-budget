import { Text, View } from 'react-native';
import type { ItineraryActivity, ItineraryLocation } from '@travel-budget/contracts';
import { DetailRow, Section, usePalette } from '@/components/ui';
import { useMessages, useAppLocale } from '@/i18n/useMessages';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { spacing, typography } from '@/theme/tokens';
import { activityTiming, locationName } from './presentation';

export function ReadableText({ children }: { children: string }) {
  const p = usePalette();
  return (
    <Text selectable style={[typography.body, { color: p.text }]}>
      {children}
    </Text>
  );
}
export function LocationDetails({
  location,
  locale,
}: {
  location: ItineraryLocation;
  locale: string;
}) {
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
export function ActivityDetails({
  activity,
  day,
  trip,
}: {
  activity: ItineraryActivity;
  day: { dayNumber: number; date: string | null };
  trip?: { startDate: string | null; endDate: string | null };
}) {
  const t = useMessages(),
    locale = useAppLocale();
  const copy = itineraryPresentationMessages[locale];
  const place = locationName(activity.location, activity.locationName, locale);
  const timing = activityTiming(activity, day, t, copy, trip);
  return (
    <View style={{ gap: spacing.small }}>
      <DetailRow label={copy.summary} value={timing.summary} />
      {activity.location && <LocationDetails location={activity.location} locale={locale} />}
      {!!activity.locationName && (!activity.location || activity.locationName !== place) && (
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
    </View>
  );
}
