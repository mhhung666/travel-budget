import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useAuth } from './AuthProvider';
import { errorMessage } from './errorMessage';
import { Action, Card, Copy, Notice, Page, TextField, Title } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';

export function LoginScreen() {
  const { manager, error: sessionError } = useAuth();
  const t = useMessages();
  const params = useLocalSearchParams<{ username?: string; notice?: string }>();
  const [username, setUsername] = useState(params.username ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const submit = async () => {
    if (submitting.current || Platform.OS === 'web') return;
    if (!username.trim() || !password) {
      setError(t.required);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await manager.login(username.trim(), password);
      setPassword('');
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Page form>
        <Title>{t.login}</Title>
        <Copy>{t.loginHint}</Copy>
        <Card>
          {params.notice === 'registered' && (
            <Notice tone="success" announce="polite">
              {t.registered}
            </Notice>
          )}
          {params.notice === 'passwordResetDone' && (
            <Notice tone="success" announce="polite">
              {t.passwordResetDone}
            </Notice>
          )}
          <TextField
            label={t.username}
            testID="login-username"
            accessibilityLabel={t.username}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            editable={!busy}
            onSubmitEditing={() => passwordInput.current?.focus()}
          />
          <TextField
            label={t.password}
            testID="login-password"
            inputRef={passwordInput}
            accessibilityLabel={t.password}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            editable={!busy}
            onSubmitEditing={() => void submit()}
          />
          {!!error && <Notice tone="danger">{error}</Notice>}
          {!error && !!sessionError && (
            <Notice tone="danger">{errorMessage(sessionError, t)}</Notice>
          )}
          {Platform.OS === 'web' && <Notice>{t.nativeOnly}</Notice>}
          <Action
            testID="login-submit"
            label={busy ? t.signingIn : t.login}
            busy={busy}
            disabled={Platform.OS === 'web'}
            onPress={() => void submit()}
          />
        </Card>
        <Action
          testID="login-preferences"
          variant="secondary"
          label={t.preferences}
          disabled={busy}
          onPress={() => router.push('/preferences')}
        />
        <Action
          testID="login-register"
          variant="secondary"
          label={t.createAccount}
          disabled={busy}
          onPress={() => {
            setPassword('');
            router.push('/register');
          }}
        />
        <Action
          testID="login-forgot"
          variant="ghost"
          label={t.forgotPassword}
          disabled={busy}
          onPress={() => {
            setPassword('');
            router.push('/password-reset');
          }}
        />
      </Page>
    </KeyboardAvoidingView>
  );
}
