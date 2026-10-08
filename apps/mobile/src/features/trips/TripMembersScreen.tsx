import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Keyboard } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { tripMembersSchema, virtualMemberNameSchema, type TripMembers } from '@/api/contracts';
import { FormPage } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { Action, Card, Copy, DetailRow, Notice, Section, TextField } from '@/components/ui';
import { ApiError } from '@/api/client';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useOnline } from '@/providers/useOnline';
import { useMessages } from '@/i18n/useMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { LocalRateLimitError } from '@/features/expenses/entry';
import { createMemberLabelIndex } from '@/features/expenses/rows';
import { refreshManagedTrip } from './managementRefresh';

type Prepared = { expected_revision: string; display_name: string };
export function TripMembersScreen({ tripId, source }: { tripId: string; source?: string }) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const t = useMessages(),
    format = useDisplayFormat();
  const online = useOnline(),
    client = useQueryClient(),
    navigation = useNavigation();
  const [context, setContext] = useState<TripMembers | null>(null);
  const [latest, setLatest] = useState<TripMembers | null>(null);
  // undefined: list, null: create, ID: rename. Only explicit confirmation is persisted.
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [initial, setInitial] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [done, setDone] = useState(false),
    [pending, setPending] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const flight = useRef(false),
    generation = useRef(0),
    restored = useRef(false);
  const version = manager.getSignInVersion();
  const current = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    manager.api.environment === scope.environment;
  const visible = current() && !!scope && catalog.isVisible(scope, tripId);
  const editing = target !== undefined;
  usePreventRemove(editing && name !== initial && !busy && !pending && !done, ({ data }) =>
    Alert.alert(t.leaveFormTitle, t.unsavedTrip, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  );
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
  async function fail(failure: unknown, v: number) {
    if (v !== generation.current || !current()) return;
    if (
      failure instanceof ApiError &&
      failure.status === 429 &&
      !(failure instanceof LocalRateLimitError) &&
      scope
    ) {
      try {
        await (
          await openMutationStore()
        ).pause(scope, Date.now() + (failure.retryAfter ?? 30) * 1000);
      } catch {
        if (v === generation.current && current()) setError(t.storageError);
        return;
      }
    }
    if (
      failure instanceof ApiError &&
      failure.status === 404 &&
      failure.code === 'NOT_FOUND' &&
      scope
    )
      await catalog.deny(scope, tripId).catch(() => undefined);
    if (v === generation.current && current()) setError(errorMessage(failure, t));
  }
  async function read(beforeSend: () => void) {
    const data = await manager.requestAs(
      scope!.accountId,
      `/trips/${tripId}/members`,
      tripMembersSchema,
      { beforeSend }
    );
    beforeSend();
    return data;
  }
  async function run(task: (beforeSend: () => void, v: number) => Promise<void>) {
    if (flight.current || !online || !visible) return;
    flight.current = true;
    setBusy(true);
    setError('');
    const v = generation.current;
    try {
      const beforeSend = await guard();
      beforeSend();
      await task(beforeSend, v);
    } catch (failure) {
      await fail(failure, v);
    } finally {
      flight.current = false;
      if (v === generation.current && current()) setBusy(false);
    }
  }
  async function load(beforeSend: () => void, v: number) {
    const data = await read(beforeSend);
    if (v !== generation.current) return;
    if (editing) {
      setPrepared(null);
      setLatest(data);
      return;
    }
    setContext(data);
    if (source && !restored.current) {
      const old = await (await openMutationStore()).get(scope!, source);
      beforeSend();
      restored.current = true;
      if (v !== generation.current) return;
      if (
        old?.status === 'completed' &&
        old.result?.status === 'rejected' &&
        old.tripId === tripId &&
        old.payload &&
        data.role === 'admin'
      ) {
        const p = old.payload;
        if (
          p.operation === 'member.create' ||
          (p.operation === 'member.rename' &&
            data.members.some((m) => m.id === p.memberId && m.isVirtual))
        ) {
          setTarget(p.operation === 'member.create' ? null : p.memberId);
          setName(p.body.display_name);
          setInitial(
            p.operation === 'member.create'
              ? ''
              : data.members.find((m) => m.id === p.memberId)!.displayName
          );
        }
      }
    }
  }
  useEffect(() => {
    const lifetime = ++generation.current;
    void run(load);
    const connection = onlineManager.subscribe((connected) => {
      if (!connected) setPrepared(null);
    });
    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPrepared(null);
    });
    return () => {
      generation.current = lifetime + 1;
      connection();
      background.remove();
    };
    // The route is keyed by environment/account/trip/source; locale changes preserve input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const select = (id: string | null) => {
    if (busy || pending || done || !visible || context?.role !== 'admin') return;
    const value = id ? context.members.find((m) => m.id === id && m.isVirtual)?.displayName : '';
    if (value === undefined) return;
    setTarget(id);
    setName(value);
    setInitial(value);
    setLatest(null);
    setPrepared(null);
    setError('');
  };
  const check = () =>
    run(async (beforeSend, v) => {
      setPrepared(null);
      const parsed = virtualMemberNameSchema.safeParse(name);
      if (!parsed.success || (target && parsed.data === initial)) {
        setError(t.invalidMemberName);
        return;
      }
      const data = await read(beforeSend);
      if (v !== generation.current) return;
      if (
        data.role !== 'admin' ||
        data.revision !== context?.revision ||
        (target && !data.members.some((m) => m.id === target && m.isVirtual))
      ) {
        setLatest(data);
        setError(t.membersChanged);
        return;
      }
      setPrepared({ expected_revision: data.revision, display_name: parsed.data });
      Keyboard.dismiss();
    });
  const submit = () =>
    run(async (beforeSend, v) => {
      if (!prepared || !scope || target === undefined) return;
      const outcome = await entry.confirm(
        scope,
        target === null
          ? { operation: 'member.create', tripId, body: prepared }
          : { operation: 'member.rename', tripId, memberId: target, body: prepared }
      );
      if (v !== generation.current || !current()) return;
      if (outcome.kind === 'completed') {
        setPrepared(null);
        if (outcome.result.status === 'committed') {
          setDone(true);
          setRefreshFailed(outcome.refreshed === false);
        } else {
          setError(t.membersChanged);
          const data = await read(beforeSend);
          if (v === generation.current) setLatest(data);
        }
      } else if (outcome.kind === 'pending') {
        setPrepared(null);
        setPending(true);
        setError(t.operationUnknown);
      } else setError(outcome.kind === 'blocked' ? t.operationBlocked : t.operationNotSent);
    });
  const acceptLatest = () => {
    if (!latest || busy || !visible) return;
    setContext(latest);
    setLatest(null);
    setPrepared(null);
    setError('');
    if (
      latest.role !== 'admin' ||
      (target && !latest.members.some((m) => m.id === target && m.isVirtual))
    ) {
      setTarget(undefined);
      setName('');
      setInitial('');
    } else setInitial(target ? latest.members.find((m) => m.id === target)!.displayName : '');
  };
  const labels = useMemo(
    () => createMemberLabelIndex(context?.members, [], scope?.accountId, t),
    [context, scope?.accountId, t]
  );
  const latestLabels = useMemo(
    () => createMemberLabelIndex(latest?.members, [], scope?.accountId, t),
    [latest, scope?.accountId, t]
  );
  const locked = busy || !online || done || pending || !!latest || context?.role !== 'admin';
  return (
    <FormPage
      title={t.tripMembers}
      backLabel={t.backShort}
      backTestID="members-back"
      busy={busy}
      onBack={() => goBack(`/trips/${tripId}`)}
    >
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!visible && <Notice tone="danger">{t.notFound}</Notice>}
      {visible && (
        <>
          {!!error && <Notice tone="warning">{error}</Notice>}
          {pending ? (
            <>
              <Notice tone="warning">{t.pendingSaved}</Notice>
              <Action
                testID="members-operations"
                label={t.pendingOperations}
                onPress={() => router.replace('/trips/operations')}
              />
            </>
          ) : done ? (
            <>
              <Notice tone="success">{t.operationDone}</Notice>
              {refreshFailed && (
                <>
                  <Notice tone="warning">{t.staleData}</Notice>
                  <Action
                    testID="members-refresh-result"
                    label={t.retry}
                    disabled={!online}
                    busy={busy}
                    onPress={() =>
                      void run(async (_guard, v) => {
                        await refreshManagedTrip(client, manager, catalog, scope!, tripId);
                        if (v === generation.current) setRefreshFailed(false);
                      })
                    }
                  />
                </>
              )}
              <Action
                label={t.tripMembers}
                onPress={() =>
                  void run(async (beforeSend, v) => {
                    const data = await read(beforeSend);
                    if (v !== generation.current) return;
                    setContext(data);
                    setTarget(undefined);
                    setName('');
                    setInitial('');
                    setDone(false);
                    setRefreshFailed(false);
                  })
                }
              />
            </>
          ) : (
            <>
              {!context && (
                <Action
                  testID="members-load"
                  label={t.retry}
                  busy={busy}
                  disabled={!online}
                  onPress={() => void run(load)}
                />
              )}
              {context && (
                <>
                  <Copy>{t.membersHint}</Copy>
                  {context.role !== 'admin' && <Notice tone="info">{t.membersAdminOnly}</Notice>}
                  {!editing && (
                    <>
                      <Section title={t.tripMembers}>
                        {context.members.map((m) => (
                          <Card key={m.id}>
                            <Copy>
                              {labels.label({
                                id: m.id,
                                name: m.displayName,
                                isVirtual: m.isVirtual,
                              })}
                            </Copy>
                            <DetailRow label={t.roleLabel} value={t[m.role]} />
                            {m.joinedAt && (
                              <DetailRow
                                label={t.memberJoined}
                                value={format.instant(new Date(m.joinedAt).getTime())}
                              />
                            )}
                            {context.role === 'admin' && m.isVirtual && (
                              <Action
                                variant="secondary"
                                testID={`member-rename-${m.id}`}
                                label={t.renameVirtualMember}
                                disabled={busy || !online}
                                onPress={() => select(m.id)}
                              />
                            )}
                          </Card>
                        ))}
                      </Section>
                      {context.role === 'admin' && (
                        <Action
                          testID="member-create"
                          label={t.addVirtualMember}
                          disabled={busy || !online}
                          onPress={() => select(null)}
                        />
                      )}
                      <Action
                        testID="members-access"
                        label={t.tripAccess}
                        variant="secondary"
                        disabled={busy || !online}
                        onPress={() =>
                          router.push({ pathname: '/trips/[id]/access', params: { id: tripId } })
                        }
                      />
                      <Action
                        testID="members-refresh"
                        variant="ghost"
                        label={t.refresh}
                        disabled={!online}
                        busy={busy}
                        onPress={() => void run(load)}
                      />
                    </>
                  )}
                  {editing && (
                    <>
                      <Section title={target ? t.renameVirtualMember : t.addVirtualMember}>
                        {target && (
                          <DetailRow
                            label={t.currentMemberName}
                            value={labels.label({ id: target, name: initial, isVirtual: true })}
                          />
                        )}
                        <TextField
                          testID="member-name"
                          label={t.memberNameLabel}
                          value={name}
                          maxLength={200}
                          editable={!locked}
                          returnKeyType="done"
                          onSubmitEditing={() => {
                            if (!locked) void check();
                          }}
                          onChangeText={(value) => {
                            setName(value);
                            setPrepared(null);
                          }}
                        />
                        <Action
                          testID="members-check"
                          label={t.reviewExpenseChangesAction}
                          disabled={locked}
                          busy={busy}
                          onPress={() => void check()}
                        />
                      </Section>
                      {latest && (
                        <Card>
                          <Notice tone="warning">{t.membersChanged}</Notice>
                          {latest.members.map((m) => (
                            <DetailRow
                              key={m.id}
                              label={latestLabels.label({
                                id: m.id,
                                name: m.displayName,
                                isVirtual: m.isVirtual,
                              })}
                              value={t[m.role]}
                            />
                          ))}
                          <Action
                            testID="members-reconfirm"
                            label={t.tripSettingsReconfirm}
                            disabled={busy}
                            onPress={acceptLatest}
                          />
                        </Card>
                      )}
                      {prepared && (
                        <Card>
                          <DetailRow label={t.memberNameLabel} value={prepared.display_name} />
                          <Copy>{t.virtualMember}</Copy>
                          <Action
                            testID="members-confirm"
                            label={t.confirmSave}
                            disabled={locked}
                            busy={busy}
                            onPress={() => void submit()}
                          />
                        </Card>
                      )}
                      <Action
                        testID="members-cancel"
                        variant="ghost"
                        label={t.cancel}
                        disabled={busy}
                        onPress={() => {
                          setContext(latest ?? context);
                          setLatest(null);
                          setTarget(undefined);
                          setName('');
                          setInitial('');
                          setPrepared(null);
                          setError('');
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </FormPage>
  );
}
