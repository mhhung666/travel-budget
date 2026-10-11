import { AccountAvatar } from '@/features/profile/AccountAvatar';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Action, Card, DetailRow, Notice, Page, Section, Title } from '@/components/ui';
import { EntryGroup } from '@/components/EntryGroup';
import { LocalWorkLink } from '@/features/trips/LocalWorkLink';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { usePreferences } from '@/features/preferences/context';

export function MyScreen() {
  const { manager, user } = useAuth();
  const t = useMessages();
  const { value, loaded } = usePreferences();
  const language = {
    system: t.preferenceSystem,
    zh: '繁體中文',
    'zh-CN': '简体中文',
    en: 'English',
    jp: '日本語',
  }[value.language];
  const appearance = {
    system: t.preferenceSystem,
    light: t.preferenceLight,
    dark: t.preferenceDark,
  }[value.appearance];
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const logout = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await manager.logout();
    } catch (failure) {
      setError(failure);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return (
    <Page>
      <Title>{t.myAccount}</Title>
      <Section title={t.accountSection}>
        <Card>
          <AccountAvatar />
          <DetailRow label={t.displayName} value={user?.displayName ?? ''} />
          <DetailRow label={t.username} value={user ? `@${user.username}` : ''} />
        </Card>
        <EntryGroup
          entries={[
            {
              testID: 'my-profile',
              label: t.profileTitle,
              disabled: busy,
              onPress: () => router.push('/profile'),
            },
            {
              testID: 'my-email',
              label: t.emailChangeTitle,
              disabled: busy,
              onPress: () => router.push('/email'),
            },
            {
              testID: 'my-password',
              label: t.passwordChangeTitle,
              disabled: busy,
              onPress: () => router.push('/password'),
            },
          ]}
        />
      </Section>
      <Section title={t.preferences}>
        <EntryGroup
          entries={[
            {
              testID: 'my-preferences',
              label: t.preferences,
              detail: loaded ? `${language} · ${appearance}` : t.loading,
              disabled: busy,
              onPress: () => router.push('/preferences'),
            },
          ]}
        />
      </Section>
      <LocalWorkLink testID="my-local-work" disabled={busy} />
      <EntryGroup
        entries={[
          {
            testID: 'my-about',
            label: t.preferenceAbout,
            disabled: busy,
            onPress: () => router.push('/about'),
          },
        ]}
      />
      {!!error && <Notice tone="danger">{errorMessage(error, t)}</Notice>}
      <Action
        testID="logout"
        variant="secondary"
        label={busy ? t.loggingOut : t.logout}
        busy={busy}
        onPress={() => void logout()}
      />
    </Page>
  );
}
