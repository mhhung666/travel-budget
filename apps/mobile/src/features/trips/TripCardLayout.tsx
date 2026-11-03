import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Text, View, useWindowDimensions } from 'react-native';
import { usePalette } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { cardShadows, spacing, typography, type Palette } from '@/theme/tokens';
import { cardSummaryColumns } from './tripCardFormat';

export const tripCardRadius = 14;
export const tripCardFrameStyle = (p: Palette) => ({
  marginBottom: spacing.medium,
  borderWidth: 1,
  borderColor: p.border,
  borderRadius: tripCardRadius,
  backgroundColor: p.surface,
  shadowColor: p.scrim,
  ...cardShadows.resting,
});

/** Same real/loading slots; menu space is reserved only on the title row. */
export function TripCardLayout({
  title,
  more,
  status,
  dates,
  members,
  summary,
  open,
  shortcut,
}: {
  title: ReactNode;
  more?: ReactNode;
  status: ReactNode;
  dates: ReactNode;
  members: ReactNode;
  summary: ReactNode;
  open: ReactNode;
  shortcut?: ReactNode;
}) {
  const p = usePalette();
  return (
    <View pointerEvents="box-none">
      <View pointerEvents="box-none" style={{ padding: spacing.medium, gap: spacing.compact }}>
        <View
          pointerEvents="box-none"
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.small,
            minHeight: 48,
          }}
        >
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flex: 1, minWidth: 0, paddingTop: spacing.small }}
          >
            {title}
          </View>
          {more}
        </View>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ gap: spacing.tiny }}
        >
          {status}
          {dates}
          {members}
        </View>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {summary}
        </View>
      </View>
      <View
        pointerEvents="box-none"
        style={{
          borderTopWidth: 1,
          borderColor: p.border,
          padding: spacing.medium,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.small,
        }}
      >
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ minHeight: 48, flexShrink: 1, justifyContent: 'center' }}
        >
          {open}
        </View>
        {shortcut && (
          <View pointerEvents="box-none" style={{ maxWidth: '100%' }}>
            {shortcut}
          </View>
        )}
      </View>
    </View>
  );
}

export function TripCardSummary({
  left,
  right,
  digits = 9,
}: {
  left: ReactNode;
  right: ReactNode;
  digits?: number;
}) {
  const p = usePalette();
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const columns = cardSummaryColumns(width, fontScale, digits);
  return (
    <View
      testID="trip-card-summary"
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      style={{ flexDirection: columns ? 'row' : 'column', gap: spacing.compact }}
    >
      <View style={{ flex: columns ? 1 : undefined, minWidth: 0, gap: spacing.tiny }}>{left}</View>
      <View
        style={{
          flex: columns ? 1 : undefined,
          minWidth: 0,
          gap: spacing.tiny,
          ...(columns
            ? { borderLeftWidth: 1, borderColor: p.border, paddingLeft: spacing.compact }
            : {}),
        }}
      >
        {right}
      </View>
    </View>
  );
}

function Placeholder({
  width = '60%',
  height = 20,
}: {
  width?: `${number}%` | number;
  height?: number;
}) {
  const p = usePalette();
  const { fontScale } = useWindowDimensions();
  return (
    <View
      style={{
        width,
        maxWidth: '100%',
        height: height * fontScale,
        borderRadius: 4,
        backgroundColor: p.disabled,
      }}
    />
  );
}
export function TripCardSkeleton({ archived = false }: { archived?: boolean }) {
  const p = usePalette();
  return (
    <View
      testID="trip-card-skeleton"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        ...tripCardFrameStyle(p),
      }}
    >
      <TripCardLayout
        title={<Placeholder width="75%" height={28} />}
        more={
          <View style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}>
            <Placeholder width={20} />
          </View>
        }
        status={<Placeholder width={90} />}
        dates={<Placeholder width={160} />}
        members={<Placeholder width={120} />}
        summary={
          <TripCardSummary
            left={
              <>
                <Placeholder width={80} />
                <Placeholder width={112} height={28} />
              </>
            }
            right={
              <>
                <Placeholder width={70} />
                <Placeholder width={96} height={24} />
              </>
            }
          />
        }
        open={<Placeholder width={96} />}
        shortcut={!archived && <Placeholder width={96} height={48} />}
      />
    </View>
  );
}
export function TripCardsLoading({
  archived = false,
  count = 3,
}: {
  archived?: boolean;
  count?: number;
}) {
  const t = useMessages();
  const p = usePalette();
  useEffect(() => {
    // Android/Web use the live region below; iOS needs an explicit announcement.
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(t.tripCardsLoading, { queue: true });
    }
  }, [t.tripCardsLoading]);
  return (
    <View testID="trip-cards-loading">
      <Text
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        style={[typography.label, { color: p.muted, marginBottom: spacing.medium }]}
      >
        {t.tripCardsLoading}
      </Text>
      {Array.from({ length: count }, (_, index) => (
        <TripCardSkeleton key={index} archived={archived} />
      ))}
    </View>
  );
}
