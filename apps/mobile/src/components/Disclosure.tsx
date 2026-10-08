import { useState, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon, usePalette } from './ui';
import { sizing, spacing, typography } from '@/theme/tokens';

/** Optional context only; errors and confirmation warnings stay outside this disclosure. */
export function Disclosure({
  title,
  testID,
  children,
}: PropsWithChildren<{ title: string; testID: string }>) {
  const [expanded, setExpanded] = useState(false);
  const p = usePalette();
  return (
    <View style={{ gap: spacing.small }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={{
          minHeight: sizing.touch,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.small,
          paddingVertical: spacing.small,
        }}
      >
        <Icon name="info" color={p.primary} />
        <Text style={[typography.label, { color: p.primary, flexShrink: 1 }]}>{title}</Text>
      </Pressable>
      {expanded && children}
    </View>
  );
}
