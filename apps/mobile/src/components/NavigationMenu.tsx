import { useEffect, useRef, useState } from 'react';
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
import { usePalette } from '@/theme/usePalette';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import { Icon, type IconName } from './icons';

export type NavigationChoice = {
  label: string;
  selected?: boolean;
  icon?: IconName;
  testID: string;
  onPress: () => void;
};
function focusControl(control: View | null) {
  if (!control) return;
  if (Platform.OS === 'web') control.focus();
  else AccessibilityInfo.sendAccessibilityEvent(control, 'focus');
}
/** A scrollable native menu; neither labels nor touch targets have a fixed text height. */
export function NavigationMenu({
  label,
  title,
  closeLabel,
  choices,
  testID,
  context,
  iconOnly = false,
}: {
  label: string;
  title: string;
  closeLabel: string;
  choices: NavigationChoice[];
  testID: string;
  context?: string;
  iconOnly?: boolean;
}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const heading = useRef<Text>(null);
  const opened = useRef(false);
  const selection = useRef<(() => void) | null>(null);
  const dismissed = () => {
    focusControl(trigger.current);
    const action = selection.current;
    selection.current = null;
    action?.();
  };
  const close = () => setOpen(false);
  useEffect(() => {
    if (open) opened.current = true;
    // onDismiss is iOS-only. Restore after React commits the closed modal on other platforms.
    else if (opened.current && Platform.OS !== 'ios') {
      focusControl(trigger.current);
      const action = selection.current;
      selection.current = null;
      action?.();
      opened.current = false;
    }
  }, [open]);
  return (
    <>
      <Pressable
        ref={trigger}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: sizing.touch,
          minWidth: sizing.touch,
          justifyContent: iconOnly ? 'center' : undefined,
          borderWidth: sizing.border,
          borderColor: p.border,
          borderRadius: radius.control,
          padding: spacing.compact,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.small,
          backgroundColor: pressed ? p.selected : p.surface,
        })}
      >
        <Icon name="menu" color={p.primary} />
        {!iconOnly && (
          <Text style={[typography.body, { color: p.text, flexShrink: 1, fontWeight: '600' }]}>
            {label}
          </Text>
        )}
      </Pressable>
      <Modal
        visible={open}
        animationType="none"
        onRequestClose={close}
        onDismiss={dismissed}
        onShow={() => {
          if (heading.current && Platform.OS !== 'web')
            AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
        }}
      >
        <SafeAreaView
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={{ flex: 1, backgroundColor: p.background }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing.medium, gap: spacing.compact }}>
            <Text
              ref={heading}
              accessible
              accessibilityRole="header"
              style={[typography.section, { color: p.text }]}
            >
              {title}
            </Text>
            {!!context && <Text style={[typography.body, { color: p.muted }]}>{context}</Text>}
            <View
              style={{
                borderWidth: sizing.border,
                borderColor: p.border,
                borderRadius: radius.card,
                overflow: 'hidden',
              }}
            >
              {choices.map((choice, index) => (
                <Pressable
                  key={choice.testID}
                  testID={choice.testID}
                  accessibilityRole="button"
                  accessibilityLabel={choice.label}
                  accessibilityState={{ selected: !!choice.selected }}
                  onPress={() => {
                    // Dismiss before switching tabs: the old trigger must still be visible when
                    // focus is restored, and the next screen must not sit beneath this modal.
                    selection.current = choice.onPress;
                    close();
                  }}
                  style={({ pressed }) => ({
                    minHeight: sizing.navigationRow,
                    padding: spacing.compact,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.small,
                    borderTopWidth: index ? sizing.border : 0,
                    borderTopColor: p.border,
                    backgroundColor: pressed || choice.selected ? p.selected : p.surface,
                  })}
                >
                  {!!choice.icon && <Icon name={choice.icon} color={p.primary} />}
                  <Text
                    style={[
                      typography.body,
                      { color: p.text, flex: 1, fontWeight: choice.selected ? '700' : '500' },
                    ]}
                  >
                    {choice.label}
                  </Text>
                  {choice.selected && <Icon name="check" color={p.primary} />}
                </Pressable>
              ))}
            </View>
            <Pressable
              testID={`${testID}-close`}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={close}
              style={({ pressed }) => ({
                minHeight: sizing.touch,
                padding: spacing.compact,
                borderRadius: radius.control,
                backgroundColor: pressed ? p.selected : p.surface,
              })}
            >
              <Text style={[typography.body, { color: p.primary }]}>{closeLabel}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
