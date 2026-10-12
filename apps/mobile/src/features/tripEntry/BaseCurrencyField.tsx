import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Action, Copy, Icon, TextField } from '@/components/ui';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { currencyMessages } from '@/i18n/currencyMessages';
import { usePalette } from '@/theme/usePalette';
import { radius, sizing, spacing, typography } from '@/theme/tokens';
import {
  currencyName,
  currencyOptions,
  normalizeCurrencySearch,
  searchCurrencies,
} from './currencySelection';

/** Controlled selection only. Searching, closing and keyboard Search never confirm a value. */
export function BaseCurrencyField({
  value,
  codes,
  disabled,
  open,
  onOpenChange,
  onChange,
}: {
  value: string;
  codes: readonly string[];
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (code: string) => void;
}) {
  const locale = useAppLocale(),
    t = useMessages(),
    p = usePalette();
  const copy = currencyMessages[locale];
  const { width, fontScale } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const trigger = useRef<View>(null),
    heading = useRef<Text>(null),
    list = useRef<ScrollView>(null);
  const selectedY = useRef(0),
    wasOpen = useRef(false);
  const options = useMemo(() => currencyOptions(codes, locale), [codes, locale]);
  const results = searchCurrencies(options, search);
  const searching = !!normalizeCurrencySearch(search);
  const selectable = codes.length > 0 && !(codes.length === 1 && codes[0] === value);
  const visible = open && !disabled && selectable;
  const wide = width >= 768 && fontScale < 1.5;
  const label = `${value} · ${currencyName(value, locale)}`;
  const restoreFocus = () => {
    if (!trigger.current) return;
    if (Platform.OS === 'web') trigger.current.focus();
    else AccessibilityInfo.sendAccessibilityEvent(trigger.current, 'focus');
  };
  const close = () => {
    Keyboard.dismiss();
    onOpenChange(false);
  };
  useEffect(() => {
    if (visible) wasOpen.current = true;
    else if (wasOpen.current) {
      if (Platform.OS !== 'ios') restoreFocus();
      wasOpen.current = false;
      if (open) onOpenChange(false);
    }
  }, [visible, open, onOpenChange]);
  const changeSearch = (text: string) => {
    setSearch(text);
    list.current?.scrollTo({ y: 0, animated: false });
  };
  return (
    <View style={{ gap: spacing.small }}>
      <Copy>{t.ledgerName}</Copy>
      <Pressable
        ref={trigger}
        testID="trip-base-currency"
        accessible
        accessibilityRole={selectable ? 'button' : 'text'}
        accessibilityLabel={`${t.ledgerName}: ${label}`}
        accessibilityState={{ disabled: disabled || !selectable, expanded: visible }}
        disabled={disabled || !selectable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={() => {
          if (disabled || !selectable) return;
          Keyboard.dismiss();
          selectedY.current = 0;
          setSearch('');
          onOpenChange(true);
        }}
        style={({ pressed }) => ({
          minHeight: sizing.input,
          padding: spacing.compact,
          borderRadius: radius.control,
          borderWidth: focused ? 2 : sizing.border,
          borderColor: focused ? p.focus : p.controlBorder,
          backgroundColor: pressed && !disabled ? p.selected : p.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.small,
        })}
      >
        <Text style={[typography.body, { color: p.text, flex: 1 }]}>{label}</Text>
        {selectable && <Icon name="chevron-right" color={p.muted} />}
      </Pressable>
      <Copy>{t.ledgerFixed}</Copy>
      <Modal
        visible={visible}
        presentationStyle="fullScreen"
        animationType="fade"
        onRequestClose={close}
        onDismiss={restoreFocus}
        onShow={() => {
          if (heading.current && Platform.OS !== 'web')
            AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
          list.current?.scrollTo({ y: selectedY.current, animated: false });
        }}
      >
        <SafeAreaProvider>
          <SafeAreaView
            edges={['top', 'bottom', 'left', 'right']}
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            style={{ flex: 1, backgroundColor: p.background }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: wide ? spacing.large : 0,
              }}
            >
              <View
                testID="currency-panel"
                style={{
                  width: '100%',
                  maxWidth: wide ? 600 : undefined,
                  flex: 1,
                  maxHeight: wide ? '90%' : undefined,
                  backgroundColor: p.surface,
                  borderRadius: wide ? radius.card : 0,
                }}
              >
                <View style={{ padding: spacing.medium, gap: spacing.small }}>
                  <View
                    style={{
                      flexDirection: fontScale >= 1.5 ? 'column' : 'row',
                      alignItems: 'center',
                      gap: spacing.small,
                    }}
                  >
                    <Text
                      ref={heading}
                      accessible
                      accessibilityRole="header"
                      style={[
                        typography.section,
                        { flexShrink: 1, color: p.text, fontWeight: '700' },
                      ]}
                    >
                      {copy.title}
                    </Text>
                    <Action
                      testID="currency-cancel"
                      label={t.cancel}
                      variant="ghost"
                      onPress={close}
                    />
                  </View>
                  <TextField
                    testID="currency-search"
                    label={copy.search}
                    value={search}
                    onChangeText={changeSearch}
                    autoFocus={false}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {!!search && (
                    <Action
                      testID="currency-clear"
                      variant="ghost"
                      label={copy.clear}
                      onPress={() => changeSearch('')}
                    />
                  )}
                </View>
                <ScrollView
                  ref={list}
                  testID="currency-results"
                  style={{ flex: 1, minHeight: 0 }}
                  contentContainerStyle={{
                    paddingHorizontal: spacing.medium,
                    paddingBottom: spacing.medium,
                  }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  onContentSizeChange={() => {
                    if (!searching)
                      list.current?.scrollTo({ y: selectedY.current, animated: false });
                  }}
                >
                  {!results.length && (
                    <View style={{ gap: spacing.small }}>
                      <Copy>{copy.noMatch}</Copy>
                      <Copy>{copy.hint}</Copy>
                    </View>
                  )}
                  {results.map((option, index) => (
                    <Fragment key={option.code}>
                      {!searching &&
                        (index === 0 || results[index - 1].common !== option.common) && (
                          <Text
                            accessibilityRole="header"
                            style={[
                              typography.label,
                              { paddingVertical: spacing.small, color: p.muted },
                            ]}
                          >
                            {option.common ? copy.common : copy.other}
                          </Text>
                        )}
                      <Pressable
                        testID={`currency-option-${option.code}`}
                        accessibilityRole="radio"
                        accessibilityLabel={`${option.code} · ${option.label}`}
                        accessibilityState={{ selected: value === option.code }}
                        onLayout={({ nativeEvent }) => {
                          if (!searching && option.code === value) {
                            selectedY.current = nativeEvent.layout.y;
                            if (visible)
                              list.current?.scrollTo({ y: selectedY.current, animated: false });
                          }
                        }}
                        onPress={() => {
                          if (!visible || !codes.includes(option.code)) return;
                          onChange(option.code);
                          close();
                        }}
                        style={({ pressed }) => ({
                          minHeight: sizing.touch,
                          padding: spacing.compact,
                          borderRadius: radius.control,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: spacing.small,
                          backgroundColor:
                            pressed || value === option.code ? p.selected : p.surface,
                        })}
                      >
                        <View style={{ flex: 1, gap: spacing.tiny }}>
                          <Text style={[typography.body, { color: p.text, fontWeight: '600' }]}>
                            {option.code}
                          </Text>
                          <Text style={[typography.body, { color: p.muted }]}>{option.label}</Text>
                        </View>
                        {value === option.code && <Icon name="check" color={p.primary} />}
                      </Pressable>
                    </Fragment>
                  ))}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
