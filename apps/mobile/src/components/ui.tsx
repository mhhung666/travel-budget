import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PropsWithChildren } from 'react';
import { colors } from '@/theme/tokens';

export const usePalette = () => colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
export function Page({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const palette = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, style]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Title({ children }: PropsWithChildren) {
  const p = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
      {children}
    </Text>
  );
}
export function Copy({ children }: PropsWithChildren) {
  const p = usePalette();
  return <Text style={[styles.copy, { color: p.muted }]}>{children}</Text>;
}
export function Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? p.surface : p.primary,
          borderColor: p.border,
          opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {busy && <ActivityIndicator color={secondary ? p.primary : p.onPrimary} />}
      <Text style={[styles.buttonLabel, { color: secondary ? p.primary : p.onPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Notice({ children }: PropsWithChildren) {
  const p = usePalette();
  return (
    <View style={[styles.notice, { backgroundColor: p.notice }]}>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.copy, { color: p.text }]}
      >
        {children}
      </Text>
    </View>
  );
}
export function Metric({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={[styles.metric, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Copy>{label}</Copy>
      <Text style={{ fontSize: 24, fontWeight: '700', color: p.text }}>{value}</Text>
    </View>
  );
}
export const styles = StyleSheet.create({
  page: { flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, gap: 16 },
  title: { fontSize: 32, fontWeight: '700' },
  copy: { fontSize: 16, lineHeight: 25 },
  button: {
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonLabel: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  notice: { borderRadius: 14, padding: 16 },
  metric: { borderRadius: 18, padding: 18, gap: 8, borderWidth: 1 },
});
