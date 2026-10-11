import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Action, Copy, Notice } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { usePalette } from '@/theme/usePalette';
import { spacing, typography } from '@/theme/tokens';
import { ApiError } from '@/api/client';
import {
  avatarFileUri,
  cropAvatar,
  removeAvatarFile,
  type AvatarSource,
  type SelectedAvatar,
} from './avatarFiles';
import { centerCrop, cropGeometry, cropRectangle, moveCrop, type CropPosition } from './avatarCrop';

function fingers(event: GestureResponderEvent) {
  const touches = event.nativeEvent.touches.slice(0, 2);
  if (!touches.length) return null;
  return {
    count: touches.length,
    x: touches.reduce((sum, touch) => sum + touch.locationX, 0) / touches.length,
    y: touches.reduce((sum, touch) => sum + touch.locationY, 0) / touches.length,
    distance:
      touches.length === 2
        ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY)
        : 0,
  };
}

export function AvatarCropper({
  source,
  onCancel,
  onComplete,
}: {
  source: AvatarSource;
  onCancel: () => void;
  onComplete: (file: SelectedAvatar) => Promise<void>;
}) {
  const t = useMessages(),
    p = usePalette();
  const [position, setPosition] = useState(() => centerCrop(source)),
    [side, setSide] = useState(0),
    [pan, setPan] = useState<ReturnType<typeof PanResponder.create>>(),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [error, setError] = useState<unknown>();
  const current = useRef(position),
    saving = useRef(false),
    mounted = useRef(false),
    heading = useRef<Text>(null),
    gesture = useRef<ReturnType<typeof fingers>>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const update = (next: CropPosition) => {
    current.current = next;
    setPosition(next);
  };
  const configureViewport = (nextSide: number) => {
    setSide(nextSide);
    gesture.current = null;
    setPan(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !saving.current && nextSide > 0,
        onMoveShouldSetPanResponder: () => !saving.current && nextSide > 0,
        onPanResponderGrant: (event) => {
          gesture.current = fingers(event);
        },
        onPanResponderStart: (event) => {
          gesture.current = fingers(event);
        },
        onPanResponderEnd: (event) => {
          gesture.current = fingers(event);
        },
        onPanResponderMove: (event) => {
          if (saving.current || nextSide <= 0) return;
          const next = fingers(event),
            previous = gesture.current;
          if (previous && next && previous.count === next.count) {
            update(
              moveCrop(
                source,
                current.current,
                nextSide,
                previous,
                next,
                previous.distance > 0 && next.distance > 0 ? next.distance / previous.distance : 1
              )
            );
          }
          gesture.current = next;
        },
        onPanResponderRelease: () => {
          gesture.current = null;
        },
        onPanResponderTerminate: () => {
          gesture.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      })
    );
  };
  const adjust = (name: string) => {
    if (saving.current || side <= 0) return;
    gesture.current = null;
    if (name === 'reset') {
      update(centerCrop(source));
      return;
    }
    const center = { x: side / 2, y: side / 2 },
      step = side / 10;
    update(
      moveCrop(
        source,
        current.current,
        side,
        center,
        {
          x: center.x + (name === 'left' ? -step : name === 'right' ? step : 0),
          y: center.y + (name === 'up' ? -step : name === 'down' ? step : 0),
        },
        name === 'increment' ? 1.2 : name === 'decrement' ? 1 / 1.2 : 1
      )
    );
  };
  const cancel = () => {
    if (!saving.current) onCancel();
  };
  const complete = async () => {
    if (saving.current || side <= 0 || failed || !ready) return;
    saving.current = true;
    setBusy(true);
    setError(undefined);
    let file: SelectedAvatar | undefined;
    try {
      file = await cropAvatar(source, cropRectangle(source, current.current));
      if (!mounted.current) {
        await removeAvatarFile(file.file);
        return;
      }
      await onComplete(file);
      file = undefined; // Parent owns the selected bytes only after completion.
    } catch (e) {
      if (file) await removeAvatarFile(file.file).catch(() => {});
      if (mounted.current) setError(e);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const geometry = cropGeometry(source, position, side);
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="none"
      onRequestClose={cancel}
      onShow={() => {
        if (heading.current && Platform.OS !== 'web')
          AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
      }}
    >
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top', 'bottom', 'left', 'right']}
          accessibilityViewIsModal
          onAccessibilityEscape={cancel}
          style={{
            flex: 1,
            backgroundColor: p.background,
            padding: spacing.medium,
            gap: spacing.medium,
          }}
        >
          <ScrollView style={{ flexGrow: 0, maxHeight: '25%' }}>
            <Text
              ref={heading}
              accessible
              accessibilityRole="header"
              style={[typography.page, { color: p.text, fontWeight: '700' }]}
            >
              {t.avatarCropTitle}
            </Text>
            <Copy>{t.avatarCropInstructions}</Copy>
          </ScrollView>
          <View
            style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' }}
            onLayout={({ nativeEvent }) =>
              configureViewport(
                Math.max(0, Math.min(nativeEvent.layout.width, nativeEvent.layout.height, 560))
              )
            }
          >
            <View
              testID="avatar-crop-frame"
              {...pan?.panHandlers}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={t.avatarCropTitle}
              accessibilityHint={t.avatarCropHint}
              accessibilityState={{ disabled: busy }}
              accessibilityValue={{
                min: 100,
                max: 400,
                now: Math.round(position.zoom * 100),
                text: `${Math.round(position.zoom * 100)}%`,
              }}
              accessibilityActions={[
                { name: 'increment', label: t.avatarZoomIn },
                { name: 'decrement', label: t.avatarZoomOut },
                { name: 'left', label: t.avatarMoveLeft },
                { name: 'right', label: t.avatarMoveRight },
                { name: 'up', label: t.avatarMoveUp },
                { name: 'down', label: t.avatarMoveDown },
                { name: 'reset', label: t.avatarCropReset },
              ]}
              onAccessibilityAction={({ nativeEvent }) => adjust(nativeEvent.actionName)}
              style={{ width: side, height: side, overflow: 'hidden', backgroundColor: p.surface }}
            >
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  left: geometry.left,
                  top: geometry.top,
                  width: geometry.width,
                  height: geometry.height,
                }}
              >
                <Image
                  source={{ uri: avatarFileUri(source.file) }}
                  accessible={false}
                  onLoad={() => setReady(true)}
                  onError={() => setFailed(true)}
                  style={{ width: '100%', height: '100%' }}
                />
              </View>
              <View
                pointerEvents="none"
                accessible={false}
                style={{
                  position: 'absolute',
                  left: -side,
                  top: -side,
                  width: side * 3,
                  height: side * 3,
                  borderRadius: side * 1.5,
                  borderWidth: side,
                  borderColor: p.scrim,
                  opacity: 0.55,
                }}
              />
              <View
                pointerEvents="none"
                accessible={false}
                style={{
                  position: 'absolute',
                  width: side,
                  height: side,
                  borderRadius: side / 2,
                  borderWidth: 2,
                  borderColor: p.onPrimary,
                }}
              />
            </View>
          </View>
          <ScrollView
            style={{ flexGrow: 0, maxHeight: '45%' }}
            contentContainerStyle={{ gap: spacing.small }}
          >
            {failed && <Notice tone="danger">{t.avatarLoadFailed}</Notice>}
            {!ready && !failed && <Notice>{t.loading}</Notice>}
            {!!error && (
              <Notice tone="danger">
                {error instanceof ApiError && error.code === 'AVATAR_FILE_SIZE'
                  ? t.avatarFileSize
                  : t.avatarCropFailed}
              </Notice>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
              {[
                ['decrement', t.avatarZoomOut],
                ['increment', t.avatarZoomIn],
                ['reset', t.avatarCropReset],
              ].map(([name, label]) => (
                <View key={name} style={{ flexGrow: 1, flexBasis: 100 }}>
                  <Action
                    testID={`avatar-crop-${name}`}
                    label={label}
                    variant="secondary"
                    disabled={busy || side <= 0}
                    onPress={() => adjust(name)}
                  />
                </View>
              ))}
            </View>
            <Action
              testID="avatar-crop-done"
              label={t.done}
              busy={busy}
              disabled={side <= 0 || failed || !ready}
              onPress={() => void complete()}
            />
            <Action
              testID="avatar-crop-cancel"
              label={t.cancel}
              variant="secondary"
              disabled={busy}
              onPress={cancel}
            />
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
