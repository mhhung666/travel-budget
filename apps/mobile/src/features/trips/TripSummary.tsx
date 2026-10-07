import { Text, View, useWindowDimensions } from 'react-native';
import type { Trip } from '@/api/contracts';
import { DetailRow, Metric, usePalette } from '@/components/ui';
import { money } from '@/i18n/format';
import { useMessages } from '@/i18n/useMessages';
import type { Messages } from '@/i18n/messages';
import { spacing, typography } from '@/theme/tokens';

/** Date-only values stay literal; a missing endpoint must not look like a complete range. */
export function tripDates(trip: Pick<Trip, 'startDate' | 'endDate'>, t: Messages) {
  if (!trip.startDate && !trip.endDate) return t.unscheduled;
  if (trip.startDate && trip.endDate) return `${trip.startDate} — ${trip.endDate}`;
  return `${t.startDate}: ${trip.startDate ?? t.notSet} · ${t.endDate}: ${trip.endDate ?? t.notSet}`;
}

export function TripMetadata({ trip }: { trip: Trip }) {
  const t = useMessages();
  const p = usePalette();
  return (
    <Text style={[typography.label, { color: p.muted }]}>
      {tripDates(trip, t)}
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
  const { width, fontScale } = useWindowDimensions();
  const columns = (width - spacing.medium * 2 - spacing.small) / fontScale >= 320;
  const Row = compact ? DetailRow : Metric;
  return (
    <View
      testID="trip-financial-summary"
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
