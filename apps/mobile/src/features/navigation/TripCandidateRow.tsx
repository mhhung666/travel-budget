import { Pressable, Text } from 'react-native';
import { useMessages } from '@/i18n/useMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { usePalette } from '@/components/ui';
import { tripDates } from '@/features/trips/TripSummary';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import type { TripCandidate } from './tripCandidates';

export function TripCandidateRow({ item, onPress }: { item: TripCandidate; onPress: () => void }) {
  const t = useMessages();
  const p = usePalette();
  const { locale } = useDisplayFormat();
  const details = item.trip
    ? `${tripDates(item.trip, t, locale)} · ${t[item.trip.phase]}`
    : undefined;
  return (
    <Pressable
      testID={`record-trip-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={details ? `${item.name}, ${details}` : item.name}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: sizing.touch,
        padding: spacing.medium,
        gap: spacing.small,
        borderWidth: sizing.border,
        borderColor: p.border,
        borderRadius: radius.card,
        backgroundColor: pressed ? p.selected : p.surface,
        marginBottom: spacing.small,
      })}
    >
      <Text style={[typography.body, { color: p.text, fontWeight: '700' }]}>{item.name}</Text>
      {details && <Text style={[typography.label, { color: p.muted }]}>{details}</Text>}
    </Pressable>
  );
}
