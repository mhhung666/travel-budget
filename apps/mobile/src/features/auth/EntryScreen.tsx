import { ActivityIndicator } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';
import { errorMessage } from './errorMessage';
import { Action, Notice, Page, Title } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';

export function EntryScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ username?: string; notice?: string }>();
  const t = useMessages();
  if (auth.status === 'local') return <Redirect href="/drafts" />;
  if (auth.status === 'signedIn') return <Redirect href="/trips" />;
  if (auth.status === 'signedOut')
    return <LoginScreen key={`${params.username ?? ''}:${params.notice ?? ''}`} />;
  return (
    <Page style={{ justifyContent: 'center' }}>
      <Title>{auth.status === 'loading' ? t.restoreTitle : t.restoreError}</Title>
      {auth.status === 'loading' ? (
        <ActivityIndicator accessibilityLabel={t.loading} />
      ) : (
        <>
          <Notice tone="danger">{errorMessage(auth.error, t)}</Notice>
          <Action label={t.retry} onPress={() => void auth.manager.restore()} />
        </>
      )}
    </Page>
  );
}
