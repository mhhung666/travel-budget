import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { onlineManager } from '@tanstack/react-query';
import {
  tripAccessContextSchema,
  memberClaimInvitationSchema,
  type TripAccessContext,
  type TripAccessInput,
} from '@travel-budget/contracts';
import { FormPage } from '@/components/screen';
import { Action, Card, Copy, DetailRow, Notice, Section } from '@/components/ui';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { createMemberLabelIndex } from '@/features/expenses/rows';
import { LocalRateLimitError } from '@/features/expenses/entry';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { ApiError } from '@/api/client';
import { errorMessage } from '@/features/auth/errorMessage';
import { useOnline } from '@/providers/useOnline';
import { useMessages } from '@/i18n/useMessages';
import { goBack } from '@/components/navigation';
type Intent = TripAccessInput extends infer P
  ? P extends TripAccessInput
    ? Omit<P, 'client_request_id' | 'expected_revision'>
    : never
  : never;
export function TripAccessScreen({ tripId }: { tripId: string }) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const online = useOnline(),
    t = useMessages();
  const [data, setData] = useState<TripAccessContext | null>(null);
  const [prepared, setPrepared] = useState<(Intent & { expected_revision: string }) | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [done, setDone] = useState(false),
    [exited, setExited] = useState(false),
    [pending, setPending] = useState(false);
  const [invitation, setInvitation] = useState<{ memberId: string; url: string } | null>(null);
  const flight = useRef(false),
    generation = useRef(0);
  const version = manager.getSignInVersion();
  const current = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.api.baseUrl === scope.environment &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId;
  const visible = current() && !!scope && catalog.isVisible(scope, tripId);
  async function guard() {
    if (!scope || !current()) throw new ApiError('CANCELLED');
    const access = catalog.captureAccess(scope),
      store = await openMutationStore();
    await store.retryAt(scope);
    return () => {
      if (!current() || !onlineManager.isOnline() || AppState.currentState !== 'active')
        throw new ApiError('CANCELLED');
      access(tripId);
      if (!catalog.isVisible(scope, tripId)) throw new ApiError('CANCELLED');
      const until = store.rateLimitUntil(scope);
      if (until > Date.now()) throw new LocalRateLimitError(until, Date.now());
    };
  }
  async function run(task: (beforeSend: () => void, v: number) => Promise<void>) {
    if (flight.current || !visible || !online) return;
    flight.current = true;
    setBusy(true);
    setError('');
    const v = generation.current;
    try {
      const beforeSend = await guard();
      beforeSend();
      await task(beforeSend, v);
    } catch (failure) {
      if (v !== generation.current || !current()) return;
      if (
        failure instanceof ApiError &&
        failure.status === 429 &&
        !(failure instanceof LocalRateLimitError)
      ) {
        try {
          await (
            await openMutationStore()
          ).pause(scope!, Date.now() + (failure.retryAfter ?? 30) * 1000);
        } catch {
          setError(t.storageError);
          return;
        }
      }
      if (failure instanceof ApiError && failure.status === 404 && failure.code === 'NOT_FOUND')
        await catalog.deny(scope!, tripId).catch(() => undefined);
      if (v === generation.current && current()) setError(errorMessage(failure, t));
    } finally {
      flight.current = false;
      if (v === generation.current && current()) setBusy(false);
    }
  }
  async function read(beforeSend: () => void) {
    const context = await manager.requestAs(
      scope!.accountId,
      `/trips/${tripId}/access`,
      tripAccessContextSchema,
      { beforeSend }
    );
    beforeSend();
    return context;
  }
  const load = () =>
    run(async (beforeSend, v) => {
      setPrepared(null);
      setInvitation(null);
      const context = await read(beforeSend);
      if (v === generation.current) {
        setData(context);
        setDone(false);
      }
    });
  useEffect(() => {
    const lifetime = ++generation.current;
    void load();
    const invalidate = () => {
      setPrepared(null);
      setInvitation(null);
    };
    const connection = onlineManager.subscribe((connected) => {
      if (!connected) invalidate();
    });
    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active') invalidate();
    });
    return () => {
      generation.current = lifetime + 1;
      connection();
      background.remove();
    };
    // Route is keyed by environment/account/trip; switching language preserves review state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (intent: Intent) =>
    run(async (beforeSend, v) => {
      setPrepared(null);
      setInvitation(null);
      const context = await read(beforeSend);
      if (v !== generation.current) return;
      setData(context);
      if (context.accessRevision !== data?.accessRevision) {
        setError(t.membersChanged);
        return;
      }
      if (intent.action === 'leave' ? !context.canLeave : context.role !== 'admin') {
        setError(t.operationRejected);
        return;
      }
      if (
        'member_id' in intent &&
        (intent.member_id === scope!.accountId ||
          !context.members.some((m) => m.id === intent.member_id))
      ) {
        setError(t.membersChanged);
        return;
      }
      setPrepared({ ...intent, expected_revision: context.accessRevision });
    });
  const submit = () =>
    run(async (beforeSend, v) => {
      if (!prepared) return;
      const outcome = await entry.confirm(scope!, {
        operation: 'trip.access',
        tripId,
        body: prepared,
      });
      if (v !== generation.current || !current()) return;
      setPrepared(null);
      if (outcome.kind === 'completed' && outcome.result.status === 'committed') {
        setDone(true);
        setExited('exited' in outcome.result.result && outcome.result.result.exited);
        if (outcome.refreshed === false) setError(t.staleData);
      } else if (outcome.kind === 'completed') {
        setError(t.membersChanged);
        const context = await read(beforeSend);
        if (v === generation.current) setData(context);
      } else if (outcome.kind === 'pending') {
        setPending(true);
        setError(t.operationUnknown);
      } else setError(outcome.kind === 'blocked' ? t.operationBlocked : t.operationNotSent);
    });
  const claim = (memberId: string) =>
    run(async (beforeSend, v) => {
      setPrepared(null);
      setInvitation(null);
      const result = await manager.requestAs(
        scope!.accountId,
        `/trips/${tripId}/members/${memberId}/claim-invitation`,
        memberClaimInvitationSchema,
        { beforeSend }
      );
      beforeSend();
      if (v === generation.current) setInvitation({ memberId, url: result.url });
    });
  const labels = useMemo(
    () => createMemberLabelIndex(data?.members, [], scope?.accountId, t),
    [data, scope?.accountId, t]
  );
  const label = (id: string) => {
    const member = data?.members.find((m) => m.id === id);
    return labels.label({ id, name: member?.displayName ?? '', isVirtual: member?.isVirtual });
  };
  const actionLabel = (intent: Intent) =>
    intent.action === 'role'
      ? intent.role === 'admin'
        ? t.makeAdmin
        : t.makeMember
      : intent.action === 'remove'
        ? t.removeMember
        : intent.action === 'leave'
          ? t.leaveTrip
          : t.deleteTrip;
  return (
    <FormPage
      title={t.tripAccess}
      backLabel={t.backShort}
      backTestID="access-back"
      busy={busy}
      onBack={() => (exited ? router.replace('/trips') : goBack(`/trips/${tripId}/members`))}
    >
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!!error && current() && <Notice tone="warning">{error}</Notice>}
      {done && current() ? (
        <>
          <Notice tone="success">{t.operationDone}</Notice>
          <Action
            testID="access-done"
            label={exited ? t.trips : t.tripMembers}
            onPress={() =>
              exited
                ? router.replace('/trips')
                : router.replace({ pathname: '/trips/[id]/members', params: { id: tripId } })
            }
          />
        </>
      ) : pending && current() ? (
        <>
          <Notice tone="warning">{t.pendingSaved}</Notice>
          <Action
            testID="access-operations"
            label={t.pendingOperations}
            onPress={() => router.replace('/trips/operations')}
          />
        </>
      ) : !visible ? (
        <Notice tone="danger">{t.notFound}</Notice>
      ) : (
        <>
          <Action
            testID="access-refresh"
            label={data ? t.refresh : t.retry}
            variant="ghost"
            busy={busy}
            disabled={!online}
            onPress={() => void load()}
          />
          {data && (
            <>
              <Copy>{data.name}</Copy>
              <Copy>{t.accessHint}</Copy>
              <DetailRow label={t.expenses} value={String(data.expenseCount)} />
              <DetailRow label={t.registeredPayments} value={String(data.paymentCount)} />
              <Section title={t.tripMembers}>
                {data.members.map((m) => (
                  <Card key={m.id}>
                    <Copy>{label(m.id)}</Copy>
                    <DetailRow label={t.roleLabel} value={t[m.role]} />
                    {data.role === 'admin' && m.id !== scope?.accountId && (
                      <>
                        <Action
                          testID={`access-role-${m.id}`}
                          label={m.role === 'admin' ? t.makeMember : t.makeAdmin}
                          variant="secondary"
                          disabled={busy || !online || !!prepared}
                          onPress={() =>
                            void choose({
                              action: 'role',
                              member_id: m.id,
                              role: m.role === 'admin' ? 'member' : 'admin',
                            })
                          }
                        />
                        <Action
                          testID={`access-remove-${m.id}`}
                          label={t.removeMember}
                          variant="danger"
                          disabled={busy || !online || !!prepared}
                          onPress={() => void choose({ action: 'remove', member_id: m.id })}
                        />
                      </>
                    )}
                    {data.role === 'admin' && m.isVirtual && (
                      <Action
                        testID={`access-claim-${m.id}`}
                        label={t.claimVirtual}
                        variant="secondary"
                        disabled={busy || !online || !!prepared}
                        onPress={() => void claim(m.id)}
                      />
                    )}
                  </Card>
                ))}
              </Section>
              {invitation && (
                <Card>
                  <Copy>{label(invitation.memberId)}</Copy>
                  <Copy>{t.claimHint}</Copy>
                  <Action
                    testID="access-copy-claim"
                    label={t.copyInvitation}
                    disabled={busy || !online}
                    onPress={() =>
                      void run(async (beforeSend) => {
                        beforeSend();
                        await Clipboard.setStringAsync(invitation.url);
                      })
                    }
                  />
                  <Action
                    testID="access-share-claim"
                    label={t.shareInvitation}
                    disabled={busy || !online}
                    onPress={() =>
                      void run(async (beforeSend) => {
                        beforeSend();
                        await Share.share({ message: invitation.url, url: invitation.url });
                      })
                    }
                  />
                </Card>
              )}
              {!data.canLeave && <Notice tone="warning">{t.lastAdminHint}</Notice>}
              <Action
                testID="access-leave"
                label={t.leaveTrip}
                variant="danger"
                disabled={!data.canLeave || busy || !online || !!prepared}
                onPress={() => void choose({ action: 'leave' })}
              />
              {data.role === 'admin' && (
                <Action
                  testID="access-delete"
                  label={t.deleteTrip}
                  variant="danger"
                  disabled={busy || !online || !!prepared}
                  onPress={() => void choose({ action: 'delete' })}
                />
              )}
              {prepared && (
                <Card>
                  <Copy>{actionLabel(prepared)}</Copy>
                  {'member_id' in prepared && <Copy>{label(prepared.member_id)}</Copy>}
                  <Notice tone={prepared.action === 'role' ? 'info' : 'danger'}>
                    {prepared.action === 'delete'
                      ? t.deleteTripHint
                      : prepared.action === 'role'
                        ? t.roleHint
                        : t.removeHint}
                  </Notice>
                  <Action
                    testID="access-confirm"
                    label={actionLabel(prepared)}
                    variant={prepared.action === 'role' ? 'primary' : 'danger'}
                    busy={busy}
                    disabled={busy || !online}
                    onPress={() => void submit()}
                  />
                  <Action
                    testID="access-cancel"
                    label={t.cancel}
                    variant="ghost"
                    disabled={busy}
                    onPress={() => setPrepared(null)}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}
    </FormPage>
  );
}
