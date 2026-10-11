import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import type { FriendItem } from '@travel-budget/contracts';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useOnline } from '@/providers/useOnline';
import { useMessages } from '@/i18n/useMessages';
import { ApiError } from '@/api/client';
import { FormPage } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { Action, Card, Copy, Notice, Section } from '@/components/ui';
import { createMemberLabelIndex } from '@/features/expenses/rows';
import { AvatarImage } from '@/features/profile/AccountAvatar';
import { FriendsManager, type FriendSource } from './FriendsManager';

export function FriendsScreen() {
  const { manager, status, user } = useAuth();
  const params = useLocalSearchParams<{ tripId?: string; targetUserId?: string }>();
  if (status !== 'signedIn' || !user) return null;
  const source =
    params.tripId || params.targetUserId
      ? {
          tripId: typeof params.tripId === 'string' ? params.tripId : '',
          targetUserId: typeof params.targetUserId === 'string' ? params.targetUserId : '',
        }
      : undefined;
  return (
    <FriendsForm
      key={`${manager.api.environment}:${user.id}:${manager.getSignInVersion()}:${source?.tripId}:${source?.targetUserId}`}
      source={source}
    />
  );
}
function FriendsForm({ source }: { source?: FriendSource }) {
  const { manager, user } = useAuth();
  const { catalog } = useDraftCatalog();
  const t = useMessages(),
    online = useOnline(),
    navigation = useNavigation();
  const [friends] = useState(
    () =>
      new FriendsManager(
        manager,
        () => onlineManager.isOnline() && AppState.currentState === 'active',
        source,
        () => {
          const scope = { environment: manager.api.environment, accountId: user!.id };
          const access = catalog.captureAccess(scope);
          return () => {
            access(source!.tripId);
            if (!catalog.isVisible(scope, source!.tripId)) throw new ApiError('NOT_FOUND', 404);
          };
        }
      )
  );
  const state = useSyncExternalStore(friends.subscribe, friends.getSnapshot, friends.getSnapshot);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) friends.dispose();
      });
    };
  }, [friends]);
  useFocusEffect(
    useCallback(() => {
      void friends.read();
    }, [friends])
  );
  usePreventRemove(state.busy || state.uncertain, ({ data }) => {
    if (state.busy) return;
    Alert.alert(t.leaveFormTitle, t.friendUnknown, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  const locked = !online || state.busy || state.uncertain || state.needsRefresh;
  const sourceVisible =
    !source ||
    catalog.isVisible({ environment: manager.api.environment, accountId: user!.id }, source.tripId);
  const relation =
    state.data && source
      ? [...state.data.friends, ...state.data.incoming, ...state.data.outgoing].find(
          (r) => r.user.id === source.targetUserId
        )
      : undefined;
  const failure =
    state.error instanceof ApiError
      ? state.error.code === 'ALREADY_FRIENDS'
        ? t.friendAlready
        : state.error.code === 'REQUEST_PENDING'
          ? t.friendPending
          : state.error.code === 'FRIEND_OFFLINE'
            ? t.friendOffline
            : state.error.code === 'NOT_FOUND'
              ? t.friendChanged
              : errorMessage(state.error, t)
      : errorMessage(state.error, t);
  const remove = (item: FriendItem) =>
    Alert.alert(t.friendRemove, `${item.user.displayName} · @${item.user.username}`, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.friendRemove,
        style: 'destructive',
        onPress: () => void friends.mutate('remove', item.id),
      },
    ]);
  const renderRow = (item: FriendItem, group: 'friends' | 'incoming' | 'outgoing') => (
    <Card key={item.id}>
      <AvatarImage key={item.user.avatarUrl} url={item.user.avatarUrl} size={48} />
      <Copy>{item.user.displayName}</Copy>
      <Copy>@{item.user.username}</Copy>
      {group === 'friends' ? (
        <Action
          testID={`friend-remove-${item.id}`}
          label={t.friendRemove}
          variant="danger"
          disabled={locked}
          onPress={() => remove(item)}
        />
      ) : group === 'outgoing' ? (
        <Action
          testID={`friend-withdraw-${item.id}`}
          label={t.friendWithdraw}
          variant="secondary"
          disabled={locked}
          onPress={() => void friends.mutate('withdraw', item.id)}
        />
      ) : (
        <>
          <Action
            testID={`friend-accept-${item.id}`}
            label={t.friendAccept}
            disabled={locked}
            onPress={() => void friends.mutate('accept', item.id)}
          />
          <Action
            testID={`friend-decline-${item.id}`}
            label={t.friendDecline}
            variant="secondary"
            disabled={locked}
            onPress={() => void friends.mutate('decline', item.id)}
          />
        </>
      )}
    </Card>
  );
  return (
    <FormPage
      title={t.friendTitle}
      backLabel={t.backShort}
      onBack={() => goBack('/me')}
      busy={state.busy}
    >
      <Copy>{t.friendScope}</Copy>
      {!online && <Notice tone="warning">{t.friendOffline}</Notice>}
      {!!state.error && <Notice tone="danger">{failure}</Notice>}
      {state.uncertain && <Notice tone="warning">{t.friendUnknown}</Notice>}
      {state.needsRefresh && <Notice tone="warning">{t.friendRefreshNeeded}</Notice>}
      {state.result && (
        <Notice tone={state.result === 'current' ? 'info' : 'success'}>
          {state.result === 'current'
            ? t.friendCurrent
            : state.result === 'pending'
              ? t.friendSent
              : state.result === 'accepted'
                ? t.friendAccepted
                : t.friendDeleted}
        </Notice>
      )}
      {!state.data && state.busy && <Notice>{t.loading}</Notice>}
      {source && sourceVisible && state.candidate && (
        <Card>
          <Copy>
            {createMemberLabelIndex(state.candidate.roster, [], user?.id, t).label({
              id: state.candidate.id,
              name: state.candidate.name,
            })}
          </Copy>
          {relation?.status === 'accepted' ? (
            <Copy>{t.friendAlready}</Copy>
          ) : relation?.requestedByMe ? (
            <Copy>{t.friendPending}</Copy>
          ) : relation ? (
            <Action
              testID="friend-candidate-accept"
              label={t.friendAccept}
              disabled={locked}
              onPress={() => void friends.mutate('accept', relation.id)}
            />
          ) : (
            <>
              <Copy>{t.friendInviteHint}</Copy>
              <Action
                testID="friend-invite"
                label={t.friendInvite}
                disabled={locked}
                onPress={() => void friends.mutate('invite', state.candidate!.id)}
              />
            </>
          )}
        </Card>
      )}
      {source && !sourceVisible && <Notice tone="warning">{t.friendSourceUnavailable}</Notice>}
      {state.data &&
        (['incoming', 'friends', 'outgoing'] as const).map((group) => (
          <Section
            key={group}
            title={
              { incoming: t.friendIncoming, friends: t.friendList, outgoing: t.friendOutgoing }[
                group
              ]
            }
          >
            {state.data![group].length ? (
              state.data![group].map((item) => renderRow(item, group))
            ) : (
              <Copy>{t.friendEmpty}</Copy>
            )}
          </Section>
        ))}
      <Action
        testID="friends-read"
        variant="secondary"
        label={
          state.uncertain ? t.checkResult : state.error || state.needsRefresh ? t.retry : t.refresh
        }
        disabled={!online}
        busy={state.busy}
        onPress={() => void friends.read()}
      />
    </FormPage>
  );
}
