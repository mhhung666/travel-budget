import { Pressable, Text, View } from 'react-native';
import { Icon, usePalette } from './ui';
import { radius, sizing, spacing, typography } from '@/theme/tokens';

export type Entry = {
  label: string;
  detail?: string;
  testID: string;
  disabled?: boolean;
  onPress: () => void;
};

/** Secondary destinations share a surface; each row remains one accessible control. */
export function EntryGroup({ entries }: { entries: Entry[] }) {
  const p = usePalette();
  return (
    <View
      style={{
        backgroundColor: p.surface,
        borderColor: p.border,
        borderWidth: sizing.border,
        borderRadius: radius.card,
      }}
    >
      {entries.map((entry, index) => (
        <Pressable
          key={entry.testID}
          testID={entry.testID}
          accessibilityRole="button"
          accessibilityLabel={[entry.label, entry.detail].filter(Boolean).join('. ')}
          accessibilityState={{ disabled: !!entry.disabled }}
          disabled={entry.disabled}
          onPress={() => !entry.disabled && entry.onPress()}
          style={({ pressed }) => ({
            minHeight: sizing.navigationRow,
            paddingVertical: spacing.compact,
            paddingHorizontal: spacing.medium,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.small,
            backgroundColor: pressed && !entry.disabled ? p.selected : undefined,
            borderTopWidth: index ? sizing.border : 0,
            borderColor: p.border,
            borderTopLeftRadius: index === 0 ? radius.card : 0,
            borderTopRightRadius: index === 0 ? radius.card : 0,
            borderBottomLeftRadius: index === entries.length - 1 ? radius.card : 0,
            borderBottomRightRadius: index === entries.length - 1 ? radius.card : 0,
          })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: spacing.tiny }}>
            <Text style={[typography.body, { color: entry.disabled ? p.onDisabled : p.text }]}>
              {entry.label}
            </Text>
            {!!entry.detail && (
              <Text style={[typography.label, { color: p.muted }]}>{entry.detail}</Text>
            )}
          </View>
          <Icon name="chevron-right" color={entry.disabled ? p.onDisabled : p.muted} />
        </Pressable>
      ))}
    </View>
  );
}
