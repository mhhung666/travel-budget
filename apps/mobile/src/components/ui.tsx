import {
  AccessibilityInfo,
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
import {
  Children,
  useEffect,
  useState,
  type PropsWithChildren,
  type Ref,
  type ReactNode,
} from 'react';
import { colors, radius, sizing, spacing, toneColors, typography, type Tone } from '@/theme/tokens';
import { Icon, type IconName } from './icons';
export { Icon, type IconName } from './icons';

type Announcement = 'none' | 'polite' | 'assertive';
function useAnnouncement(message: string, mode: Announcement) {
  useEffect(() => {
    // Live regions handle Android and Web. iOS needs an explicit VoiceOver announcement.
    if (Platform.OS === 'ios' && message && mode !== 'none') {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: mode === 'polite' });
    }
  }, [message, mode]);
}
function noticeText(children: ReactNode) {
  return Children.toArray(children)
    .filter((child) => typeof child === 'string' || typeof child === 'number')
    .join('');
}

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
  variant,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  testID?: string;
}) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  const kind = variant ?? (secondary ? 'secondary' : 'primary');
  const blocked = disabled || busy;
  const foreground = blocked
    ? p.onDisabled
    : kind === 'primary'
      ? p.onPrimary
      : kind === 'danger'
        ? p.onDanger
        : p.primary;
  const contentColor = (pressed: boolean) =>
    kind === 'danger' && pressed && !blocked ? p.danger : foreground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={() => !blocked && onPress()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: blocked
            ? p.disabled
            : kind === 'primary'
              ? pressed
                ? p.primaryPressed
                : p.primary
              : kind === 'danger'
                ? pressed
                  ? p.dangerSurface
                  : p.dangerFill
                : pressed
                  ? p.selected
                  : kind === 'ghost'
                    ? 'transparent'
                    : p.surface,
          borderColor:
            focused && !blocked
              ? p.focus
              : blocked
                ? p.border
                : kind === 'ghost'
                  ? 'transparent'
                  : kind === 'primary'
                    ? p.primary
                    : kind === 'danger'
                      ? p.dangerFill
                      : p.controlBorder,
          borderWidth: focused && !blocked ? 2 : sizing.border,
          paddingVertical: spacing.compact - (focused && !blocked ? 1 : 0),
          paddingHorizontal: spacing.medium - (focused && !blocked ? 1 : 0),
        },
      ]}
    >
      {({ pressed }) => (
        <>
          {busy ? (
            <Icon name="spinner" color={contentColor(pressed)} />
          ) : (
            icon && <Icon name={icon} color={contentColor(pressed)} />
          )}
          <Text
            style={[
              styles.buttonLabel,
              {
                color: contentColor(pressed),
              },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
export function Notice({
  children,
  tone = 'info',
  announce = tone === 'danger' || tone === 'warning' ? 'polite' : 'none',
  announceText,
  role,
  testID,
}: PropsWithChildren<{
  tone?: Tone;
  announce?: Announcement;
  announceText?: string;
  role?: 'status' | 'alert';
  testID?: string;
}>) {
  const p = usePalette();
  const { foreground, background } = toneColors(p, tone);
  useAnnouncement(announceText ?? noticeText(children), announce);
  return (
    <View testID={testID} style={[styles.notice, { backgroundColor: background }]}>
      <Icon
        name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'}
        color={foreground}
      />
      <Text
        role={
          role ??
          (announce === 'none'
            ? undefined
            : tone === 'info' || tone === 'success'
              ? 'status'
              : 'alert')
        }
        accessibilityLiveRegion={announce}
        style={[styles.copy, { color: foreground, flexShrink: 1 }]}
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
      <Text
        testID={testID}
        style={[
          typography.metric,
          { fontWeight: '700', fontVariant: ['tabular-nums'], color: p.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const p = usePalette();
  return (
    <View style={{ gap: spacing.compact, marginTop: spacing.small }}>
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
      accessible={false}
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
    <View style={{ gap: spacing.tiny }}>
      <Text style={[styles.label, { color: p.muted }]}>{label}</Text>
      <Text testID={testID} style={[styles.value, { color: p.text }]}>
        {value}
      </Text>
    </View>
  );
}
export function Badge({
  label,
  tone = 'info',
  testID,
}: {
  label: string;
  tone?: Tone;
  testID?: string;
}) {
  const p = usePalette();
  const { foreground, background } = toneColors(p, tone);
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeLabel, { color: foreground }]}>{label}</Text>
    </View>
  );
}
/** Labelled single input; the error, when there is one, is announced right under it. */
export function TextField({
  label,
  error,
  inputRef,
  description,
  kind = 'text',
  style,
  onFocus,
  onBlur,
  ...input
}: TextInputProps & {
  label: string;
  error?: string;
  description?: string;
  kind?: 'text' | 'amount';
  inputRef?: Ref<TextInput>;
}) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  useAnnouncement(error ?? '', 'polite');
  return (
    <View style={{ gap: spacing.small }}>
      <Text style={[styles.label, { color: p.text }]}>{label}</Text>
      <TextInput
        ref={inputRef}
        {...input}
        accessibilityLabel={input.accessibilityLabel ?? label}
        accessibilityHint={
          [input.accessibilityHint, description, error].filter(Boolean).join('. ') || undefined
        }
        placeholderTextColor={input.placeholderTextColor ?? p.muted}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          kind === 'amount' && styles.amountInput,
          input.multiline && { textAlignVertical: 'top' },
          style,
          {
            color: input.editable === false ? p.onDisabled : p.text,
            backgroundColor: input.editable === false ? p.disabled : p.surface,
            borderColor: error ? p.danger : focused ? p.focus : p.controlBorder,
            borderWidth: focused ? 2 : sizing.border,
            padding: spacing.compact - (focused ? 1 : 0),
          },
        ]}
      />
      {!!description && <Text style={[styles.label, { color: p.muted }]}>{description}</Text>}
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
const chipHitSlop: Insets = {
  top: spacing.tiny,
  bottom: spacing.tiny,
  left: spacing.tiny,
  right: spacing.tiny,
};
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
  const [focused, setFocused] = useState(false);
  const foreground = disabled ? p.onDisabled : selected ? p.primary : p.text;
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
      onPress={() => !disabled && onPress()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: disabled ? p.disabled : selected || pressed ? p.selected : p.surface,
          borderColor:
            focused && !disabled
              ? p.focus
              : disabled
                ? p.border
                : selected
                  ? p.primary
                  : p.controlBorder,
          borderWidth: focused && !disabled ? 2 : sizing.border,
          paddingVertical: spacing.compact - (focused && !disabled ? 1 : 0),
          paddingHorizontal: spacing.medium - (focused && !disabled ? 1 : 0),
        },
      ]}
    >
      {selected && <Icon name="check" color={foreground} />}
      <Text style={[styles.chipLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: spacing.medium,
    gap: spacing.medium,
  },
  title: { ...typography.page, fontWeight: '700' },
  copy: typography.body,
  button: {
    minHeight: sizing.touch,
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.medium,
    borderRadius: radius.control,
    borderWidth: sizing.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
  },
  buttonLabel: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  notice: {
    borderRadius: radius.control,
    padding: spacing.medium,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
  },
  metric: {
    borderRadius: radius.card,
    padding: spacing.medium,
    gap: spacing.small,
    borderWidth: sizing.border,
  },
  section: { ...typography.section, fontWeight: '700' },
  card: {
    borderRadius: radius.card,
    padding: spacing.medium,
    gap: spacing.compact,
    borderWidth: sizing.border,
  },
  label: typography.label,
  value: { ...typography.body, fontWeight: '600' },
  input: {
    borderWidth: sizing.border,
    borderRadius: radius.control,
    minHeight: sizing.input,
    padding: spacing.compact,
    ...typography.body,
    // Android sizes the field from the default font but lays the text out with the app language's
    // fonts; with CJK ones the line can be taller than the box, so React Native treats the field as
    // scrollable and a drag that starts on it no longer scrolls the page. A fixed line height keeps
    // both in agreement.
    ...Platform.select({ android: { lineHeight: 24 } }),
  },
  amountInput: { ...typography.amount, minHeight: sizing.amount, fontVariant: ['tabular-nums'] },
  chip: {
    minHeight: sizing.touch,
    // Keep multiline labels inside the background at accessibility text sizes.
    borderRadius: radius.control,
    borderWidth: sizing.border,
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chipLabel: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  badge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.badge,
    paddingVertical: spacing.tiny,
    paddingHorizontal: spacing.compact,
  },
  badgeLabel: { ...typography.meta, fontWeight: '600', flexShrink: 1 },
});
