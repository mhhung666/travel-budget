import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import type { Trip } from '@/api/contracts';
import { DetailRow, Metric, usePalette } from '@/components/ui';
import { formatDate } from '@/i18n/format';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import type { AppLocale, Messages } from '@/i18n/messages';
import { useMessages } from '@/i18n/useMessages';
import { spacing, typography } from '@/theme/tokens';

/** Date-only values stay literal; a missing endpoint must not look like a complete range. */
export function tripDates(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  t: Messages,
  locale: AppLocale = 'en'
) {
  if (!trip.startDate && !trip.endDate) return t.unscheduled;
  if (trip.startDate && trip.endDate)
    return `${formatDate(trip.startDate, locale)} — ${formatDate(trip.endDate, locale)}`;
  return `${t.startDate}: ${trip.startDate ? formatDate(trip.startDate, locale) : t.notSet} · ${t.endDate}: ${trip.endDate ? formatDate(trip.endDate, locale) : t.notSet}`;
}

export function TripMetadata({ trip }: { trip: Trip }) {
  const t = useMessages();
  const p = usePalette();
  const { locale } = useDisplayFormat();
  return (
    <Text style={[typography.label, { color: p.muted }]}>
      {tripDates(trip, t, locale)}
      {' · '}
      {t.memberCount}: {trip.memberCount}
    </Text>
  );
}

/** Both amounts are backend values. Zero balance says nothing about a trip being settled. */
export function TripFinancialSummary({
  trip,
  compact = false,
}: {
  trip: Pick<Trip, 'mySpent' | 'myBalance'>;
  compact?: boolean;
}) {
  const t = useMessages();
  const { money } = useDisplayFormat();
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const columns = (width - spacing.small) / fontScale >= 320;
  const Row = compact ? DetailRow : Metric;
  return (
    <View
      testID="trip-financial-summary"
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      style={{ flexDirection: columns ? 'row' : 'column', gap: spacing.small }}
    >
      <View style={columns ? { flex: 1, minWidth: 0 } : undefined}>
        <Row
          testID={compact ? undefined : 'trip-my-spent'}
          label={t.mySpent}
          value={money(trip.mySpent)}
        />
      </View>
      <View style={columns ? { flex: 1, minWidth: 0 } : undefined}>
        <Row
          testID={compact ? undefined : 'trip-balance'}
          label={trip.myBalance === 0 ? t.balanced : trip.myBalance > 0 ? t.receivable : t.payable}
          value={money(Math.abs(trip.myBalance))}
        />
      </View>
    </View>
  );
}
