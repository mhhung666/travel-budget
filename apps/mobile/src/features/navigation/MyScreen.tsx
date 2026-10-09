import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Action, Card, DetailRow, Notice, Page, Title } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';

export function MyScreen() {
  const { manager, user } = useAuth();
  const t = useMessages();
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
      <Card>
        <DetailRow label={t.displayName} value={user?.displayName ?? ''} />
        <DetailRow label={t.username} value={user?.username ?? ''} />
      </Card>
      <Action
        testID="my-local-work"
        variant="secondary"
        label={t.localWork}
        disabled={busy}
        onPress={() => router.push('/work')}
      />
      <Action
        testID="my-preferences"
        variant="secondary"
        label={t.preferences}
        disabled={busy}
        onPress={() => router.push('/preferences')}
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
