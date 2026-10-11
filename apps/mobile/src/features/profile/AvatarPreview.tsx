import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Action, Notice } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { usePalette } from '@/theme/usePalette';
import { spacing } from '@/theme/tokens';
import { AvatarImage } from './AccountAvatar';

/** Local display only: opening a preview never confirms or uploads a selected photo. */
export function AvatarPreview({ url }: { url: string | null }) {
  const t = useMessages(),
    p = usePalette();
  const [open, setOpen] = useState(false),
    [failed, setFailed] = useState(false);
  const trigger = useRef<View>(null),
    image = useRef<Image>(null),
    opened = useRef(false);
  const restoreFocus = () => {
    if (!trigger.current) return;
    if (Platform.OS === 'web') trigger.current.focus();
    else AccessibilityInfo.sendAccessibilityEvent(trigger.current, 'focus');
  };
  useEffect(() => {
    if (open) opened.current = true;
    else if (opened.current && Platform.OS !== 'ios') {
      restoreFocus();
      opened.current = false;
    }
  }, [open]);
  const close = () => setOpen(false);
  return (
    <View style={{ alignItems: 'center', gap: spacing.small }}>
      <Pressable
        ref={trigger}
        testID="avatar-preview-open"
        accessibilityRole="button"
        accessibilityLabel={url ? t.avatarView : t.avatarEmpty}
        accessibilityState={{ disabled: !url, expanded: open }}
        disabled={!url}
        onPress={() => {
          setFailed(false);
          setOpen(true);
        }}
        style={{ maxWidth: '100%' }}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AvatarImage url={url} size={160} />
        </View>
      </Pressable>
      <Modal
        visible={open && !!url}
        presentationStyle="fullScreen"
        animationType="fade"
        onRequestClose={close}
        onDismiss={restoreFocus}
        onShow={() => {
          if (image.current && Platform.OS !== 'web')
            AccessibilityInfo.sendAccessibilityEvent(image.current, 'focus');
        }}
      >
        <SafeAreaProvider>
          <SafeAreaView
            edges={['top', 'bottom', 'left', 'right']}
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            style={{
              flex: 1,
              backgroundColor: p.background,
              padding: spacing.medium,
              gap: spacing.medium,
            }}
          >
            <View style={{ flex: 1, minHeight: 0, justifyContent: 'center' }}>
              {open && url && !failed && (
                <Image
                  ref={image}
                  testID="avatar-preview-image"
                  accessible
                  accessibilityLabel={t.avatarTitle}
                  source={{ uri: url }}
                  resizeMode="contain"
                  style={{ width: '100%', height: '100%' }}
                  onError={() => setFailed(true)}
                />
              )}
              {failed && <Notice tone="danger">{t.avatarLoadFailed}</Notice>}
            </View>
            <Action testID="avatar-preview-close" label={t.avatarClosePreview} onPress={close} />
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
