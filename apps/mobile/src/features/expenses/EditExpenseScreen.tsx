import { TripContext } from '@/features/navigation/TripContext';
import { FormPage } from '@/components/screen';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
import { expenseEditContextSchema, type ExpenseEditContext } from '@travel-budget/contracts';
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
  prepareEdit,
  rebaseEditFields,
  type EditFields,
  type PreparedEdit,
} from './maintenance';
import { LocalRateLimitError } from './entry';
import { categoryLabel, expenseMemberLabel } from './rows';
import { isCalendarDate, parseAmount } from './input';

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
  const t = useMessages();
  const f = useDisplayFormat();
  const p = usePalette();
  const amountAccessoryId = `expense-maintain-amount-${useId()}`;
  const online = useOnline();
  const navigation = useNavigation();
  const [context, setContext] = useState<ExpenseEditContext | null>(null);
  const [latest, setLatest] = useState<ExpenseEditContext | null>(null);
  const [fields, setFields] = useState<EditFields | null>(null);
  const [mode, setMode] = useState<'basic' | 'equal'>('basic');
  const [prepared, setPrepared] = useState<PreparedEdit | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const flight = useRef(false);
  const generation = useRef(0);
  const first = useRef<TextInput>(null);
  const date = useRef<TextInput>(null);
  const amount = useRef<TextInput>(null);
  const dirty =
    !!context && !!fields && JSON.stringify(fields) !== JSON.stringify(editFields(context));
  usePreventRemove(dirty && !pending && !done && !busy, ({ data }) =>
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
        !manager.getSnapshot().user ||
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
    )
      await (
        await openMutationStore()
      )
        .pause(scope, Date.now() + (failure.retryAfter ?? 30) * 1000)
        .catch(() => undefined);
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
      const beforeSend = await guard();
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
      let initialMode: 'basic' | 'equal' = 'basic';
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
          if (previous.payload.body.mode === 'equal' && read.capabilities.equal) {
            initial.amountText = String(previous.payload.body.changes.original_amount);
            initial.payerId = previous.payload.body.changes.payer_id;
            initial.memberIds = previous.payload.body.changes.splits.map((s) => s.user_id);
            initialMode = 'equal';
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
  useEffect(
    () =>
      onlineManager.subscribe((connected) => {
        if (!connected) setPrepared(null);
      }),
    []
  );
  const change = (patch: Partial<EditFields>) => {
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
      if (v !== generation.current) return;
      if (next.context.revision !== context.revision) {
        setLatest(next.context);
        setError(t.expenseChanged);
        setPrepared(null);
      } else if (!remove && !next.changes) setError(t.noExpenseChanges);
      else {
        Keyboard.dismiss();
        setPrepared(next);
      }
    } catch (failure) {
      if (failure instanceof ApiError) await fail(failure, () => v === generation.current);
      else if (v === generation.current) {
        setError(t.invalidExpenseEdit);
        if (!isCalendarDate(fields.date)) date.current?.focus();
        else if (mode === 'equal' && !parseAmount(fields.amountText).ok) amount.current?.focus();
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
    try {
      const outcome = remove
        ? await entry.confirm(scope, {
            operation: 'expense.delete',
            tripId,
            expenseId,
            body: { expected_revision: context.revision },
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
  const peers = [
    ...(context?.options.members.map((m) => ({ id: m.id, name: m.displayName })) ?? []),
    ...(context?.expense.splits.map((s) => ({ id: s.userId, name: s.displayName })) ?? []),
    ...(latest?.expense.splits.map((s) => ({ id: s.userId, name: s.displayName })) ?? []),
    { id: context?.expense.payerId ?? null, name: context?.expense.payerName ?? '' },
  ];
  const memberLabel = (id: string | null, name: string) =>
    expenseMemberLabel({ id, name }, peers, scope?.accountId, t);
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
            viewerId={scope?.accountId}
            full={remove}
          />
          {latest && (
            <Card>
              <Title>{t.latestExpense}</Title>
              <DetailRow label={t.expenseDescription} value={latest.expense.description} />
              <DetailRow label={t.date} value={f.date(latest.expense.date)} />
              <DetailRow label={t.amountTwd} value={f.money(latest.expense.amount)} />
              {latest.expense.splits.map((s, i) => (
                <DetailRow
                  key={i}
                  label={memberLabel(s.userId, s.displayName)}
                  value={f.money(s.shareAmount)}
                />
              ))}
              <Action
                testID="expense-maintain-latest"
                label={t.useLatestExpense}
                onPress={() => {
                  setFields(rebaseEditFields(context, fields, latest));
                  setContext(latest);
                  setLatest(null);
                  setPrepared(null);
                  setError('');
                  if (!latest.capabilities.equal) setMode('basic');
                }}
              />
              <Action secondary label={t.reloadExpense} onPress={() => void load()} />
            </Card>
          )}
          {remove ? (
            <Notice tone="warning">{t.deleteExpenseWarning}</Notice>
          ) : (
            <>
              <Notice>{mode === 'basic' ? t.basicExpenseHint : t.equalExpenseHint}</Notice>
              <Chip
                testID="expense-maintain-basic"
                label={t.basicExpense}
                selected={mode === 'basic'}
                disabled={busy}
                onPress={() => {
                  setMode('basic');
                  setPrepared(null);
                }}
              />
              <Chip
                testID="expense-maintain-equal"
                label={t.equalExpense}
                selected={mode === 'equal'}
                disabled={busy || !context.capabilities.equal}
                onPress={() => {
                  setMode('equal');
                  setPrepared(null);
                }}
              />
              {!context.capabilities.equal && <Notice>{t.expenseWebOnly}</Notice>}
              {mode === 'equal' && (
                <>
                  <TextField
                    testID="expense-maintain-amount"
                    inputRef={amount}
                    label={t.amountTwd}
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
              {mode === 'equal' && (
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
                  {mode === 'equal' && (
                    <>
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
                <DetailRow
                  key={s.userId}
                  label={memberLabel(s.userId, s.displayName)}
                  value={f.money(s.shareAmount)}
                />
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
