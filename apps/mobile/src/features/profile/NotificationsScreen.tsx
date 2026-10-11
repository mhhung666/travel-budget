import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Switch } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useOnline } from '@/providers/useOnline';
import { useMessages } from '@/i18n/useMessages';
import { goBack } from '@/components/navigation';
import { FormPage } from '@/components/screen';
import { Action, Card, Chip, Copy, Notice, Section, usePalette } from '@/components/ui';
import { ApiError } from '@/api/client';
import { NotificationEditor } from './NotificationEditor';

export function NotificationsScreen() {
  const { manager, status, user } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return (
    <NotificationsForm
      key={`${manager.api.environment}:${user.id}:${manager.getSignInVersion()}`}
    />
  );
}
function NotificationsForm() {
  const { manager } = useAuth();
  const t = useMessages(),
    online = useOnline(),
    navigation = useNavigation(),
    p = usePalette();
  const [editor] = useState(
    () =>
      new NotificationEditor(
        manager,
        () => onlineManager.isOnline() && AppState.currentState === 'active'
      )
  );
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
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
  const dirty =
    !!state.preferences &&
    !!state.draft &&
    (state.preferences.notifyByEmail !== state.draft.notifyByEmail ||
      state.preferences.locale !== state.draft.locale);
  usePreventRemove(state.busy || dirty || state.uncertain, ({ data }) => {
    if (state.busy) return;
    Alert.alert(t.leaveFormTitle, state.uncertain ? t.notificationUnknown : t.notificationUnsaved, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const disabled = !online || state.busy || state.uncertain;
  return (
    <FormPage
      title={t.notificationTitle}
      backLabel={t.backShort}
      busy={state.busy}
      onBack={() => goBack('/me')}
    >
      <Copy>{t.notificationScope}</Copy>
      {!online && <Notice tone="warning">{t.notificationOffline}</Notice>}
      {!!state.error && !state.uncertain && (
        <Notice tone="danger">
          {state.error instanceof ApiError && state.error.code === 'PROFILE_OFFLINE'
            ? t.notificationOffline
            : errorMessage(state.error, t)}
        </Notice>
      )}
      {state.uncertain && <Notice tone="warning">{t.notificationUnknown}</Notice>}
      {state.result === 'saved' && <Notice tone="success">{t.notificationSaved}</Notice>}
      {state.result === 'current' && <Notice>{t.notificationCurrent}</Notice>}
      {!state.preferences && state.busy && <Notice>{t.loading}</Notice>}
      {state.draft && (
        <Card>
          <Section title={t.notificationEmail}>
            <Copy>{t.notificationEmailHint}</Copy>
            <Switch
              testID="notification-email"
              accessibilityLabel={t.notificationEmail}
              disabled={disabled}
              value={state.draft.notifyByEmail}
              trackColor={{ true: p.primary, false: p.border }}
              onValueChange={(notifyByEmail) => editor.edit({ notifyByEmail })}
            />
          </Section>
          <Section title={t.notificationLanguage}>
            <Copy>{t.notificationLanguageHint}</Copy>
            {(['zh', 'zh-CN', 'en', 'jp'] as const).map((locale) => (
              <Chip
                key={locale}
                testID={`notification-language-${locale}`}
                label={{ zh: '繁體中文', 'zh-CN': '简体中文', en: 'English', jp: '日本語' }[locale]}
                selected={state.draft?.locale === locale}
                disabled={disabled}
                onPress={() => editor.edit({ locale })}
              />
            ))}
          </Section>
          <Action
            testID="notification-save"
            label={t.profileSave}
            busy={state.busy}
            disabled={disabled || !dirty}
            onPress={() => void editor.save()}
          />
        </Card>
      )}
      <Action
        testID="notification-read"
        variant="secondary"
        label={state.uncertain ? t.checkResult : state.error ? t.retry : t.refresh}
        busy={state.busy}
        disabled={!online}
        onPress={() => void editor.read()}
      />
    </FormPage>
  );
}
