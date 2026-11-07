import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { itineraryContinuations, type ItineraryDay } from '@travel-budget/contracts';
import { Action, Copy, Notice, usePalette } from '@/components/ui';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import {
  itineraryPresentationMessages,
  continuationSource,
} from '@/i18n/itineraryPresentationMessages';
import { spacing, sizing, typography } from '@/theme/tokens';
import { ActivityDetails } from './ActivityDetails';

function focus(control: View | Text | null) {
  if (!control) return;
  if (Platform.OS === 'web') control.focus();
  else AccessibilityInfo.sendAccessibilityEvent(control, 'focus');
}
/** Only mounted by the reader, never by the batch editor. No queries, routes or mutations. */
export function ActivityContinuations({
  days,
  targetDayId,
  trip,
  returnFocus,
}: {
  days: readonly ItineraryDay[];
  targetDayId: string;
  returnFocus: RefObject<Text | null>;
  trip?: { startDate: string | null; endDate: string | null };
}) {
  const locale = useAppLocale();
  const t = useMessages(),
    copy = itineraryPresentationMessages[locale],
    p = usePalette();
  const hints = useMemo(
    () => itineraryContinuations(days).get(targetDayId) ?? [],
    [days, targetDayId]
  );
  const [source, setSource] = useState<{ dayId: string; activityId: string } | null>(null);
  const sourceDay = days.find((day) => day.id === source?.dayId);
  const activity = sourceDay?.activities.find((item) => item.id === source?.activityId);
  const heading = useRef<Text>(null);
  const triggers = useRef(new Map<string, View>());
  const returnKey = useRef<string | null>(null);
  const opened = useRef(false);
  const close = () => setSource(null);
  const restore = useCallback(
    () =>
      focus((returnKey.current && triggers.current.get(returnKey.current)) || returnFocus.current),
    [returnFocus]
  );
  useEffect(() => {
    if (source) opened.current = true;
    else if (opened.current && Platform.OS !== 'ios') {
      restore();
      opened.current = false;
    }
  }, [source, restore]);
  // Keep the modal mounted when a refresh removes its source; closing returns to the day heading.
  return (
    <View style={{ gap: spacing.small }}>
      {hints.length > 0 && (
        <Text accessible accessibilityRole="header" style={[typography.label, { color: p.muted }]}>
          {copy.continuing}
        </Text>
      )}
      {hints.map((hint) => (
        <View key={`${hint.sourceDayId}:${hint.activityId}`} style={{ gap: spacing.tiny }}>
          <Copy>{continuationSource(locale, hint.sourceDayNumber, hint.title)}</Copy>
          {hint.isEndDay && (
            <Copy>{`${hint.endTime || copy.unknown} · ${['flight', 'transport', 'ground_transport'].includes(hint.type) ? copy.arrival : copy.end}`}</Copy>
          )}
          <Pressable
            ref={(node) => {
              const key = `${hint.sourceDayId}:${hint.activityId}`;
              if (node) triggers.current.set(key, node);
              else triggers.current.delete(key);
            }}
            testID={`continuation-${hint.sourceDayId}-${hint.activityId}`}
            accessibilityRole="button"
            accessibilityLabel={`${copy.viewOriginal} · ${continuationSource(locale, hint.sourceDayNumber, hint.title)}`}
            onPress={() => {
              returnKey.current = `${hint.sourceDayId}:${hint.activityId}`;
              setSource({ dayId: hint.sourceDayId, activityId: hint.activityId });
            }}
            style={{ minHeight: sizing.touch, justifyContent: 'center' }}
          >
            <Text style={[typography.label, { color: p.primary }]}>{copy.viewOriginal} →</Text>
          </Pressable>
        </View>
      ))}
      <Modal
        visible={source !== null}
        animationType="none"
        onRequestClose={close}
        onDismiss={restore}
        onShow={() => focus(heading.current)}
      >
        <SafeAreaView
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={{ flex: 1, backgroundColor: p.background }}
        >
          <ScrollView
            contentContainerStyle={{
              padding: spacing.medium,
              gap: spacing.medium,
              maxWidth: 640,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <Text
              ref={heading}
              accessible
              accessibilityRole="header"
              style={[typography.section, { color: p.text }]}
            >
              {activity?.title ?? copy.originalGone}
            </Text>
            {source &&
              (activity && sourceDay ? (
                <>
                  <Copy>{continuationSource(locale, sourceDay.dayNumber, activity.title)}</Copy>
                  <ActivityDetails activity={activity} day={sourceDay} trip={trip} />
                </>
              ) : (
                <Notice tone="warning">{copy.originalGone}</Notice>
              ))}
            <Action
              testID="continuation-close"
              label={t.closeNavigation}
              variant="secondary"
              onPress={close}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
