import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Action, Copy, Notice, Page, TextField, Title } from '@/components/ui';
import { useMessages, useAppLocale } from '@/i18n/useMessages';
import { useAuth } from './AuthProvider';
import { AccountFlow, accountError, accountRetryAt } from './accountFlow';

export function AccountScreen({ mode }: { mode: 'register' | 'request' }) {
  const { manager } = useAuth();
  const locale = useAppLocale();
  const t = useMessages();
  const navigation = useNavigation();
  const [flow] = useState(() => new AccountFlow(manager.api, mode, locale));
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const inputs = useRef<(TextInput | null)[]>([]);
  useFocusEffect(
    useCallback(() => {
      flow.activate();
      return () => flow.dispose();
    }, [flow])
  );
  useEffect(() => {
    if (!Object.values(state.retryAt).some(Boolean)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.retryAt]);
  const dirty = Object.values(state.fields).some(Boolean);
  usePreventRemove(dirty && state.stage !== 'done', ({ data }) =>
    Alert.alert(t.leaveFormTitle, t.unsavedAccount, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  );
  const remaining = Math.max(0, Math.ceil((accountRetryAt(state) - now) / 1000));
  const resendRemaining = Math.max(0, Math.ceil((accountRetryAt(state, true) - now) / 1000));
  const submit = async (resend = false) => {
    if (Platform.OS === 'web') return;
    Keyboard.dismiss();
    await flow.submit(resend);
    const latest = flow.getSnapshot();
    if (latest.result && navigation.isFocused())
      router.replace({ pathname: '/', params: latest.result });
    else if (latest.invalid) {
      const index =
        latest.invalid === 'passwordMismatch'
          ? fields.findIndex(([key]) => key === 'confirmation')
          : latest.invalid === 'invalidNewPassword'
            ? fields.findIndex(([key]) => key === 'password')
            : 0;
      inputs.current[index]?.focus();
    }
  };
  const fields: [
    'username' | 'display_name' | 'email' | 'password' | 'confirmation' | 'code',
    string,
  ][] =
    state.stage === 'register'
      ? [
          ['username', t.username],
          ['display_name', t.displayName],
          ['email', t.email],
          ['password', t.password],
          ['confirmation', t.confirmPassword],
        ]
      : state.stage === 'request'
        ? [['email', t.email]]
        : [
            ['email', t.email],
            ['code', t.resetCode],
            ['password', t.newPassword],
            ['confirmation', t.confirmPassword],
          ];
  const error = accountError(state, t);
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Page form>
        <Title>{mode === 'register' ? t.createAccount : t.forgotPassword}</Title>
        <Copy>{mode === 'register' ? t.registrationHint : t.resetHint}</Copy>
        {state.accepted && (
          <Notice role="status" announce="polite">
            {t.resetAccepted}
          </Notice>
        )}
        {fields.map(([key, label], index) => (
          <TextField
            key={key}
            testID={`account-${key}`}
            label={label}
            inputRef={(input) => {
              inputs.current[index] = input;
            }}
            value={state.fields[key]}
            onChangeText={(value) => flow.setField(key, value)}
            editable={!state.busy}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={key === 'password' || key === 'confirmation'}
            autoComplete={
              key === 'password' || key === 'confirmation'
                ? 'new-password'
                : key === 'email'
                  ? 'email'
                  : key === 'username'
                    ? 'username'
                    : key === 'code'
                      ? 'one-time-code'
                      : 'name'
            }
            textContentType={
              key === 'password' || key === 'confirmation'
                ? 'newPassword'
                : key === 'email'
                  ? 'emailAddress'
                  : key === 'code'
                    ? 'oneTimeCode'
                    : key === 'username'
                      ? 'username'
                      : 'name'
            }
            keyboardType={
              key === 'email' ? 'email-address' : key === 'code' ? 'number-pad' : 'default'
            }
            maxLength={key === 'code' ? 6 : undefined}
            returnKeyType={index === fields.length - 1 ? 'go' : 'next'}
            onSubmitEditing={() =>
              index === fields.length - 1 ? void submit() : inputs.current[index + 1]?.focus()
            }
          />
        ))}
        {state.stage !== 'request' && <Copy>{t.newPasswordHint}</Copy>}
        {!!error && <Notice tone="danger">{error}</Notice>}
        {remaining > 0 && (
          <Notice
            tone="warning"
            announce="none"
          >{`${t.accountWait} ${remaining} ${t.seconds}`}</Notice>
        )}
        {state.stage === 'confirm' && resendRemaining > 0 && (
          <Notice
            tone="warning"
            announce="none"
          >{`${t.resendCode}: ${t.accountWait} ${resendRemaining} ${t.seconds}`}</Notice>
        )}
        {Platform.OS === 'web' && <Notice>{t.nativeOnly}</Notice>}
        <Action
          testID="account-submit"
          label={
            state.stage === 'register'
              ? t.createAccount
              : state.stage === 'request'
                ? t.sendResetCode
                : t.resetPassword
          }
          busy={state.busy}
          disabled={remaining > 0 || Platform.OS === 'web'}
          onPress={() => void submit()}
        />
        {state.stage === 'request' && (
          <Action
            testID="account-have-code"
            secondary
            label={t.alreadyHaveCode}
            disabled={state.busy}
            onPress={() => flow.continueWithCode()}
          />
        )}
        {state.stage === 'confirm' && (
          <Action
            testID="account-resend"
            secondary
            label={t.resendCode}
            disabled={state.busy || resendRemaining > 0 || Platform.OS === 'web'}
            onPress={() => void submit(true)}
          />
        )}
        <Action
          testID="account-back"
          secondary
          label={t.backToLogin}
          disabled={state.busy}
          onPress={() => router.back()}
        />
      </Page>
    </KeyboardAvoidingView>
  );
}
