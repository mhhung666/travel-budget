import { baseCurrency } from '@/api/ledger';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Trip } from '@/api/contracts';
import { Action, Badge, usePalette } from '@/components/ui';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import { TripFinancialSummary, TripMetadata, tripDates } from './TripSummary';

export function TripCard({
  trip,
  onMore,
  actions = false,
}: {
  trip: Trip;
  onMore?: () => void;
  actions?: boolean;
}) {
  const p = usePalette();
  const t = useMessages(baseCurrency(trip));
  const { money, locale } = useDisplayFormat(baseCurrency(trip));
  const state = trip.archived ? t.archived : t[trip.phase];
  const balance = trip.myBalance === 0 ? t.balanced : trip.myBalance > 0 ? t.receivable : t.payable;
  return (
    <View style={{ marginBottom: spacing.medium }}>
      <Pressable
        testID={`trip-${trip.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${state}, ${trip.name}, ${tripDates(trip, t, locale)}, ${t.memberCount}: ${trip.memberCount}, ${t.mySpent}: ${money(trip.mySpent)}, ${balance}: ${money(Math.abs(trip.myBalance))}`}
        onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
        style={({ pressed }) => ({
          minHeight: sizing.touch,
          backgroundColor: pressed ? p.selected : p.surface,
          borderColor: p.border,
          borderWidth: sizing.border,
          borderRadius: radius.card,
          padding: spacing.medium,
          gap: spacing.compact,
        })}
      >
        <Text style={[typography.section, { color: p.text, fontWeight: '700' }]}>{trip.name}</Text>
        <TripMetadata trip={trip} />
        <Badge label={state} />
        <TripFinancialSummary trip={trip} compact />
      </Pressable>
      {actions && (
        <View style={{ gap: spacing.small, paddingTop: spacing.small }}>
          {!trip.archived && (
            <Action
              testID={`trip-action-${trip.id}`}
              variant="secondary"
              label={
                trip.phase === 'past' && Math.abs(trip.myBalance) >= 0.01
                  ? t.viewSettlement
                  : t.recordExpense
              }
              onPress={() =>
                router.push({
                  pathname:
                    trip.phase === 'past' && Math.abs(trip.myBalance) >= 0.01
                      ? '/trips/[id]/settlement'
                      : '/trips/[id]/expenses/new',
                  params: { id: trip.id },
                })
              }
            />
          )}
          <Action
            testID={`trip-more-${trip.id}`}
            variant="ghost"
            label={`${t.tripMore}: ${trip.name}`}
            onPress={onMore ?? (() => undefined)}
          />
        </View>
      )}
    </View>
  );
}
