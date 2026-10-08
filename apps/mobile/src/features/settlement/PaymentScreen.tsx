import { MemberRosterNotice } from '@/features/expenses/MemberRosterNotice';
import { TripContext } from '@/features/navigation/TripContext';
import { FormPage } from '@/components/screen';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  Section,
  TextField,
  Title,
  usePalette,
} from '@/components/ui';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { localDate } from '@/i18n/format';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { Disclosure } from '@/components/Disclosure';
import { useTripMembers } from '@/features/expenses/useTripMembers';
import { paymentLabels } from './paymentLabels';
import { spacing, sizing, typography } from '@/theme/tokens';
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
  const members = useTripMembers(tripId, !!paymentId);
  const client = useQueryClient();
  const t = useMessages();
  const f = useDisplayFormat();
  const p = usePalette();
  const amountAccessoryId = `payment-amount-${useId()}`;
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
  const contextLabels = useMemo(
    () => paymentLabels(context, scope?.accountId, t, members.roster),
    [context, scope?.accountId, t, members.roster]
  );
  const latestLabels = useMemo(
    () => paymentLabels(latest, scope?.accountId, t, members.roster),
    [latest, scope?.accountId, t, members.roster]
  );
  const labels = (data: Context) => (data === latest ? latestLabels : contextLabels);
  const party = (data: Context, id: string | null, name: string) => labels(data).party(id, name);
  const label = (data: PaymentContext, id: string) => labels(data).choice(id);
  const showContext = (data: Context) =>
    'payment' in data ? (
      <>
        <DetailRow
          label={t.paymentFrom}
          value={party(data, data.payment.fromId, data.payment.fromName)}
        />
        <DetailRow
          label={t.paymentTo}
          value={party(data, data.payment.toId, data.payment.toName)}
        />
        <DetailRow label={t.amountTwd} value={f.money(data.payment.amount)} />
        <DetailRow label={t.paymentNote} value={data.payment.note || '—'} />
        <DetailRow label={t.date} value={f.date(localDate(new Date(data.payment.createdAt)))} />
      </>
    ) : (
      <>
        <Section title={t.suggestedTransfers}>
          {data.settlement.suggestedTransfers.map((r) => (
            <Copy key={`${r.fromId}:${r.toId}`}>
              {party(data, r.fromId, r.fromName)} → {party(data, r.toId, r.toName)}:{' '}
              {f.money(r.amount)}
            </Copy>
          ))}
          {data.settlement.suggestedTransfers.length === 0 && <Copy>{t.noSuggestedTransfers}</Copy>}
        </Section>
        <Section title={t.memberBalances}>
          {data.settlement.balances.map((b) => (
            <DetailRow
              key={b.userId}
              label={party(data, b.userId, b.displayName)}
              value={`${b.balance > 0 ? t.toReceive : b.balance < 0 ? t.toPay : t.settledShort} ${f.money(Math.abs(b.balance))}`}
            />
          ))}
        </Section>
      </>
    );
  const native = Platform.OS !== 'web';
  const visible = !!scope && catalog.isVisible(scope, tripId) && !members.denied;
  return (
    <FormPage
      title={paymentId ? t.revokePayment : t.recordPayment}
      backLabel={t.backToSettlement}
      backTestID="payment-back"
      busy={busy}
      onBack={() =>
        router.dismissTo({ pathname: '/trips/[id]/settlement', params: { id: tripId } })
      }
    >
      <TripContext tripId={tripId} />
      <Notice>{t.paymentExternalOnly}</Notice>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      <MemberRosterNotice members={members} online={online} />
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
              {'payment' in context && (
                <Card testID="payment-original">{showContext(context)}</Card>
              )}
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
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
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
                    </View>
                  </Section>
                  <Section title={t.paymentTo}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
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
                    </View>
                  </Section>
                  <TextField
                    testID="payment-amount"
                    inputRef={amount}
                    label={t.amountTwd}
                    kind="amount"
                    placeholder={t.amountHint}
                    autoCorrect={false}
                    inputAccessoryViewID={amountAccessoryId}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    value={fields.amountText}
                    editable={!busy && !prepared}
                    keyboardType="decimal-pad"
                    onChangeText={(amountText) => change({ amountText })}
                  />
                  {Platform.OS === 'ios' ? (
                    <InputAccessoryView nativeID={amountAccessoryId}>
                      <View
                        style={{
                          backgroundColor: p.surface,
                          alignItems: 'flex-end',
                          borderTopWidth: 1,
                          borderColor: p.border,
                          padding: spacing.small,
                        }}
                      >
                        <Pressable
                          testID="payment-keyboard-done"
                          accessibilityRole="button"
                          accessibilityLabel={t.done}
                          onPress={Keyboard.dismiss}
                          style={{
                            minHeight: sizing.touch,
                            justifyContent: 'center',
                            paddingHorizontal: spacing.medium,
                          }}
                        >
                          <Text style={[typography.body, { color: p.primary, fontWeight: '600' }]}>
                            {t.done}
                          </Text>
                        </Pressable>
                      </View>
                    </InputAccessoryView>
                  ) : (
                    <Action variant="ghost" label={t.done} onPress={Keyboard.dismiss} />
                  )}
                  <TextField
                    testID="payment-note"
                    inputRef={note}
                    label={t.paymentNote}
                    multiline
                    submitBehavior="submit"
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
                      : f.money(paymentSuggestion(context, fields)!)}
                  </Copy>
                  <Disclosure testID="payment-reference" title={t.settlement}>
                    <Card>{showContext(context)}</Card>
                  </Disclosure>
                </>
              )}
              {paymentId && <Notice tone="warning">{t.revokePaymentWarning}</Notice>}
              {prepared ? (
                <Card>
                  <Title>{t.confirmPayment}</Title>
                  {'from_id' in prepared && 'members' in context ? (
                    <>
                      <DetailRow label={t.paymentFrom} value={label(context, prepared.from_id)} />
                      <DetailRow label={t.paymentTo} value={label(context, prepared.to_id)} />
                      <DetailRow label={t.amountTwd} value={f.money(prepared.amount)} />
                      <DetailRow label={t.paymentNote} value={prepared.note || '—'} />
                      {fields && paymentSuggestion(context, fields) !== prepared.amount && (
                        <Notice tone="warning">{t.paymentDeviation}</Notice>
                      )}
                    </>
                  ) : (
                    showContext(context)
                  )}
                  <Action
                    testID="payment-submit"
                    variant={paymentId ? 'danger' : 'primary'}
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
                  variant={paymentId ? 'secondary' : 'primary'}
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
    </FormPage>
  );
}
