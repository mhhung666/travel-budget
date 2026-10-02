import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from './AuthProvider';
import { errorMessage } from './errorMessage';
import { Action, Copy, Notice, Page, Title, usePalette } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';

export function LoginScreen() {
  const { manager, error: sessionError } = useAuth();
  const t = useMessages();
  const p = usePalette();
  const [username, setUsername] = useState('');
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
      <Page style={{ justifyContent: 'center' }}>
        <View style={{ gap: 10, marginBottom: 20 }}>
          <Title>{t.title}</Title>
          <Copy>{t.subtitle}</Copy>
        </View>
        <View style={[s.card, { backgroundColor: p.surface, borderColor: p.border }]}>
          <Text
            accessibilityRole="header"
            style={{ color: p.text, fontSize: 24, fontWeight: '700' }}
          >
            {t.login}
          </Text>
          <Copy>{t.loginHint}</Copy>
          <Text style={{ color: p.text, fontSize: 16 }}>{t.username}</Text>
          <TextInput
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
            style={[
              s.input,
              { color: p.text, borderColor: p.border, backgroundColor: p.background },
            ]}
          />
          <Text style={{ color: p.text, fontSize: 16 }}>{t.password}</Text>
          <TextInput
            ref={passwordInput}
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
            style={[
              s.input,
              { color: p.text, borderColor: p.border, backgroundColor: p.background },
            ]}
          />
          {!!error && <Notice>{error}</Notice>}
          {!error && !!sessionError && <Notice>{errorMessage(sessionError, t)}</Notice>}
          {Platform.OS === 'web' && <Notice>{t.nativeOnly}</Notice>}
          <Action
            label={busy ? t.signingIn : t.login}
            busy={busy}
            disabled={Platform.OS === 'web'}
            onPress={() => void submit()}
          />
        </View>
      </Page>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, padding: 22, gap: 14 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 52, padding: 14, fontSize: 18 },
});
