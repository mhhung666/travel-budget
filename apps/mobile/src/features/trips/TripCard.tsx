import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import type { Trip } from '@/api/contracts';
import { Badge, usePalette } from '@/components/ui';
import { money } from '@/i18n/format';
import { useMessages } from '@/i18n/useMessages';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import { TripFinancialSummary, TripMetadata, tripDates } from './TripSummary';

export function TripCard({ trip }: { trip: Trip }) {
  const p = usePalette();
  const t = useMessages();
  const state = trip.archived ? t.archived : t[trip.phase];
  const balance = trip.myBalance === 0 ? t.balanced : trip.myBalance > 0 ? t.receivable : t.payable;
  return (
    <Pressable
      testID={`trip-${trip.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${state}, ${trip.name}, ${tripDates(trip, t)}, ${t.memberCount}: ${trip.memberCount}, ${t.mySpent}: ${money(trip.mySpent)}, ${balance}: ${money(Math.abs(trip.myBalance))}`}
      onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
      style={({ pressed }) => ({
        minHeight: sizing.touch,
        backgroundColor: pressed ? p.selected : p.surface,
        borderColor: p.border,
        borderWidth: sizing.border,
        borderRadius: radius.card,
        padding: spacing.medium,
        marginBottom: spacing.medium,
        gap: spacing.compact,
      })}
    >
      <Badge label={state} />
      <Text style={[typography.section, { color: p.text, fontWeight: '700' }]}>{trip.name}</Text>
      <TripMetadata trip={trip} />
      <TripFinancialSummary trip={trip} compact />
    </Pressable>
  );
}
