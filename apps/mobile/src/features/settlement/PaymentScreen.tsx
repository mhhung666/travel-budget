import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, Platform, TextInput } from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import {
  expenseOptionsSchema,
  paymentContextSchema,
  paymentRevokeContextSchema,
  type PaymentContext,
  type PaymentRevokeContext,
  type PaymentCreateInput,
  type PaymentDeleteInput,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import {
  Action,
  Card,
  Chip,
  Copy,
  DetailRow,
  Notice,
  Page,
  Section,
  TextField,
  Title,
} from '@/components/ui';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { money } from '@/i18n/format';
import { useOnline } from '@/providers/useOnline';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { LocalRateLimitError } from '@/features/expenses/entry';
import { refreshTripData } from '@/features/expenses/entryQueries';
import {
  paymentFields,
  paymentSuggestion,
  preparePayment,
  preparePaymentRevocation,
  type PaymentFields,
} from './paymentForm';

type Context = PaymentContext | PaymentRevokeContext;
export function PaymentScreen({
  tripId,
  paymentId,
  source,
  seed = {},
}: {
  tripId: string;
  paymentId?: string;
  source?: string;
  seed?: Partial<PaymentFields>;
}) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const client = useQueryClient();
  const t = useMessages();
  const online = useOnline();
  const navigation = useNavigation();
  const [context, setContext] = useState<Context | null>(null);
  const [latest, setLatest] = useState<Context | null>(null);
  const [fields, setFields] = useState<PaymentFields | null>(null);
  const [prepared, setPrepared] = useState<
    | Omit<PaymentCreateInput, 'client_request_id'>
    | Omit<PaymentDeleteInput, 'client_request_id'>
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [initial, setInitial] = useState<PaymentFields | null>(null);
  const flight = useRef(false);
  const generation = useRef(0);
  const amount = useRef<TextInput>(null);
  const note = useRef<TextInput>(null);
  const dirty = !!fields && JSON.stringify(fields) !== JSON.stringify(initial);
  usePreventRemove(dirty && !busy && !pending && !done, ({ data }) =>
    Alert.alert(t.leaveFormTitle, t.unsavedTrip, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  );
  const guard = useCallback(async () => {
    if (!scope || !onlineManager.isOnline() || AppState.currentState !== 'active')
      throw new ApiError('CANCELLED');
    const version = manager.getSignInVersion();
    const captured = catalog.captureAccess(scope);
    const store = await openMutationStore();
    await store.retryAt(scope);
    return () => {
      if (
        !onlineManager.isOnline() ||
        AppState.currentState !== 'active' ||
        manager.getSignInVersion() !== version ||
        manager.getSnapshot().user?.id !== scope.accountId
      )
        throw new ApiError('CANCELLED');
      captured(tripId);
      const until = store.rateLimitUntil(scope);
      if (until > Date.now()) throw new LocalRateLimitError(until, Date.now());
    };
  }, [scope, manager, catalog, tripId]);
  const fail = async (failure: unknown, active: () => boolean) => {
    if (!active()) return;
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
        if (active()) setError(t.storageError);
        return;
      }
    }
    if (!active()) return;
    if (isAccessDenied(failure)) {
      setHidden(true);
      if (failure instanceof ApiError && failure.code === 'NOT_FOUND' && scope)
        await catalog.deny(scope, tripId).catch(() => undefined);
    }
    if (active()) setError(errorMessage(failure, t));
  };
  const read = async (beforeSend: () => void): Promise<Context> => {
    if (!scope) throw new ApiError('CANCELLED');
    const request = paymentId
      ? manager.requestAs(
          scope.accountId,
          `/trips/${tripId}/payments/${paymentId}/revoke-context`,
          paymentRevokeContextSchema,
          { beforeSend }
        )
      : manager.requestAs(
          scope.accountId,
          `/trips/${tripId}/payment-context`,
          paymentContextSchema,
          { beforeSend }
        );
    const data = await request;
    beforeSend();
    return data;
  };
  const load = useCallback(async () => {
    const v = ++generation.current;
    if (!scope) return;
    setBusy(true);
    setPrepared(null);
    try {
      const beforeSend = await guard();
      const data = await read(beforeSend);
      if (v !== generation.current) return;
      // A successful context is a current authorization read, never a receipt-derived snapshot.
      if (!catalog.isVisible(scope, tripId)) {
        const options = await manager.requestAs(
          scope.accountId,
          `/trips/${tripId}/expense-options`,
          expenseOptionsSchema,
          { beforeSend }
        );
        beforeSend();
        await catalog.rememberOptions(scope, tripId, options);
      }
      beforeSend();
      let start = 'members' in data ? paymentFields(data, seed) : null;
      if (source && start) {
        const previous = await (await openMutationStore()).get(scope, source);
        if (
          previous?.status === 'completed' &&
          previous.result?.status === 'rejected' &&
          previous.payload?.operation === 'payment.create' &&
          previous.payload.tripId === tripId
        ) {
          const body = previous.payload.body;
          start = {
            fromId: body.from_id,
            toId: body.to_id,
            amountText: String(body.amount),
            note: body.note,
          };
        }
      }
      beforeSend();
      if (v !== generation.current) return;
      setInitial(start);
      setFields(start);
      setContext(data);
      setLatest(null);
      setHidden(false);
      setError('');
    } catch (failure) {
      await fail(failure, () => v === generation.current);
    } finally {
      if (v === generation.current) setBusy(false);
    }
    // Route is keyed by account/environment and seed. Failure text uses the current locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, guard, manager, tripId, paymentId, source]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load])
  );
  useEffect(
    () =>
      onlineManager.subscribe((connected) => {
        if (!connected) setPrepared(null);
      }),
    []
  );
  const check = async () => {
    if (!context || !scope || flight.current) return;
    flight.current = true;
    setBusy(true);
    setPrepared(null);
    setError('');
    const v = generation.current;
    try {
      const beforeSend = await guard();
      const next =
        'payment' in context && paymentId
          ? await preparePaymentRevocation(
              (...args) => manager.requestAs(...args),
              scope.accountId,
              tripId,
              paymentId,
              context,
              beforeSend
            )
          : 'members' in context && fields
            ? await preparePayment(
                (...args) => manager.requestAs(...args),
                scope.accountId,
                tripId,
                context,
                fields,
                beforeSend
              )
            : null;
      beforeSend();
      if (!next || v !== generation.current) return;
      if (!next.body) {
        setLatest(next.current);
        setError(t.paymentChanged);
      } else {
        Keyboard.dismiss();
        setPrepared(next.body);
      }
    } catch (failure) {
      if (failure instanceof ApiError) await fail(failure, () => v === generation.current);
      else if (v === generation.current) {
        setError(t.invalidPayment);
        amount.current?.focus();
      }
    } finally {
      flight.current = false;
      if (v === generation.current) setBusy(false);
    }
  };
  const submit = async () => {
    if (!scope || !prepared || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    const v = generation.current;
    try {
      const outcome = paymentId
        ? await entry.confirm(scope, {
            operation: 'payment.delete',
            tripId,
            paymentId,
            body: { expected_revision: prepared.expected_revision },
          })
        : 'from_id' in prepared
          ? await entry.confirm(scope, { operation: 'payment.create', tripId, body: prepared })
          : null;
      if (!outcome || v !== generation.current) return;
      if (outcome.kind === 'completed') {
        setPrepared(null);
        if (outcome.result.status === 'committed') {
          setDone(true);
          setRefreshFailed(outcome.refreshed === false);
        } else {
          setError(t.paymentChanged);
          const beforeSend = await guard();
          const current = await read(beforeSend);
          if (v === generation.current) setLatest(current);
        }
      } else if (outcome.kind === 'pending') {
        setPending(true);
        if (isAccessDenied(outcome.error)) setHidden(true);
        setError(t.operationUnknown);
      } else setError(outcome.kind === 'blocked' ? t.operationBlocked : t.operationNotSent);
    } catch (failure) {
      await fail(failure, () => v === generation.current);
    } finally {
      flight.current = false;
      if (v === generation.current) setBusy(false);
    }
  };
  const change = (patch: Partial<PaymentFields>) => {
    setFields((f) => (f ? { ...f, ...patch } : f));
    setPrepared(null);
  };
  const label = (data: PaymentContext, id: string) =>
    `${data.members.find((m) => m.id === id)?.displayName ?? t.unknownMember} (${id.slice(-6)})`;
  const showContext = (data: Context) =>
    'payment' in data ? (
      <>
        <Copy>{`${data.payment.fromName} (${data.payment.fromId?.slice(-6) ?? '—'}) → ${data.payment.toName} (${data.payment.toId?.slice(-6) ?? '—'})`}</Copy>
        <Copy>{money(data.payment.amount)}</Copy>
        <Copy>{data.payment.note ?? '—'}</Copy>
      </>
    ) : (
      <>
        {data.settlement.balances.map((b) => (
          <DetailRow key={b.userId} label={label(data, b.userId)} value={money(b.balance)} />
        ))}
        {data.settlement.suggestedTransfers.map((r) => (
          <Copy
            key={`${r.fromId}:${r.toId}`}
          >{`${label(data, r.fromId)} → ${label(data, r.toId)}: ${money(r.amount)}`}</Copy>
        ))}
        {data.settlement.suggestedTransfers.length === 0 && <Copy>{t.noSuggestedTransfers}</Copy>}
      </>
    );
  const native = Platform.OS !== 'web';
  const visible = !!scope && catalog.isVisible(scope, tripId);
  return (
    <Page form>
      <Action
        testID="payment-back"
        secondary
        label={t.back}
        disabled={busy}
        onPress={() =>
          router.dismissTo({ pathname: '/trips/[id]/settlement', params: { id: tripId } })
        }
      />
      <Title>{paymentId ? t.revokePayment : t.recordPayment}</Title>
      <Notice>{t.paymentExternalOnly}</Notice>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!native && <Notice>{t.nativeOnly}</Notice>}
      {!!error && <Notice tone="danger">{error}</Notice>}
      {done ? (
        <>
          <Notice tone={refreshFailed ? 'warning' : 'success'} announce="polite">
            {refreshFailed ? t.savedRefreshFailed : t.operationDone}
          </Notice>
          {refreshFailed && (
            <Action
              label={t.refresh}
              disabled={!online}
              busy={busy}
              onPress={() => {
                if (!scope) return;
                setBusy(true);
                void refreshTripData(client, scope.environment, scope.accountId, tripId)
                  .then(() => setRefreshFailed(false))
                  .catch(() => setRefreshFailed(true))
                  .finally(() => setBusy(false));
              }}
            />
          )}
        </>
      ) : pending ? (
        <Action label={t.pendingOperations} onPress={() => router.push('/trips/operations')} />
      ) : (
        <>
          {(!context || hidden || !visible) && (
            <Action
              label={t.retry}
              busy={busy}
              disabled={!online || !native}
              onPress={() => void load()}
            />
          )}
          {context && !hidden && visible && (
            <>
              <Card>
                <Title>{t.settlement}</Title>
                {showContext(context)}
              </Card>
              {latest && (
                <Card>
                  <Title>{t.latestExpense}</Title>
                  {showContext(latest)}
                  <Notice tone="warning">{t.paymentChanged}</Notice>
                  <Action
                    testID="payment-reconfirm"
                    label={t.reconfirmPayment}
                    onPress={() => {
                      setContext(latest);
                      setLatest(null);
                      setPrepared(null);
                      setError('');
                    }}
                  />
                  <Action secondary label={t.reloadExpense} onPress={() => void load()} />
                </Card>
              )}
              {'members' in context && fields && (
                <>
                  <Section title={t.paymentFrom}>
                    {context.members.map((m) => (
                      <Chip
                        testID={`payment-from-${m.id}`}
                        key={m.id}
                        label={label(context, m.id)}
                        selected={fields.fromId === m.id}
                        disabled={busy || !!prepared}
                        onPress={() => change({ fromId: m.id })}
                      />
                    ))}
                  </Section>
                  <Section title={t.paymentTo}>
                    {context.members.map((m) => (
                      <Chip
                        testID={`payment-to-${m.id}`}
                        key={m.id}
                        label={label(context, m.id)}
                        selected={fields.toId === m.id}
                        disabled={busy || !!prepared}
                        onPress={() => change({ toId: m.id })}
                      />
                    ))}
                  </Section>
                  <TextField
                    testID="payment-amount"
                    inputRef={amount}
                    label={t.amountTwd}
                    value={fields.amountText}
                    editable={!busy && !prepared}
                    keyboardType="decimal-pad"
                    onChangeText={(amountText) => change({ amountText })}
                  />
                  <Action
                    secondary
                    label={t.done}
                    onPress={() => {
                      Keyboard.dismiss();
                      note.current?.focus();
                    }}
                  />
                  <TextField
                    testID="payment-note"
                    inputRef={note}
                    label={t.paymentNote}
                    value={fields.note}
                    editable={!busy && !prepared}
                    onChangeText={(note) => change({ note })}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                  <Copy>
                    {t.suggestedTransfers}:{' '}
                    {paymentSuggestion(context, fields) === null
                      ? t.noSuggestedTransfers
                      : money(paymentSuggestion(context, fields)!)}
                  </Copy>
                </>
              )}
              {paymentId && <Notice tone="warning">{t.revokePaymentWarning}</Notice>}
              {prepared ? (
                <Card>
                  <Title>{t.confirmPayment}</Title>
                  {'from_id' in prepared && 'members' in context ? (
                    <>
                      <Copy>{`${label(context, prepared.from_id)} → ${label(context, prepared.to_id)}`}</Copy>
                      <Copy>{money(prepared.amount)}</Copy>
                      <Copy>{prepared.note || '—'}</Copy>
                      {fields && paymentSuggestion(context, fields) !== prepared.amount && (
                        <Notice tone="warning">{t.paymentDeviation}</Notice>
                      )}
                    </>
                  ) : (
                    showContext(context)
                  )}
                  <Action
                    testID="payment-submit"
                    label={paymentId ? t.revokePayment : t.recordPayment}
                    busy={busy}
                    disabled={!online || !native}
                    onPress={() => void submit()}
                  />
                  <Action
                    secondary
                    label={t.back}
                    disabled={busy}
                    onPress={() => setPrepared(null)}
                  />
                </Card>
              ) : (
                <Action
                  testID="payment-preview"
                  label={t.confirmPayment}
                  busy={busy}
                  disabled={!online || !native || !!latest}
                  onPress={() => void check()}
                />
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}
