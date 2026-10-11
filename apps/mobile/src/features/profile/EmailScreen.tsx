import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, TextInput } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useMessages, useAppLocale } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { FormPage } from '@/components/screen';
import { Action, Card, Copy, DetailRow, Notice, TextField } from '@/components/ui';
import { goBack } from '@/components/navigation';
import { ApiError } from '@/api/client';
import { EmailChanger } from './EmailChanger';
export function EmailScreen() {
  const { manager, status, user } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return <EmailForm key={`${manager.api.environment}:${user.id}:${manager.getSignInVersion()}`} />;
}
function EmailForm() {
  const { manager } = useAuth();
  const t = useMessages(),
    online = useOnline(),
    navigation = useNavigation();
  const locale = useAppLocale();
  const [changer] = useState(
    () =>
      new EmailChanger(
        manager,
        () => onlineManager.isOnline() && AppState.currentState === 'active'
      )
  );
  const state = useSyncExternalStore(changer.subscribe, changer.getSnapshot, changer.getSnapshot);
  const mounted = useRef(false),
    code = useRef<TextInput>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void changer.read();
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) changer.dispose();
      });
    };
  }, [changer]);
  usePreventRemove(state.busy || !!state.email || !!state.code || state.uncertain, ({ data }) => {
    if (changer.getSnapshot().busy) return;
    Alert.alert(t.leaveFormTitle, t.emailChangeUnsaved, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const messages: Record<string, string> = {
    EMAIL_OFFLINE: t.profileOffline,
    EMAIL_INVALID: t.emailChangeInvalid,
    EMAIL_CODE_INVALID: t.invalidCode,
    SAME_EMAIL: t.emailChangeSame,
    CONFLICT: t.emailChangeConflict,
    RESOURCE_CHANGED: t.emailChangeStale,
    INVALID_CODE: t.invalidCode,
    CODE_EXPIRED: t.codeExpired,
    TOO_MANY_ATTEMPTS: t.tooManyAttempts,
    EMAIL_DELIVERY_FAILED: t.emailChangeDelivery,
  };
  const error =
    state.error instanceof ApiError
      ? (messages[state.error.code] ?? errorMessage(state.error, t))
      : errorMessage(state.error, t);
  const blocked = state.busy || state.uncertain || !online;
  const sendWait = state.sendUntil > now,
    verifyWait = state.verifyUntil > now;
  return (
    <FormPage
      title={t.emailChangeTitle}
      backLabel={t.backShort}
      busy={state.busy}
      onBack={() => goBack('/me')}
    >
      <Copy>{t.emailChangeHint}</Copy>
      {!online && <Notice tone="warning">{t.profileOffline}</Notice>}
      {!!state.error && !state.uncertain && <Notice tone="danger">{error}</Notice>}
      {state.uncertain && <Notice tone="warning">{t.emailChangeUnknown}</Notice>}
      {state.result === 'sent' && <Notice tone="success">{t.emailChangeSent}</Notice>}
      {state.result === 'changed' && <Notice tone="success">{t.emailChangeDone}</Notice>}
      {state.result === 'cancelled' && <Notice>{t.emailChangeCancelled}</Notice>}
      {state.result === 'current' && <Notice>{t.emailChangeCurrent}</Notice>}
      {(sendWait || verifyWait) && <Notice announce="none">{t.rateLimited}</Notice>}
      {state.profile && (
        <Card>
          <DetailRow label={t.emailChangeCurrentLabel} value={state.profile.email} />
          <TextField
            testID="email-new"
            label={t.emailChangeNew}
            value={state.email}
            editable={!blocked && state.stage === 'edit'}
            onChangeText={(v) => changer.edit('email', v)}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType={state.stage === 'edit' ? 'done' : 'next'}
            onSubmitEditing={() => {
              if (state.stage === 'verify') code.current?.focus();
              else if (!blocked && !sendWait) void changer.send(locale);
            }}
          />
          {state.stage === 'verify' && (
            <TextField
              testID="email-code"
              inputRef={code}
              label={t.resetCode}
              value={state.code}
              editable={!blocked}
              onChangeText={(v) => changer.edit('code', v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!blocked) void changer.confirm();
              }}
            />
          )}
          <Action
            testID="email-send"
            label={state.stage === 'verify' ? t.resendCode : t.sendResetCode}
            variant={state.stage === 'verify' ? 'secondary' : 'primary'}
            busy={state.busy}
            disabled={blocked || sendWait || !state.email}
            onPress={() => void changer.send(locale)}
          />
          {state.stage === 'verify' && (
            <Action
              testID="email-confirm"
              label={t.emailChangeConfirm}
              busy={state.busy}
              disabled={blocked || verifyWait || state.code.length !== 6}
              onPress={() => void changer.confirm()}
            />
          )}
          <Action
            testID="email-cancel"
            variant="secondary"
            label={t.emailChangeCancel}
            disabled={blocked}
            onPress={() => void changer.cancel()}
          />
        </Card>
      )}
      <Action
        testID="email-read"
        variant="secondary"
        label={state.uncertain ? t.checkResult : t.refresh}
        busy={state.busy}
        disabled={!online}
        onPress={() => void changer.read()}
      />
    </FormPage>
  );
}
