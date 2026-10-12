import { useState } from 'react';
import { baseCurrency } from '@/api/ledger';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Trip } from '@/api/contracts';
import { Action, Badge, Icon, usePalette } from '@/components/ui';
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
  const [mainFocused, setMainFocused] = useState(false);
  const [moreFocused, setMoreFocused] = useState(false);
  const t = useMessages(baseCurrency(trip));
  const { money, locale } = useDisplayFormat(baseCurrency(trip));
  const state = trip.phase === 'unscheduled' ? t.unscheduledPhase : t[trip.phase];
  const balance = trip.myBalance === 0 ? t.balanced : trip.myBalance > 0 ? t.receivable : t.payable;
  return (
    <View
      style={{
        marginBottom: spacing.medium,
        borderWidth: sizing.border,
        borderColor: p.border,
        borderRadius: radius.card,
        backgroundColor: p.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Pressable
          testID={`trip-${trip.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${trip.name}, ${state}${trip.archived ? `, ${t.archived}` : ''}, ${tripDates(trip, t, locale)}, ${trip.destination ?? ''}, ${t.memberCount}: ${trip.memberCount}, ${t.mySpent}: ${money(trip.mySpent)}, ${balance}: ${money(Math.abs(trip.myBalance))}, ${t.openTrip}`}
          onFocus={() => setMainFocused(true)}
          onBlur={() => setMainFocused(false)}
          onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            minHeight: sizing.touch,
            backgroundColor: pressed ? p.selected : p.surface,
            borderRadius: radius.card,
            borderWidth: 2,
            borderColor: mainFocused ? p.focus : 'transparent',
            padding: spacing.medium - 2,
            gap: spacing.small,
          })}
        >
          <Text style={[typography.section, { color: p.text, fontWeight: '700' }]}>
            {trip.name}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
            <Badge label={state} />
            {trip.archived && <Badge label={t.archived} />}
          </View>
          <TripMetadata trip={trip} destination />
          <TripFinancialSummary trip={trip} compact />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.small }}>
            <Text style={[typography.label, { color: p.primary }]}>{t.openTrip}</Text>
            <Icon name="chevron-right" color={p.primary} />
          </View>
        </Pressable>
        {actions && onMore && (
          <Pressable
            testID={`trip-more-${trip.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${trip.name}, ${t.tripMore}`}
            onPress={onMore}
            onFocus={() => setMoreFocused(true)}
            onBlur={() => setMoreFocused(false)}
            style={({ pressed }) => ({
              minWidth: sizing.touch,
              minHeight: sizing.touch,
              margin: spacing.small,
              marginLeft: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.control,
              borderWidth: 2,
              borderColor: moreFocused ? p.focus : 'transparent',
              backgroundColor: pressed ? p.selected : 'transparent',
            })}
          >
            <Text style={[typography.section, { color: p.primary }]}>⋯</Text>
          </Pressable>
        )}
      </View>
      {actions && !trip.archived && (
        <View
          style={{ borderTopWidth: sizing.border, borderColor: p.border, padding: spacing.small }}
        >
          <View style={{ alignSelf: 'flex-end', maxWidth: '100%' }}>
            <Action
              testID={`trip-action-${trip.id}`}
              variant="ghost"
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
          </View>
        </View>
      )}
    </View>
  );
}
