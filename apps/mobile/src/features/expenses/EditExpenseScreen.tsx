import { baseCurrency } from '@/api/ledger';
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
  View,
  TextInput,
} from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { expenseEditContextSchema, type ExpenseEditContext } from '@/api/contracts';
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
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { ExpenseBaseline } from './ExpenseBaseline';
import { spacing, sizing, typography } from '@/theme/tokens';
import { useOnline } from '@/providers/useOnline';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { refreshTripData } from './entryQueries';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import {
  editFields,
  canRecalculate,
  prepareEdit,
  rebaseEditFields,
  canSplitEdit,
  editDraft,
  type EditMode,
  type EditFields,
  type PreparedEdit,
} from './maintenance';
import { expenseReadGuard, expenseReadWait } from './readGuard';
import { currencyDefaults, draftCurrencies } from './draft';
import { categoryLabel, createMemberLabelIndex, expenseMembers } from './rows';
import { isCalendarDate, parseAmount, parseRate } from './input';
import { SplitFields } from './SplitFields';
import { splitLabel } from './splitInput';

export function EditExpenseScreen({
  tripId,
  expenseId,
  remove = false,
  source,
}: {
  tripId: string;
  expenseId: string;
  remove?: boolean;
  source?: string;
}) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const client = useQueryClient();
  const p = usePalette();
  const amountAccessoryId = `expense-maintain-amount-${useId()}`;
  const online = useOnline();
  const navigation = useNavigation();
  const [context, setContext] = useState<ExpenseEditContext | null>(null);
  const t = useMessages(baseCurrency(context));
  const f = useDisplayFormat(baseCurrency(context));
  const [latest, setLatest] = useState<ExpenseEditContext | null>(null);
  const [fields, setFields] = useState<EditFields | null>(null);
  const [mode, setMode] = useState<EditMode>('basic');
  const [prepared, setPrepared] = useState<PreparedEdit | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [completed, setCompleted] = useState<PreparedEdit | null>(null);
  const [hidden, setHidden] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const flight = useRef(false);
  const generation = useRef(0);
  const inputGeneration = useRef(0);
  const first = useRef<TextInput>(null);
  const date = useRef<TextInput>(null);
  const amount = useRef<TextInput>(null);
  const rate = useRef<TextInput>(null);
  const unsavedWait = useRef(0);
  const dirty =
    !!context && !!fields && JSON.stringify(fields) !== JSON.stringify(editFields(context));
  usePreventRemove(dirty && !pending && !done && !busy, ({ data }) =>
    Alert.alert(t.leaveFormTitle, t.unsavedTrip, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  );
  const guard = useCallback(
    async (allowHidden = false) => {
      if (!scope) throw new ApiError('CANCELLED');
      const beforeSend = await expenseReadGuard(
        manager,
        catalog,
        scope,
        tripId,
        unsavedWait.current,
        allowHidden
      );
      beforeSend();
      return beforeSend;
    },
    [scope, manager, catalog, tripId]
  );
  const fail = async (failure: unknown, active: () => boolean) => {
    if (!active()) return;
    const wait = expenseReadWait(failure);
    if (wait && scope) {
      unsavedWait.current = Math.max(unsavedWait.current, wait);
      await (await openMutationStore()).pause(scope, unsavedWait.current).catch(() => undefined);
    }
    if (!active()) return;
    if (isAccessDenied(failure)) {
      setHidden(true);
      if (failure instanceof ApiError && failure.code === 'NOT_FOUND' && scope)
        await catalog.deny(scope, tripId).catch(() => undefined);
    }
    if (active()) setError(errorMessage(failure, t));
  };
  const load = useCallback(async () => {
    const v = ++generation.current;
    if (!scope) return;
    setBusy(true);
    setPrepared(null);
    try {
      const beforeSend = await guard(true);
      const read = await manager.requestAs(
        scope.accountId,
        `/trips/${tripId}/expenses/${expenseId}/edit-context`,
        expenseEditContextSchema,
        { beforeSend }
      );
      beforeSend();
      if (v !== generation.current) return;
      if (!catalog.isVisible(scope, tripId))
        await catalog.rememberOptions(scope, tripId, read.options);
      beforeSend();
      if (v !== generation.current) return;
      setContext(read);
      const initial = editFields(read);
      let initialMode: EditMode = 'basic';
      if (source) {
        const previous = await (await openMutationStore()).get(scope, source);
        if (
          previous?.status === 'completed' &&
          previous.result?.status === 'rejected' &&
          previous.payload?.operation === 'expense.update' &&
          previous.payload.tripId === tripId &&
          previous.payload.expenseId === expenseId
        ) {
          const { changes } = previous.payload.body;
          if (changes.description !== undefined) initial.description = changes.description;
          if (changes.category !== undefined) initial.category = changes.category;
          if (changes.date !== undefined) initial.date = changes.date;
          if (
            (previous.payload.body.mode === 'equal' && canRecalculate(read)) ||
            previous.payload.body.mode === 'split'
          ) {
            initial.amountText = String(previous.payload.body.changes.original_amount);
            // Missing fields are the frozen legacy TWD operation, never the current expense rate.
            initial.currency = previous.payload.body.changes.currency ?? 'TWD';
            initial.rateText = String(previous.payload.body.changes.exchange_rate ?? 1);
            initial.payerId = previous.payload.body.changes.payer_id;
            initial.memberIds = previous.payload.body.changes.splits.map((s) => s.user_id);
            initialMode = previous.payload.body.mode;
            if (previous.payload.body.mode === 'split') {
              const { split, splits } = previous.payload.body.changes;
              initial.splitMode = split.mode;
              if (split.mode !== 'equal')
                initial.splitValues = {
                  [split.mode]: Object.fromEntries(
                    splits.map((s, i) => [
                      s.user_id,
                      split.values[i] === null ? '' : String(split.values[i]),
                    ])
                  ),
                };
            }
          }
        }
      }
      beforeSend();
      if (v !== generation.current) return;
      setFields(initial);
      setLatest(null);
      setError('');
      setHidden(false);
      setMode(initialMode);
    } catch (failure) {
      await fail(failure, () => v === generation.current);
    } finally {
      if (v === generation.current) setBusy(false);
    }
    // fail reads the current localization only; reads themselves are scoped and guarded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, guard, manager, tripId, expenseId, source]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load])
  );
  useEffect(() => {
    const invalidate = () => {
      inputGeneration.current++;
      setPrepared(null);
    };
    const unsubscribe = onlineManager.subscribe((connected) => {
      if (!connected) invalidate();
    });
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state !== 'active') invalidate();
    });
    return () => {
      unsubscribe();
      lifecycle.remove();
    };
  }, []);
  const change = (patch: Partial<EditFields>) => {
    inputGeneration.current++;
    setPrepared(null);
    setFields((old) => (old ? { ...old, ...patch } : old));
  };
  const check = async () => {
    if (!context || !fields || !scope || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    setPrepared(null);
    const v = generation.current;
    const inputVersion = inputGeneration.current;
    try {
      const beforeSend = await guard();
      const next = remove
        ? {
            context: await manager.requestAs(
              scope.accountId,
              `/trips/${tripId}/expenses/${expenseId}/edit-context`,
              expenseEditContextSchema,
              { beforeSend }
            ),
            changes: null,
            preview: null,
          }
        : await prepareEdit(
            (user, path, schema, options) => manager.requestAs(user, path, schema, options),
            scope.accountId,
            tripId,
            expenseId,
            context,
            fields,
            mode,
            beforeSend
          );
      beforeSend();
      if (v !== generation.current || inputVersion !== inputGeneration.current) return;
      if (
        next.context.revision !== context.revision ||
        baseCurrency(next.context) !== baseCurrency(context)
      ) {
        setLatest(next.context);
        setError(t.expenseChanged);
        setPrepared(null);
      } else if (!remove && !next.changes) setError(t.noExpenseChanges);
      else {
        Keyboard.dismiss();
        setPrepared(next);
      }
    } catch (failure) {
      if (failure instanceof ApiError)
        await fail(
          failure,
          () => v === generation.current && inputVersion === inputGeneration.current
        );
      else if (v === generation.current && inputVersion === inputGeneration.current) {
        setError(t.invalidExpenseEdit);
        if (!isCalendarDate(fields.date)) date.current?.focus();
        else if (
          mode !== 'basic' &&
          !parseAmount(fields.amountText, fields.currency, baseCurrency(context)).ok
        )
          amount.current?.focus();
        else if (mode !== 'basic' && !parseRate(fields.rateText)) rate.current?.focus();
        else first.current?.focus();
      }
    } finally {
      flight.current = false;
      if (v === generation.current) setBusy(false);
    }
  };
  const submit = async () => {
    if (!scope || !context || !prepared || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    const v = generation.current;
    const inputVersion = inputGeneration.current;
    try {
      const beforeSend = await guard();
      beforeSend();
      if (v !== generation.current || inputVersion !== inputGeneration.current) return;
      const outcome = remove
        ? await entry.confirm(scope, {
            operation: 'expense.delete',
            tripId,
            expenseId,
            body: { base_currency: baseCurrency(context), expected_revision: context.revision },
          })
        : await entry.confirm(scope, {
            operation: 'expense.update',
            tripId,
            expenseId,
            body: { ...prepared.changes!, expected_revision: context.revision },
          });
      if (v !== generation.current) return;
      if (outcome.kind === 'completed') {
        if (outcome.result.status === 'committed') {
          setDone(true);
          setCompleted(prepared);
          setPrepared(null);
          setRefreshFailed(outcome.refreshed === false);
        } else {
          setError(t.expenseChanged);
          setPrepared(null);
          const beforeSend = await guard();
          const current = await manager.requestAs(
            scope.accountId,
            `/trips/${tripId}/expenses/${expenseId}/edit-context`,
            expenseEditContextSchema,
            { beforeSend }
          );
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
  const categoryName = (value: string | null) => {
    const known = context?.options.categories.find((c) => c === value);
    return known ? categoryLabel(known, t) : (value ?? '—');
  };
  const labels = useMemo(
    () =>
      createMemberLabelIndex(
        context?.options.members,
        context ? expenseMembers(context.expense) : [],
        scope?.accountId,
        t
      ),
    [context, scope?.accountId, t]
  );
  const latestLabels = useMemo(
    () =>
      createMemberLabelIndex(
        latest?.options.members,
        latest ? expenseMembers(latest.expense) : [],
        scope?.accountId,
        t
      ),
    [latest, scope?.accountId, t]
  );
  const memberLabel = (id: string | null, name: string) => labels.label({ id, name });
  const back = () =>
    router.dismissTo(
      remove && done
        ? { pathname: '/trips/[id]/expenses', params: { id: tripId } }
        : { pathname: '/trips/[id]/expenses/[expenseId]', params: { id: tripId, expenseId } }
    );
  return (
    <FormPage
      title={remove ? t.deleteExpense : t.editExpense}
      backLabel={remove && done ? t.backToExpenses : t.backToExpense}
      backTestID="expense-maintain-back"
      busy={busy}
      onBack={back}
    >
      <TripContext tripId={tripId} />
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {Platform.OS === 'web' && <Notice>{t.nativeOnly}</Notice>}
      {!!error && <Notice tone="danger">{error}</Notice>}
      {done ? (
        <>
          <Notice tone={refreshFailed ? 'warning' : 'success'} announce="polite">
            {refreshFailed ? t.savedRefreshFailed : t.operationDone}
          </Notice>
          {!remove && completed && (
            <Card testID="expense-maintain-saved">
              <Title>{t.savedTitle}</Title>
              <DetailRow
                label={t.expenseDescription}
                value={
                  completed.changes?.changes.description ?? completed.context.expense.description
                }
              />
              <DetailRow
                label={t.date}
                value={f.date(completed.changes?.changes.date ?? completed.context.expense.date)}
              />
              <DetailRow
                label={t.amountTwd}
                value={f.money(completed.preview?.amount ?? completed.context.expense.amount)}
              />
              <DetailRow
                label={t.originalAmount}
                value={f.originalAmount(
                  completed.preview
                    ? (completed.preview.originalAmount ?? completed.preview.amount)
                    : completed.context.expense.originalAmount,
                  completed.preview
                    ? (completed.preview.currency ?? 'TWD')
                    : completed.context.expense.currency
                )}
              />
              <DetailRow
                label={t.exchangeRate}
                value={String(
                  completed.preview
                    ? (completed.preview.exchangeRate ?? 1)
                    : completed.context.expense.exchangeRate
                )}
              />
              {(completed.preview?.splits ?? completed.context.expense.splits).map((s, i) => (
                <DetailRow
                  key={i}
                  label={memberLabel(s.userId, s.displayName)}
                  value={f.money(s.shareAmount)}
                />
              ))}
            </Card>
          )}
          {refreshFailed && (
            <Action
              label={t.refresh}
              busy={busy}
              disabled={!online}
              onPress={() => {
                if (!scope) return;
                setBusy(true);
                void refreshTripData(
                  client,
                  scope.environment,
                  scope.accountId,
                  tripId,
                  remove ? expenseId : undefined
                )
                  .then(() => setRefreshFailed(false))
                  .catch(() => undefined)
                  .finally(() => setBusy(false));
              }}
            />
          )}
          <Action label={remove ? t.backToExpenses : t.back} onPress={back} />
        </>
      ) : pending ? (
        <Action label={t.pendingOperations} onPress={() => router.push('/trips/operations')} />
      ) : context && fields && !hidden && (!scope || catalog.isVisible(scope, tripId)) ? (
        <>
          <ExpenseBaseline
            expense={context.expense}
            category={categoryName(context.category)}
            labels={labels}
            full={remove}
          />
          {latest && (
            <Card>
              <Title>{t.latestExpense}</Title>
              <DetailRow label={t.expenseDescription} value={latest.expense.description} />
              <DetailRow label={t.date} value={f.date(latest.expense.date)} />
              <DetailRow label={t.amountTwd} value={f.money(latest.expense.amount)} />
              <DetailRow
                label={t.originalAmount}
                value={f.originalAmount(latest.expense.originalAmount, latest.expense.currency)}
              />
              <DetailRow label={t.exchangeRate} value={String(latest.expense.exchangeRate)} />
              {latest.expense.splits.map((s, i) => (
                <DetailRow
                  key={i}
                  label={latestLabels.label({ id: s.userId, name: s.displayName })}
                  value={f.money(s.shareAmount)}
                />
              ))}
              <Action
                testID="expense-maintain-latest"
                label={t.useLatestExpense}
                onPress={() => {
                  inputGeneration.current++;
                  setFields(rebaseEditFields(context, fields, latest, mode));
                  setContext(latest);
                  setLatest(null);
                  setPrepared(null);
                  setError('');
                  if (mode === 'equal' && !canRecalculate(latest)) setMode('basic');
                }}
              />
              <Action secondary label={t.reloadExpense} onPress={() => void load()} />
            </Card>
          )}
          {remove ? (
            <Notice tone="warning">{t.deleteExpenseWarning}</Notice>
          ) : (
            <>
              <Notice>
                {mode === 'basic'
                  ? t.basicExpenseHint
                  : mode === 'split'
                    ? t.newSplitHint
                    : t.equalExpenseHint}
              </Notice>
              <Chip
                testID="expense-maintain-basic"
                label={t.basicExpense}
                selected={mode === 'basic'}
                disabled={busy}
                onPress={() => {
                  inputGeneration.current++;
                  setMode('basic');
                  setPrepared(null);
                }}
              />
              {(canSplitEdit(context) && mode !== 'equal') || mode === 'split' ? (
                <Chip
                  testID="expense-maintain-resplit"
                  label={t.resplitExpense}
                  selected={mode === 'split'}
                  disabled={busy}
                  onPress={() => {
                    inputGeneration.current++;
                    setMode('split');
                    setPrepared(null);
                  }}
                />
              ) : (
                <Chip
                  testID="expense-maintain-equal"
                  label={t.equalExpense}
                  selected={mode === 'equal'}
                  disabled={busy || !canRecalculate(context)}
                  onPress={() => {
                    inputGeneration.current++;
                    setMode('equal');
                    setPrepared(null);
                  }}
                />
              )}
              {!canRecalculate(context) && !canSplitEdit(context) && (
                <Notice>{t.expenseWebOnly}</Notice>
              )}
              {mode !== 'basic' && (
                <>
                  <Notice>{t.editCurrencyHint}</Notice>
                  <Section title={t.expenseCurrency}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
                      {draftCurrencies(context.options, { ...fields, category: 'other' }).map(
                        (currency) => (
                          <Chip
                            key={currency}
                            testID={`expense-maintain-currency-${currency}`}
                            label={currency}
                            selected={fields.currency === currency}
                            disabled={busy}
                            onPress={() => {
                              if (currency === fields.currency) return;
                              change({
                                currency,
                                rateText:
                                  currency === context.expense.currency
                                    ? String(context.expense.exchangeRate)
                                    : (currencyDefaults(context.options, currency).rateText ?? ''),
                              });
                            }}
                          />
                        )
                      )}
                    </View>
                  </Section>
                  <Copy>{t.expenseRateHint}</Copy>
                  {fields.currency !== baseCurrency(context) && (
                    <TextField
                      testID="expense-maintain-rate"
                      inputRef={rate}
                      label={t.exchangeRate}
                      value={fields.rateText}
                      editable={!busy}
                      autoCorrect={false}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                      inputAccessoryViewID={amountAccessoryId}
                      onSubmitEditing={() => amount.current?.focus()}
                      onChangeText={(rateText) => change({ rateText })}
                    />
                  )}
                  <TextField
                    testID="expense-maintain-amount"
                    inputRef={amount}
                    label={
                      fields.currency === baseCurrency(context)
                        ? t.amountTwd
                        : `${t.originalAmount} (${fields.currency})`
                    }
                    kind="amount"
                    placeholder={t.amountHint}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    inputAccessoryViewID={amountAccessoryId}
                    autoCorrect={false}
                    value={fields.amountText}
                    editable={!busy}
                    keyboardType="decimal-pad"
                    onChangeText={(amountText) => change({ amountText })}
                  />
                  {Platform.OS === 'ios' && (
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
                          testID="expense-maintain-keyboard-done"
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
                  )}
                </>
              )}
              <TextField
                testID="expense-maintain-description"
                inputRef={first}
                label={t.expenseDescription}
                multiline
                submitBehavior="submit"
                value={fields.description}
                editable={!busy}
                onChangeText={(description) => change({ description })}
                returnKeyType="next"
                onSubmitEditing={() => date.current?.focus()}
              />
              <Section title={t.category}>
                <Copy>{categoryName(fields.category)}</Copy>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
                  {context.options.categories.map((category) => (
                    <Chip
                      key={category}
                      label={categoryLabel(category, t)}
                      selected={fields.category === category}
                      disabled={busy}
                      onPress={() => change({ category })}
                    />
                  ))}
                </View>
              </Section>
              <TextField
                testID="expense-maintain-date"
                inputRef={date}
                label={t.date}
                value={fields.date}
                editable={!busy}
                onChangeText={(date) => change({ date })}
                autoCapitalize="none"
                placeholder={t.dateFormatHint}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              {mode !== 'basic' && (
                <>
                  <Section title={t.paidBy}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
                      {context.options.members.map((m) => (
                        <Chip
                          key={m.id}
                          testID={`expense-maintain-payer-${m.id}`}
                          label={memberLabel(m.id, m.displayName)}
                          selected={fields.payerId === m.id}
                          disabled={busy}
                          onPress={() => change({ payerId: m.id })}
                        />
                      ))}
                    </View>
                  </Section>
                  <Section title={t.splitDetails}>
                    {fields.memberIds.some(
                      (id) => !context.options.members.some((m) => m.id === id)
                    ) && (
                      <>
                        <Notice tone="warning">{t.removedSplitMembers}</Notice>
                        <Action
                          testID="expense-maintain-remove-missing"
                          disabled={busy}
                          secondary
                          label={t.removeMissingSplitMembers}
                          onPress={() =>
                            change({
                              memberIds: fields.memberIds.filter((id) =>
                                context.options.members.some((m) => m.id === id)
                              ),
                            })
                          }
                        />
                      </>
                    )}
                    {!context.options.members.some((m) => m.id === fields.payerId) && (
                      <Notice tone="warning">{t.chooseCurrentPayer}</Notice>
                    )}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small }}>
                      {context.options.members.map((m) => (
                        <Chip
                          key={m.id}
                          testID={`expense-maintain-split-${m.id}`}
                          role="checkbox"
                          label={memberLabel(m.id, m.displayName)}
                          selected={fields.memberIds.includes(m.id)}
                          disabled={busy}
                          onPress={() =>
                            change({
                              memberIds: fields.memberIds.includes(m.id)
                                ? fields.memberIds.filter((id) => id !== m.id)
                                : [...fields.memberIds, m.id],
                            })
                          }
                        />
                      ))}
                    </View>
                  </Section>
                  {mode === 'split' && (
                    <SplitFields
                      draft={editDraft(fields)}
                      members={context.options.members.map((m) => ({
                        id: m.id,
                        label: memberLabel(m.id, m.displayName),
                      }))}
                      t={t}
                      disabled={busy}
                      attempted={!!error}
                      requireSelection
                      available={canSplitEdit(context, fields.splitMode)}
                      accessoryId={amountAccessoryId}
                      onChange={(patch) =>
                        change({
                          splitMode: patch.splitMode ?? fields.splitMode,
                          splitValues: patch.splitValues ?? fields.splitValues,
                        })
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
          {prepared && (
            <Card>
              <Title>{t.confirmExpenseEdit}</Title>
              <Copy>{remove ? t.deleteExpenseWarning : t.reviewExpenseChanges}</Copy>
              {!remove && (
                <>
                  <DetailRow label={t.expenseDescription} value={fields.description} />
                  <DetailRow label={t.date} value={f.date(fields.date)} />
                  <DetailRow label={t.category} value={categoryName(fields.category)} />
                  {mode === 'basic' && (
                    <>
                      <DetailRow label={t.amountTwd} value={f.money(context.expense.amount)} />
                      <DetailRow
                        label={t.originalAmount}
                        value={f.originalAmount(
                          context.expense.originalAmount,
                          context.expense.currency
                        )}
                      />
                      <DetailRow
                        label={t.exchangeRate}
                        value={String(context.expense.exchangeRate)}
                      />
                      <DetailRow
                        label={t.paidBy}
                        value={memberLabel(context.expense.payerId, context.expense.payerName)}
                      />
                      {context.expense.splits.map((s, i) => (
                        <DetailRow
                          key={i}
                          label={memberLabel(s.userId, s.displayName)}
                          value={f.money(s.shareAmount)}
                        />
                      ))}
                    </>
                  )}
                  {mode !== 'basic' && (
                    <>
                      {mode === 'split' && fields.splitMode && (
                        <DetailRow label={t.splitMode} value={splitLabel(fields.splitMode, t)} />
                      )}
                      <DetailRow
                        label={t.originalAmount}
                        value={`${f.originalAmount(context.expense.originalAmount, context.expense.currency)} → ${f.originalAmount(Number(fields.amountText), fields.currency)}`}
                      />
                      <DetailRow
                        label={t.exchangeRate}
                        value={`${String(context.expense.exchangeRate)} → ${fields.rateText}`}
                      />
                      <DetailRow
                        label={t.amountTwd}
                        value={`${f.money(context.expense.amount)} → ${f.money(prepared.preview!.amount)}`}
                      />
                      <DetailRow
                        label={t.paidBy}
                        value={memberLabel(
                          fields.payerId,
                          context.options.members.find((m) => m.id === fields.payerId)
                            ?.displayName ?? ''
                        )}
                      />
                      {context.expense.splits.map((s, i) => (
                        <DetailRow
                          key={i}
                          label={`${t.currentExpense}: ${memberLabel(s.userId, s.displayName)}`}
                          value={f.money(s.shareAmount)}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
              {prepared.preview?.splits.map((s) => (
                <View key={s.userId} style={{ gap: spacing.small }}>
                  <DetailRow
                    key={s.userId}
                    label={memberLabel(s.userId, s.displayName)}
                    value={f.money(s.shareAmount)}
                  />
                  {s.originalShareAmount !== undefined && (
                    <DetailRow
                      label={t.originalAmount}
                      value={f.originalAmount(s.originalShareAmount, prepared.preview!.currency!)}
                    />
                  )}
                </View>
              ))}
              <Action
                testID="expense-maintain-confirm"
                variant={remove ? 'danger' : 'primary'}
                label={remove ? t.deleteExpense : t.confirmExpenseEdit}
                busy={busy}
                disabled={!online || Platform.OS === 'web' || !!latest}
                onPress={() => void submit()}
              />
            </Card>
          )}
          <Action
            testID="expense-maintain-preview"
            label={remove || mode === 'basic' ? t.reviewExpenseChangesAction : t.previewSplit}
            variant={prepared ? 'secondary' : 'primary'}
            busy={busy}
            disabled={!online || Platform.OS === 'web' || !!latest}
            onPress={() => void check()}
          />
        </>
      ) : (
        <Action label={t.retry} busy={busy} disabled={!online} onPress={() => void load()} />
      )}
    </FormPage>
  );
}
