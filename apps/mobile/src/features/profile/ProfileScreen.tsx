import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';
import { router, useNavigation, useFocusEffect } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useOnline } from '@/providers/useOnline';
import { useMessages } from '@/i18n/useMessages';
import { goBack } from '@/components/navigation';
import { FormPage } from '@/components/screen';
import { Action, Card, Copy, DetailRow, Notice, TextField } from '@/components/ui';
import { ApiError } from '@/api/client';
import { AccountAvatar } from './AccountAvatar';
import { ProfileEditor } from './editor';

export function ProfileScreen() {
  const { manager, status, user } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return (
    <ProfileForm key={`${manager.api.environment}:${user.id}:${manager.getSignInVersion()}`} />
  );
}
function ProfileForm() {
  const { manager } = useAuth();
  const t = useMessages(),
    online = useOnline(),
    navigation = useNavigation();
  const [editor] = useState(
    () =>
      new ProfileEditor(
        manager,
        () => onlineManager.isOnline() && AppState.currentState === 'active'
      )
  );
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  // StrictMode may replay effects on the same controller; disposal is deferred until no remount.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) editor.dispose();
      });
    };
  }, [editor]);
  useFocusEffect(
    useCallback(() => {
      void editor.read();
    }, [editor])
  );
  const dirty = !!state.profile && state.name !== state.profile.displayName;
  usePreventRemove(state.busy || dirty || state.uncertain, ({ data }) => {
    if (state.busy) return;
    Alert.alert(t.leaveFormTitle, state.uncertain ? t.profileUnknown : t.profileUnsaved, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const message =
    state.error instanceof ApiError && state.error.code === 'PROFILE_NAME_INVALID'
      ? t.profileNameInvalid
      : state.error instanceof ApiError && state.error.code === 'PROFILE_OFFLINE'
        ? t.profileOffline
        : errorMessage(state.error, t);
  return (
    <FormPage
      title={t.profileTitle}
      backLabel={t.backShort}
      busy={state.busy}
      onBack={() => goBack('/me')}
    >
      <AccountAvatar />
      <Action
        testID="profile-avatar"
        label={t.avatarTitle}
        variant="secondary"
        disabled={state.busy}
        onPress={() => router.push('/avatar')}
      />
      <Copy>{t.profileHint}</Copy>
      {!online && <Notice tone="warning">{t.profileOffline}</Notice>}
      {!!state.error && !state.uncertain && <Notice tone="danger">{message}</Notice>}
      {state.uncertain && <Notice tone="warning">{t.profileUnknown}</Notice>}
      {state.result === 'saved' && <Notice tone="success">{t.profileSaved}</Notice>}
      {state.result === 'current' && <Notice>{t.profileCurrent}</Notice>}
      {state.localFailed && (
        <>
          <Notice tone="warning">{t.profileLocalFailed}</Notice>
          <Action
            testID="profile-retry-local"
            variant="secondary"
            label={t.retry}
            busy={state.busy}
            onPress={() => void editor.retryLocal()}
          />
        </>
      )}
      {!state.profile && state.busy && <Notice>{t.loading}</Notice>}
      {state.profile && (
        <Card>
          <DetailRow label={t.username} value={state.profile.username} />
          <DetailRow label={t.email} value={state.profile.email} />
          <Action
            testID="profile-email"
            label={t.emailChangeTitle}
            variant="secondary"
            disabled={state.busy || state.uncertain}
            onPress={() => router.push('/email')}
          />
          <TextField
            testID="profile-name"
            label={t.displayName}
            value={state.name}
            editable={!state.busy && !state.uncertain}
            maxLength={100}
            autoCapitalize="none"
            returnKeyType="done"
            onChangeText={(value) => editor.edit(value)}
            onSubmitEditing={() => {
              if (online && dirty) void editor.save();
            }}
          />
          <DetailRow label={t.profileCurrentName} value={state.profile.displayName} />
          <Action
            testID="profile-save"
            label={t.profileSave}
            busy={state.busy}
            disabled={!online || !dirty || state.uncertain}
            onPress={() => void editor.save()}
          />
        </Card>
      )}
      <Action
        testID="profile-read"
        variant="secondary"
        label={state.uncertain ? t.checkResult : t.refresh}
        busy={state.busy}
        disabled={!online}
        onPress={() => void editor.read()}
      />
    </FormPage>
  );
}
