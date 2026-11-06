import { useRef, useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ItineraryDay } from '@travel-budget/contracts';
import { NavigationMenu } from '@/components/NavigationMenu';
import { usePalette } from '@/components/ui';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import { dayLabel } from './presentation';

export function DaySelector({
  days,
  selectedId,
  select,
}: {
  days: ItineraryDay[];
  selectedId: string;
  select: (id: string) => void;
}) {
  const t = useMessages(),
    f = useDisplayFormat(),
    p = usePalette();
  const copy = itineraryPresentationMessages[useAppLocale()];
  const scroller = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, number>());
  const reveal = (id: string) => {
    const x = positions.current.get(id);
    if (x !== undefined)
      scroller.current?.scrollTo({ x: Math.max(0, x - spacing.small), animated: false });
  };
  useEffect(() => {
    const x = positions.current.get(selectedId);
    if (x !== undefined)
      scroller.current?.scrollTo({ x: Math.max(0, x - spacing.small), animated: false });
  }, [selectedId]);
  const label = (d: ItineraryDay) =>
    `${dayLabel(d.dayNumber, t)}${d.date ? ` · ${f.date(d.date)}` : ''} · ${d.title}`;
  return (
    <View style={{ gap: spacing.small }}>
      <ScrollView
        ref={scroller}
        horizontal
        testID="itinerary-day-strip"
        showsHorizontalScrollIndicator
        onLayout={() => reveal(selectedId)}
        onContentSizeChange={() => reveal(selectedId)}
        contentContainerStyle={{ gap: spacing.small, paddingVertical: spacing.tiny }}
      >
        {days.map((d) => (
          <Pressable
            key={d.id}
            testID={`itinerary-day-chip-${d.id}`}
            accessibilityRole="button"
            accessibilityLabel={label(d)}
            accessibilityState={{ selected: d.id === selectedId }}
            onLayout={(event) => {
              positions.current.set(d.id, event.nativeEvent.layout.x);
              if (d.id === selectedId) reveal(d.id);
            }}
            onPress={() => select(d.id)}
            style={{
              minHeight: sizing.touch,
              minWidth: 100,
              maxWidth: 240,
              borderWidth: sizing.border,
              borderColor: d.id === selectedId ? p.primary : p.border,
              borderRadius: radius.control,
              padding: spacing.compact,
              justifyContent: 'center',
              backgroundColor: d.id === selectedId ? p.selected : p.surface,
            }}
          >
            <Text
              style={[
                typography.label,
                { color: d.id === selectedId ? p.primary : p.text, fontWeight: '700' },
              ]}
            >
              {dayLabel(d.dayNumber, t)}
            </Text>
            <Text style={[typography.label, { color: p.muted }]}>
              {d.date ? f.date(d.date) : t.itineraryNoDates}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <NavigationMenu
        testID="itinerary-day-picker"
        title={t.itineraryChooseDay}
        closeLabel={t.closeNavigation}
        label={copy.viewDates}
        context={label(days.find((d) => d.id === selectedId)!)}
        choices={days.map((d) => ({
          label: label(d),
          selected: d.id === selectedId,
          testID: `itinerary-day-${d.id}`,
          onPress: () => select(d.id),
        }))}
      />
    </View>
  );
}
