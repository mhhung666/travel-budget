import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Pressable, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOnline } from '@/providers/useOnline';
import { errorMessage } from '@/features/auth/errorMessage';
import { ApiError } from '@/api/client';
import { useMessages } from '@/i18n/useMessages';
import { FormPage } from '@/components/screen';
import { Action, Card, Copy, Icon, Notice } from '@/components/ui';
import { usePalette } from '@/theme/usePalette';
import { sizing } from '@/theme/tokens';
import { goBack } from '@/components/navigation';
import { openAvatarWriteStore } from '@/storage/avatarWriteDatabase';
import { AvatarWriter } from './AvatarWriter';
import { AvatarPreview } from './AvatarPreview';
import { AvatarCropper } from './AvatarCropper';
import { useAccountAvatar } from './useAccountAvatar';
import {
  pickAvatar,
  removeAvatarFile,
  uploadAvatarFile,
  avatarFileUri,
  cleanupAvatarFiles,
  type SelectedAvatar,
  type AvatarSource,
} from './avatarFiles';
export function AvatarScreen() {
  const { manager, status, user } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return <AvatarForm key={`${manager.api.environment}:${user.id}:${manager.getSignInVersion()}`} />;
}
function AvatarForm() {
  const { manager } = useAuth(),
    t = useMessages(),
    palette = usePalette(),
    online = useOnline(),
    query = useAccountAvatar(),
    cache = useQueryClient(),
    navigation = useNavigation();
  const [writer] = useState(
    () =>
      new AvatarWriter({
        manager,
        available: () => onlineManager.isOnline() && AppState.currentState === 'active',
        store: openAvatarWriteStore,
        upload: uploadAvatarFile,
        removeFile: removeAvatarFile,
        changed: async () => {
          await cache.invalidateQueries({ queryKey: query.queryKey });
        },
      })
  );
  const state = useSyncExternalStore(writer.subscribe, writer.getSnapshot, writer.getSnapshot);
  const [selected, setSelected] = useState<SelectedAvatar | null>(null),
    [cropSource, setCropSource] = useState<AvatarSource>(),
    [picking, setPicking] = useState(false),
    [error, setError] = useState<unknown>();
  const confirming = useRef(false);
  const selectedRef = useRef<SelectedAvatar | null>(null),
    cropSourceRef = useRef<AvatarSource | undefined>(undefined),
    cropVersion = useRef<number | undefined>(undefined),
    mounted = useRef(false),
    pickingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void writer.load();
    void openAvatarWriteStore()
      .then(async (store) => cleanupAvatarFiles(await store.files()))
      .catch(() => {});
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current && !confirming.current && selectedRef.current)
          void removeAvatarFile(selectedRef.current.file).catch(() => {});
        if (!mounted.current && cropSourceRef.current)
          void removeAvatarFile(cropSourceRef.current.file).catch(() => {});
      });
    };
  }, [writer]);
  const select = async () => {
    if (
      pickingRef.current ||
      confirming.current ||
      cropSourceRef.current ||
      state.busy ||
      state.record ||
      !state.loaded
    )
      return;
    pickingRef.current = true;
    setPicking(true);
    setError(undefined);
    const version = manager.getSignInVersion();
    try {
      const file = await pickAvatar();
      if (!file) return;
      if (!mounted.current || manager.getSignInVersion() !== version) {
        await removeAvatarFile(file.file);
        return;
      }
      cropSourceRef.current = file;
      cropVersion.current = version;
      setCropSource(file);
    } catch (e) {
      if (mounted.current && manager.getSignInVersion() === version) setError(e);
    } finally {
      pickingRef.current = false;
      if (mounted.current) setPicking(false);
    }
  };
  const cancelCrop = () => {
    const source = cropSourceRef.current;
    cropSourceRef.current = undefined;
    setCropSource(undefined);
    if (source)
      void removeAvatarFile(source.file).catch((e: unknown) => {
        if (mounted.current) setError(e);
      });
  };
  const finishCrop = async (file: SelectedAvatar) => {
    const source = cropSourceRef.current;
    if (!mounted.current || !source || manager.getSignInVersion() !== cropVersion.current) {
      await removeAvatarFile(file.file);
      return;
    }
    const previous = selectedRef.current;
    selectedRef.current = file;
    setSelected(file);
    cropSourceRef.current = undefined;
    setCropSource(undefined);
    for (const name of [source.file, previous?.file]) {
      if (name)
        await removeAvatarFile(name).catch((e: unknown) => {
          if (mounted.current) setError(e);
        });
    }
  };
  const discard = async () => {
    if (confirming.current || !selectedRef.current) return;
    try {
      await removeAvatarFile(selectedRef.current.file);
      selectedRef.current = null;
      setSelected(null);
    } catch (e) {
      setError(e);
    }
  };
  const confirm = (action: 'replace' | 'remove') => {
    if (
      confirming.current ||
      pickingRef.current ||
      cropSourceRef.current ||
      !query.data ||
      !online ||
      state.busy ||
      state.record
    )
      return;
    const base = { client_request_id: randomUUID(), expectedRevision: query.data.revision };
    if (action === 'replace' && selected) {
      confirming.current = true;
      void writer
        .confirm(
          { ...base, action, contentType: selected.contentType, size: selected.size },
          selected.file,
          () => {
            selectedRef.current = null;
            if (mounted.current) setSelected(null);
          }
        )
        .finally(() => {
          confirming.current = false;
          if (!mounted.current && selectedRef.current)
            void removeAvatarFile(selectedRef.current.file).catch(() => {});
        });
    } else if (action === 'remove')
      Alert.alert(t.avatarRemove, t.avatarRemoveConfirm, [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.avatarRemove,
          style: 'destructive',
          onPress: () => void writer.confirm({ ...base, action }),
        },
      ]);
  };
  const busy = state.busy || picking;
  usePreventRemove(busy || !!selected || !!cropSource, ({ data }) => {
    if (cropSource) return;
    if (busy) return;
    Alert.alert(t.leaveFormTitle, t.avatarUnsaved, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const failure = state.error ?? error;
  const message =
    failure instanceof ApiError && failure.code.startsWith('AVATAR_')
      ? failure.code === 'AVATAR_FILE_SIZE'
        ? t.avatarFileSize
        : failure.code === 'AVATAR_FILE_MISSING'
          ? t.avatarFileMissing
          : t.avatarPickFailed
      : failure instanceof ApiError && failure.code === 'PROFILE_OFFLINE'
        ? t.profileOffline
        : errorMessage(failure, t);
  const result = state.record?.result;
  return (
    <FormPage
      title={t.avatarTitle}
      backLabel={t.backShort}
      busy={busy}
      onBack={() => goBack('/profile')}
    >
      <Copy>{t.avatarPublicHint}</Copy>
      {cropSource && (
        <AvatarCropper
          key={cropSource.file}
          source={cropSource}
          onCancel={cancelCrop}
          onComplete={finishCrop}
        />
      )}
      {!online && <Notice tone="warning">{t.profileOffline}</Notice>}
      {!!failure && <Notice tone="danger">{message}</Notice>}
      {!!query.error && <Notice tone="danger">{errorMessage(query.error, t)}</Notice>}
      {!state.loaded && <Action label={t.retry} onPress={() => void writer.load()} busy={busy} />}
      <Card>
        <View style={{ width: 160, maxWidth: '100%', alignSelf: 'center' }}>
          <AvatarPreview
            key={selected?.file ?? `${query.data?.avatarUrl ?? 'empty'}:${query.dataUpdatedAt}`}
            url={selected ? avatarFileUri(selected.file) : (query.data?.avatarUrl ?? null)}
          />
          {!state.record && (
            <Pressable
              testID="avatar-pick"
              accessibilityRole="button"
              accessibilityLabel={t.avatarChoose}
              accessibilityState={{ disabled: busy || !state.loaded, busy }}
              disabled={busy || !state.loaded}
              onPress={() => void select()}
              style={({ pressed }) => ({
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: sizing.touch,
                height: sizing.touch,
                borderRadius: sizing.touch / 2,
                borderWidth: sizing.border,
                borderColor: palette.surface,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  busy || !state.loaded
                    ? palette.disabled
                    : pressed
                      ? palette.primaryPressed
                      : palette.primary,
              })}
            >
              <Icon
                name={busy ? 'spinner' : 'camera'}
                color={busy || !state.loaded ? palette.onDisabled : palette.onPrimary}
              />
            </Pressable>
          )}
        </View>
        {query.isPending && <Notice>{t.loading}</Notice>}
        {(!!query.error ||
          (result?.status === 'rejected' && result.code === 'RESOURCE_CHANGED')) && (
          <Action
            label={t.retry}
            variant="secondary"
            disabled={!online || busy}
            onPress={() => void query.refetch()}
          />
        )}
        {!state.record && (
          <>
            {selected && (
              <>
                <Action
                  testID="avatar-confirm"
                  label={t.avatarUpload}
                  busy={busy}
                  disabled={!online || !query.data}
                  onPress={() => confirm('replace')}
                />
                <Action
                  label={t.discardTripChanges}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void discard()}
                />
              </>
            )}
            {query.data?.avatarUrl && !selected && (
              <Action
                testID="avatar-remove"
                label={t.avatarRemove}
                variant="danger"
                busy={busy}
                disabled={!online}
                onPress={() => confirm('remove')}
              />
            )}
          </>
        )}
      </Card>
      {state.record && (
        <Card>
          {!result && (
            <>
              <Notice tone="warning">
                {state.record.cancel ? t.avatarCancelling : t.avatarPending}
              </Notice>
              <Action
                testID="avatar-lookup"
                label={t.checkResult}
                busy={busy}
                disabled={!online}
                onPress={() => void writer.lookup()}
              />
              <Action
                testID="avatar-retry"
                label={t.retry}
                variant="secondary"
                busy={busy}
                disabled={!online}
                onPress={() => void writer.retry()}
              />
              {!state.record.cancel && (
                <Action
                  testID="avatar-cancel"
                  label={t.avatarCancel}
                  variant="danger"
                  busy={busy}
                  disabled={!online}
                  onPress={() => void writer.cancel()}
                />
              )}
            </>
          )}
          {result && (
            <>
              <Notice tone={result.status === 'committed' ? 'success' : 'warning'}>
                {result.status === 'committed'
                  ? t.avatarSaved
                  : result.code === 'CANCELLED'
                    ? t.avatarCancelled
                    : result.code === 'RESOURCE_CHANGED'
                      ? t.avatarChanged
                      : result.code === 'EXPIRED'
                        ? t.avatarExpired
                        : t.avatarRejected}
              </Notice>
              <Action
                label={t.dismissOperation}
                variant="secondary"
                busy={busy}
                onPress={() => void writer.dismiss()}
              />
            </>
          )}
        </Card>
      )}
    </FormPage>
  );
}
