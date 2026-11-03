import { useState } from 'react';
import { baseCurrency } from '@/api/ledger';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Trip } from '@/api/contracts';
import { Action, Icon, usePalette } from '@/components/ui';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { cardShadows, radius, sizing, spacing, typography } from '@/theme/tokens';
import {
  TripCardLayout,
  TripCardSummary,
  tripCardRadius,
  tripCardFrameStyle,
} from './TripCardLayout';
import { cardDates, cardMoney, cardNumber, cardPhase } from './tripCardFormat';

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
  const [mainPressed, setMainPressed] = useState(false);
  const [mainHovered, setMainHovered] = useState(false);
  const [moreFocused, setMoreFocused] = useState(false);
  const t = useMessages(baseCurrency(trip));
  const { locale } = useDisplayFormat(baseCurrency(trip));
  const money = (value: number) => cardMoney(value, baseCurrency(trip), locale);
  const state = cardPhase(trip, t);
  const balance = trip.myBalance === 0 ? t.balanced : trip.myBalance > 0 ? t.receivable : t.payable;
  return (
    <View
      style={{
        ...tripCardFrameStyle(p),
        borderColor: mainFocused ? p.focus : p.border,
        backgroundColor: mainPressed ? p.selected : p.surface,
        ...(mainPressed || mainHovered || mainFocused ? cardShadows.active : cardShadows.resting),
      }}
    >
      <Pressable
        testID={`trip-${trip.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${trip.name}, ${state}, ${cardDates(trip, t, locale)}, ${trip.destination ?? ''}, ${t.memberCount}: ${trip.memberCount}, ${t.mySpent}: ${money(trip.mySpent)}, ${balance}${trip.myBalance === 0 ? '' : `: ${money(Math.abs(trip.myBalance))}`}, ${t.openTrip}`}
        onFocus={() => setMainFocused(true)}
        onBlur={() => {
          setMainFocused(false);
          setMainPressed(false);
        }}
        onPressIn={() => setMainPressed(true)}
        onPressOut={() => setMainPressed(false)}
        onHoverIn={() => setMainHovered(true)}
        onHoverOut={() => setMainHovered(false)}
        onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: tripCardRadius,
        }}
      />
      <TripCardLayout
        title={
          <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: '600', color: p.text }}>
            {trip.name}
          </Text>
        }
        status={
          <Text
            style={[
              typography.label,
              {
                color:
                  !trip.archived && (trip.phase === 'ongoing' || trip.phase === 'upcoming')
                    ? p.primary
                    : p.muted,
              },
            ]}
          >
            {state}
          </Text>
        }
        dates={
          <Text style={[typography.label, { color: p.muted }]}>{cardDates(trip, t, locale)}</Text>
        }
        members={
          <Text style={[typography.label, { color: p.muted }]}>
            {trip.destination ? `${trip.destination} · ` : ''}
            {t.memberCount}: {trip.memberCount}
          </Text>
        }
        summary={
          <TripCardSummary
            digits={Math.max(
              cardNumber(trip.mySpent, locale).length,
              cardNumber(trip.myBalance, locale).length * 0.8
            )}
            left={
              <>
                <Text style={[typography.label, { color: p.muted }]}>{t.mySpent}</Text>
                <Text
                  style={[
                    typography.section,
                    { color: p.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
                  ]}
                >
                  {money(trip.mySpent)}
                </Text>
              </>
            }
            right={
              <>
                <Text style={[typography.label, { color: p.muted }]}>{balance}</Text>
                {trip.myBalance !== 0 && (
                  <Text style={[typography.body, { color: p.text, fontVariant: ['tabular-nums'] }]}>
                    {money(trip.myBalance)}
                  </Text>
                )}
              </>
            }
          />
        }
        open={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.small }}>
            <Text style={[typography.label, { color: p.muted, flexShrink: 1 }]}>{t.openTrip}</Text>
            <Icon name="chevron-right" color={p.muted} />
          </View>
        }
        more={
          actions && onMore ? (
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
          ) : undefined
        }
        shortcut={
          actions && !trip.archived ? (
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
          ) : undefined
        }
      />
    </View>
  );
}
