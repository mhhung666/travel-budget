import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';
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
import { Action, Card, Copy, Notice } from '@/components/ui';
import { goBack } from '@/components/navigation';
import { openAvatarWriteStore } from '@/storage/avatarWriteDatabase';
import { AvatarWriter } from './AvatarWriter';
import { AvatarImage } from './AccountAvatar';
import { useAccountAvatar } from './useAccountAvatar';
import {
  pickAvatar,
  removeAvatarFile,
  uploadAvatarFile,
  avatarFileUri,
  cleanupAvatarFiles,
  type SelectedAvatar,
} from './avatarFiles';
export function AvatarScreen() {
  const { manager, status, user } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return <AvatarForm key={`${manager.api.environment}:${user.id}:${manager.getSignInVersion()}`} />;
}
function AvatarForm() {
  const { manager } = useAuth(),
    t = useMessages(),
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
    [picking, setPicking] = useState(false),
    [error, setError] = useState<unknown>();
  const confirming = useRef(false);
  const selectedRef = useRef<SelectedAvatar | null>(null),
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
      });
    };
  }, [writer]);
  const select = async () => {
    if (pickingRef.current || confirming.current || state.busy || state.record || !state.loaded)
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
      if (selectedRef.current) await removeAvatarFile(selectedRef.current.file);
      selectedRef.current = file;
      setSelected(file);
    } catch (e) {
      if (mounted.current && manager.getSignInVersion() === version) setError(e);
    } finally {
      pickingRef.current = false;
      if (mounted.current) setPicking(false);
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
  usePreventRemove(busy || !!selected, ({ data }) => {
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
      {!online && <Notice tone="warning">{t.profileOffline}</Notice>}
      {!!failure && <Notice tone="danger">{message}</Notice>}
      {!!query.error && <Notice tone="danger">{errorMessage(query.error, t)}</Notice>}
      {!state.loaded && <Action label={t.retry} onPress={() => void writer.load()} busy={busy} />}
      <Card>
        <AvatarImage
          key={`${query.data?.avatarUrl ?? 'empty'}:${query.dataUpdatedAt}`}
          url={query.data?.avatarUrl ?? null}
        />
        {query.isPending && <Notice>{t.loading}</Notice>}
        <Action
          label={t.refresh}
          variant="secondary"
          disabled={!online || busy}
          onPress={() => void query.refetch()}
        />
        {!state.record && (
          <>
            <Action
              testID="avatar-pick"
              label={t.avatarChoose}
              variant="secondary"
              busy={busy}
              disabled={!state.loaded}
              onPress={() => void select()}
            />
            {selected && (
              <>
                <Copy>{t.avatarPreview}</Copy>
                <AvatarImage key={selected.file} url={avatarFileUri(selected.file)} />
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
