import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { TripContext } from '@/features/navigation/TripContext';
import { useEffect, useState } from 'react';
import { AppState, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ApiError } from '@/api/client';
import { invitationSchema } from '@travel-budget/contracts';
import { Action, Copy, Notice, Page } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
export function InvitationScreen({ id }: { id: string }) {
  const { manager, user } = useAuth();
  const { catalog } = useDraftCatalog();
  const t = useMessages();
  const online = useOnline();
  const [result, setResult] = useState<{
    key: string;
    data?: { code: string; url: string };
    error?: unknown;
    version: ReturnType<typeof catalog.accessVersion>;
  }>();
  const [feedback, setFeedback] = useState('');
  const [refresh, setRefresh] = useState(0);
  const accountId = user?.id;
  const scope = accountId ? { environment: manager.api.baseUrl, accountId } : null;
  const signInVersion = manager.getSignInVersion();
  const requestKey = JSON.stringify([
    manager.api.baseUrl,
    accountId,
    signInVersion,
    id,
    refresh,
    online,
  ]);
  useEffect(() => {
    if (!accountId || !online) return;
    const controller = new AbortController();
    const scope = { environment: manager.api.baseUrl, accountId };
    const version = catalog.accessVersion(scope, id);
    void manager
      .requestAs(accountId, `/trips/${encodeURIComponent(id)}/invitation`, invitationSchema, {
        signal: controller.signal,
      })
      .then((data) => {
        if (!controller.signal.aborted)
          setResult(
            catalog.accessVersion(scope, id) === version
              ? { key: requestKey, data, version }
              : { key: requestKey, error: new ApiError('NOT_FOUND', 404), version }
          );
      })
      .catch(async (error) => {
        if (controller.signal.aborted) return;
        if (isAccessDenied(error)) await catalog.deny(scope, id).catch(() => undefined);
        if (!controller.signal.aborted) setResult({ key: requestKey, error, version });
      });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        controller.abort();
        setResult(undefined);
      } else setRefresh((v) => v + 1);
    });
    return () => {
      controller.abort();
      foreground.remove();
    };
  }, [catalog, id, manager, online, requestKey, accountId]);
  // Screen-local state only; the render key also hides an old A session after A→B→A.
  const current = result?.key === requestKey ? result : undefined;
  const visible =
    online &&
    scope &&
    catalog.isVisible(scope, id) &&
    current?.version === catalog.accessVersion(scope, id)
      ? current?.data
      : undefined;
  const act = async (action: 'copy' | 'share') => {
    if (
      !visible ||
      !scope ||
      manager.getSignInVersion() !== signInVersion ||
      current?.version !== catalog.accessVersion(scope, id) ||
      !catalog.isVisible(scope, id)
    )
      return;
    try {
      if (action === 'copy') {
        await Clipboard.setStringAsync(visible.url);
        setFeedback(t.copiedInvitation);
      } else await Share.share({ message: visible.url, url: visible.url });
    } catch {
      setFeedback(t.copyFailed);
    }
  };
  return (
    <Page>
      <PageHeader
        title={t.inviteMembers}
        backTestID="invitation-back"
        backLabel={t.backShort}
        onBack={() => goBack({ pathname: '/trips/[id]', params: { id } })}
      />
      <TripContext tripId={id} />
      <Notice tone="warning">{t.invitationWarning}</Notice>
      {scope && !catalog.isVisible(scope, id) ? (
        <Notice tone="danger">{errorMessage(new ApiError('NOT_FOUND', 404), t)}</Notice>
      ) : (
        !!current?.error && <Notice tone="danger">{errorMessage(current.error, t)}</Notice>
      )}
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      <Action
        label={t.refresh}
        busy={online && !current && (!scope || catalog.isVisible(scope, id))}
        disabled={!online}
        onPress={() => {
          setFeedback('');
          setRefresh((v) => v + 1);
        }}
      />
      {visible && (
        <>
          <Copy>{visible.code}</Copy>
          <Copy>{visible.url}</Copy>
          <Action
            testID="invitation-copy"
            label={t.copyInvitation}
            onPress={() => void act('copy')}
          />
          <Action
            testID="invitation-share"
            label={t.shareInvitation}
            onPress={() => void act('share')}
          />
          {!!feedback && <Notice announce="polite">{feedback}</Notice>}
        </>
      )}
    </Page>
  );
}
