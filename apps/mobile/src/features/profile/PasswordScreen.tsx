import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, TextInput } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { FormPage } from '@/components/screen';
import { Action, Card, Copy, Notice, TextField } from '@/components/ui';
import { goBack } from '@/components/navigation';
import { ApiError } from '@/api/client';
import { PasswordChanger } from './PasswordChanger';
export function PasswordScreen() {
  const { manager, status, user } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return (
    <PasswordForm key={`${manager.api.environment}:${user.id}:${manager.getSignInVersion()}`} />
  );
}
function PasswordForm() {
  const { manager, user } = useAuth();
  const t = useMessages(),
    online = useOnline(),
    navigation = useNavigation();
  const [changer] = useState(
    () =>
      new PasswordChanger(
        manager,
        () => onlineManager.isOnline() && AppState.currentState === 'active'
      )
  );
  const state = useSyncExternalStore(changer.subscribe, changer.getSnapshot, changer.getSnapshot);
  const mounted = useRef(false),
    password = useRef<TextInput>(null),
    confirmation = useRef<TextInput>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) changer.dispose();
      });
    };
  }, [changer]);
  usePreventRemove(
    state.busy || !!state.current || !!state.password || !!state.confirmation || state.uncertain,
    ({ data }) => {
      if (changer.getSnapshot().ending) {
        navigation.dispatch(data.action);
        return;
      }
      if (changer.getSnapshot().busy) return;
      Alert.alert(
        t.leaveFormTitle,
        state.uncertain ? t.passwordChangeUnknown : t.passwordChangeUnsaved,
        [
          { text: t.stayForm, style: 'cancel' },
          {
            text: t.leaveForm,
            style: 'destructive',
            onPress: () => navigation.dispatch(data.action),
          },
        ]
      );
    }
  );
  const login = (notice: string) =>
    router.replace({ pathname: '/', params: { notice, username: user?.username ?? '' } });
  const submit = async () => {
    if (await changer.submit()) login('passwordChanged');
  };
  const messages: Record<string, string> = {
    PASSWORD_OFFLINE: t.passwordChangeOffline,
    PASSWORD_MISMATCH: t.passwordMismatch,
    PASSWORD_INVALID: t.invalidNewPassword,
    INVALID_CURRENT_PASSWORD: t.passwordCurrentInvalid,
    RESOURCE_CHANGED: t.passwordChangeConflict,
  };
  const error =
    state.error instanceof ApiError
      ? (messages[state.error.code] ?? errorMessage(state.error, t))
      : errorMessage(state.error, t);
  return (
    <FormPage
      title={t.passwordChangeTitle}
      backLabel={t.backShort}
      busy={state.busy}
      onBack={() => goBack('/me')}
    >
      <Copy>{t.passwordChangeHint}</Copy>
      {!online && <Notice tone="warning">{t.passwordChangeOffline}</Notice>}
      {!!state.error && !state.uncertain && <Notice tone="danger">{error}</Notice>}
      {state.uncertain && <Notice tone="warning">{t.passwordChangeUnknown}</Notice>}
      <Card>
        <TextField
          testID="password-current"
          label={t.passwordCurrent}
          value={state.current}
          onChangeText={(v) => changer.edit('current', v)}
          editable={!state.busy && !state.uncertain}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => password.current?.focus()}
        />
        <TextField
          testID="password-new"
          inputRef={password}
          label={t.newPassword}
          description={t.newPasswordHint}
          value={state.password}
          onChangeText={(v) => changer.edit('password', v)}
          editable={!state.busy && !state.uncertain}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmation.current?.focus()}
        />
        <TextField
          testID="password-confirm"
          inputRef={confirmation}
          label={t.confirmPassword}
          value={state.confirmation}
          onChangeText={(v) => changer.edit('confirmation', v)}
          editable={!state.busy && !state.uncertain}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (online) void submit();
          }}
        />
        <Action
          testID="password-save"
          label={t.passwordChangeTitle}
          busy={state.busy}
          disabled={
            !online || state.uncertain || !state.current || !state.password || !state.confirmation
          }
          onPress={() => void submit()}
        />
      </Card>
      {state.uncertain && (
        <Action
          testID="password-login"
          variant="secondary"
          label={t.passwordChangeLogin}
          busy={state.busy}
          onPress={() =>
            void changer.reauthenticate().then((done) => {
              if (done) login('passwordChangeUnknown');
            })
          }
        />
      )}
    </FormPage>
  );
}
