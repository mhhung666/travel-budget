import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type Insets,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PropsWithChildren, Ref } from 'react';
import { colors } from '@/theme/tokens';

export const usePalette = () => colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
export function Page({
  children,
  style,
  form = false,
}: PropsWithChildren<{ style?: ViewStyle; form?: boolean }>) {
  const palette = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        // A numeric keyboard has no return key on iOS; dragging the page down puts it away.
        keyboardDismissMode={form ? 'on-drag' : 'none'}
        contentContainerStyle={[styles.page, style]}
      >
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
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
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
export function Metric({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <View style={[styles.metric, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Copy>{label}</Copy>
      <Text testID={testID} style={{ fontSize: 24, fontWeight: '700', color: p.text }}>
        {value}
      </Text>
    </View>
  );
}
export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const p = usePalette();
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <Text accessibilityRole="header" style={[styles.section, { color: p.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}
export function Card({
  children,
  style,
  testID,
}: PropsWithChildren<{ style?: ViewStyle; testID?: string }>) {
  const p = usePalette();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}
    >
      {children}
    </View>
  );
}
/** Label above value, so long values and large text wrap instead of colliding. */
export function DetailRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[styles.label, { color: p.muted }]}>{label}</Text>
      <Text testID={testID} style={[styles.value, { color: p.text }]}>
        {value}
      </Text>
    </View>
  );
}
export function Badge({ label }: { label: string }) {
  const p = usePalette();
  return (
    <View style={[styles.badge, { backgroundColor: p.notice }]}>
      <Text style={[styles.badgeLabel, { color: p.text }]}>{label}</Text>
    </View>
  );
}
/** Labelled single input; the error, when there is one, is announced right under it. */
export function TextField({
  label,
  error,
  inputRef,
  ...input
}: TextInputProps & { label: string; error?: string; inputRef?: Ref<TextInput> }) {
  const p = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: p.text }]}>{label}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={p.muted}
        {...input}
        style={[
          styles.input,
          { color: p.text, borderColor: error ? p.danger : p.border, backgroundColor: p.surface },
        ]}
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.copy, { color: p.danger }]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
const chipHitSlop: Insets = { top: 4, bottom: 4, left: 4, right: 4 };
/** A selectable option: `radio` for one of many, `checkbox` for many, `button` for a plain action. */
export function Chip({
  label,
  onPress,
  selected = false,
  role = 'radio',
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  role?: 'radio' | 'checkbox' | 'button';
  disabled?: boolean;
  testID?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={
        role === 'checkbox'
          ? { checked: selected, disabled }
          : role === 'radio'
            ? { checked: selected, selected, disabled }
            : { disabled }
      }
      disabled={disabled}
      hitSlop={chipHitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? p.primary : p.surface,
          borderColor: selected ? p.primary : p.border,
          opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? p.onPrimary : p.text }]}>{label}</Text>
    </Pressable>
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
  section: { fontSize: 22, fontWeight: '700' },
  card: { borderRadius: 18, padding: 18, gap: 14, borderWidth: 1 },
  label: { fontSize: 14, lineHeight: 20 },
  value: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    padding: 14,
    fontSize: 18,
    // Android sizes the field from the default font but lays the text out with the app language's
    // fonts; with CJK ones the line can be taller than the box, so React Native treats the field as
    // scrollable and a drag that starts on it no longer scrolls the page. A fixed line height keeps
    // both in agreement.
    ...Platform.select({ android: { lineHeight: 24 } }),
  },
  chip: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chipLabel: { fontSize: 16, lineHeight: 22, fontWeight: '600', flexShrink: 1 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeLabel: { fontSize: 13, fontWeight: '600' },
});
