import { expenseCategories } from '@/api/contracts';
import { categoryLabel } from '@/features/expenses/rows';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { baseCurrency } from '@/api/ledger';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, InputAccessoryView, Platform } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import { budgetContextV2Schema, type BudgetContext, type BudgetInput } from '@/api/contracts';
import { FormPage } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { Action, Card, Copy, DetailRow, Notice, Section, TextField } from '@/components/ui';
import { ApiError } from '@/api/client';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useOnline } from '@/providers/useOnline';
import { useMessages } from '@/i18n/useMessages';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { expenseReadGuard, expenseReadWait } from '@/features/expenses/readGuard';
import { budgetForm, budgetValues, rebaseBudget, type BudgetForm } from './budgetForm';

export function BudgetScreen({ tripId, source }: { tripId: string; source?: string }) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const online = useOnline();
  const navigation = useNavigation();
  const [context, setContext] = useState<BudgetContext | null>(null);
  const t = useMessages(baseCurrency(context));
  const f = useDisplayFormat(baseCurrency(context));
  const accessory = 'budget-keyboard-done';
  const label = (category: string) => {
    const code = expenseCategories.find((c) => c === category);
    return code ? categoryLabel(code, t) : category;
  };
  const [latest, setLatest] = useState<BudgetContext | null>(null);
  const [fields, setFields] = useState<BudgetForm | null>(null);
  const [initial, setInitial] = useState<BudgetForm | null>(null);
  const [prepared, setPrepared] = useState<Omit<BudgetInput, 'client_request_id'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const flight = useRef(false);
  const generation = useRef(0);
  const reviewGeneration = useRef(0);
  const unsavedWait = useRef(0);
  const version = manager.getSignInVersion();
  const current = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    scope.environment === manager.api.environment;
  const visible = current() && !!scope && catalog.isVisible(scope, tripId);
  const dirty = !!fields && JSON.stringify(fields) !== JSON.stringify(initial);
  usePreventRemove(dirty && !busy && !done && !pending, ({ data }) =>
    Alert.alert(t.leaveFormTitle, t.unsavedTrip, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  );
  async function guard() {
    if (!scope || !current()) throw new ApiError('CANCELLED');
    return expenseReadGuard(manager, catalog, scope, tripId, unsavedWait.current);
  }

  async function fail(failure: unknown, v: number) {
    if (v !== generation.current || !current()) return;
    const wait = expenseReadWait(failure);
    if (wait && scope) {
      unsavedWait.current = Math.max(unsavedWait.current, wait);
      try {
        await (await openMutationStore()).pause(scope, unsavedWait.current);
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
      `/trips/${tripId}/budget`,
      budgetContextV2Schema,
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
    let start = budgetForm(data.budget);
    if (source && !context) {
      const previous = await (await openMutationStore()).get(scope!, source);
      beforeSend();
      if (
        previous?.status === 'completed' &&
        previous.result?.status === 'rejected' &&
        previous.payload?.operation === 'budget.set' &&
        previous.tripId === tripId
      )
        start = budgetForm(previous.payload.body);
    }
    if (v !== generation.current) return;
    setContext(data);
    setFields(start);
    setInitial(budgetForm(data.budget));
    setLatest(null);
    setPrepared(null);
  }
  useEffect(() => {
    const lifetime = ++generation.current;
    void run(load);
    const connection = onlineManager.subscribe((connected) => {
      if (!connected) invalidateReview();
    });
    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active') invalidateReview();
    });
    return () => {
      generation.current = lifetime + 1;
      connection();
      background.remove();
    };
    // Route keyed by environment/account/trip/source; locale changes keep input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function invalidateReview() {
    reviewGeneration.current++;
    setPrepared(null);
  }
  function change(next: BudgetForm) {
    setFields(next);
    invalidateReview();
  }
  const review = () => {
    if (flight.current || !online || !visible) return;
    // Capture the click before run awaits SQLite, not when its task finally starts.
    invalidateReview();
    const reviewVersion = reviewGeneration.current;
    return run(async (beforeSend, v) => {
      if (reviewVersion !== reviewGeneration.current) return;
      if (!context || !fields) return;
      let settings;
      try {
        settings = budgetValues(fields);
      } catch {
        setError(t.invalidBudget);
        return;
      }
      const reviewGuard = () => {
        if (reviewVersion !== reviewGeneration.current) throw new ApiError('CANCELLED');
        beforeSend();
      };
      const data = await read(reviewGuard);
      if (v !== generation.current || reviewVersion !== reviewGeneration.current) return;
      if (data.revision !== context.revision || baseCurrency(data) !== baseCurrency(context)) {
        setLatest(data);
        setError(t.budgetChanged);
        return;
      }
      setPrepared({
        base_currency: baseCurrency(data),
        expected_revision: data.revision,
        ...settings,
      });
      Keyboard.dismiss();
    });
  };
  const submit = () => {
    const reviewVersion = reviewGeneration.current;
    return run(async (_beforeSend, v) => {
      if (!prepared || !scope || reviewVersion !== reviewGeneration.current) return;
      const outcome = await entry.confirm(scope, {
        operation: 'budget.set',
        tripId,
        body: prepared,
      });
      if (v !== generation.current || !current()) return;
      if (outcome.kind === 'completed') {
        setPrepared(null);
        if (outcome.result.status === 'committed') {
          setDone(true);
          setRefreshFailed(outcome.refreshed === false);
        } else {
          setError(t.budgetChanged);
          const beforeSend = await guard();
          beforeSend();
          const data = await read(beforeSend);
          if (v === generation.current) setLatest(data);
        }
      } else if (outcome.kind === 'pending') {
        setPending(true);
        setPrepared(null);
        setError(t.operationUnknown);
      } else setError(outcome.kind === 'blocked' ? t.operationBlocked : t.operationNotSent);
    });
  };
  const detail = (data: BudgetContext['budget']) => (
    <Card>
      <DetailRow
        label={t.budgetTotal}
        value={data?.total == null ? t.notSet : f.money(data.total)}
      />
      {data?.categories.map((c) => (
        <DetailRow
          key={c.category}
          label={categoryLabel(c.category, t)}
          value={f.money(c.amount)}
        />
      ))}
    </Card>
  );
  const progress = (
    label: string,
    spent: number,
    limit: number | null,
    remaining: number | null
  ) => (
    <Card key={label}>
      <Copy>{label}</Copy>
      <DetailRow label={t.mySpent} value={f.money(spent)} />
      <DetailRow label={t.budgetLimit} value={limit == null ? t.notSet : f.money(limit)} />
      {remaining !== null && (
        <Notice tone={remaining < 0 ? 'warning' : 'info'}>
          {remaining < 0 ? t.budgetOver : t.budgetRemaining}: {f.money(Math.abs(remaining))}
        </Notice>
      )}
    </Card>
  );
  const field = (
    id: string,
    label: string,
    value: string,
    onChangeText: (text: string) => void
  ) => (
    <TextField
      key={id}
      testID={id}
      label={`${label} (${baseCurrency(context)})`}
      value={value}
      editable={!busy}
      keyboardType="decimal-pad"
      inputAccessoryViewID={accessory}
      returnKeyType="done"
      onSubmitEditing={Keyboard.dismiss}
      maxLength={32}
      onChangeText={onChangeText}
    />
  );
  return (
    <FormPage
      title={t.personalBudget}
      backLabel={t.backShort}
      backTestID="budget-back"
      busy={busy}
      onBack={() => goBack({ pathname: '/trips/[id]', params: { id: tripId } })}
    >
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!!error && <Notice tone="warning">{error}</Notice>}
      {!visible && <Notice tone="danger">{t.notFound}</Notice>}
      {!context && visible && (
        <Action
          testID="budget-load"
          label={busy ? t.loading : t.retry}
          busy={busy}
          disabled={!online}
          onPress={() => void run(load)}
        />
      )}
      {done && visible && (
        <>
          <Notice tone="success">{t.operationDone}</Notice>
          {refreshFailed && <Notice tone="warning">{t.staleData}</Notice>}
          <Action
            label={t.openTrip}
            onPress={() => router.dismissTo({ pathname: '/trips/[id]', params: { id: tripId } })}
          />
        </>
      )}
      {pending && (
        <Action label={t.pendingOperations} onPress={() => router.replace('/trips/operations')} />
      )}
      {context && fields && visible && !done && !pending && (
        <>
          <Copy>{t.budgetPrivateHint}</Copy>
          <Section title={t.budgetProgress}>
            {progress(
              t.budgetTotal,
              context.progress.totalSpent,
              context.progress.total,
              context.progress.remaining
            )}
            {context.progress.categories.map((c) =>
              progress(label(c.category), c.spent, c.budget, c.remaining)
            )}
          </Section>
          <Copy>{t.budgetProgressHint}</Copy>
          <Action
            testID="budget-refresh"
            label={t.refresh}
            disabled={!online || dirty || busy}
            onPress={() => void run(load)}
          />
          <Section title={t.editBudget}>
            <Copy>{t.budgetInputHint}</Copy>
            {field('budget-total', t.budgetTotal, fields.total, (total) =>
              change({ ...fields, total })
            )}
            <Section title={t.categoryBudgets}>
              {expenseCategories.map((category) =>
                field(
                  `budget-category-${category}`,
                  categoryLabel(category, t),
                  fields.categories[category] ?? '',
                  (value) =>
                    change({ ...fields, categories: { ...fields.categories, [category]: value } })
                )
              )}
            </Section>
            <Action
              testID="budget-clear"
              variant="ghost"
              label={t.clearBudget}
              disabled={busy}
              onPress={() => change({ total: '', categories: {} })}
            />
            <Action
              testID="budget-review"
              label={t.reviewExpenseChangesAction}
              busy={busy}
              disabled={!online || !dirty || !!latest}
              onPress={() => void review()}
            />
          </Section>
          {(dirty || latest) && (
            <Action
              testID="budget-discard"
              variant="ghost"
              label={t.discardTripChanges}
              disabled={busy}
              onPress={() => {
                const data = latest ?? context;
                setContext(data);
                setFields(budgetForm(data.budget));
                setInitial(budgetForm(data.budget));
                setLatest(null);
                invalidateReview();
                setError('');
              }}
            />
          )}
          {latest && (
            <Section title={t.latestExpense}>
              {detail(latest.budget)}
              <Action
                testID="budget-reconfirm"
                label={t.tripSettingsReconfirm}
                disabled={busy}
                onPress={() => {
                  setFields(rebaseBudget(context.budget, fields, latest.budget));
                  setContext(latest);
                  setInitial(budgetForm(latest.budget));
                  setLatest(null);
                  invalidateReview();
                  setError('');
                }}
              />
            </Section>
          )}
          {prepared && (
            <Section title={t.confirmExpenseEdit}>
              <Copy>{t.budgetBefore}</Copy>
              {detail(context.budget)}
              <Copy>{t.budgetAfter}</Copy>
              {detail(prepared)}
              <Action
                testID="budget-confirm"
                label={t.confirmExpenseEdit}
                busy={busy}
                disabled={!online}
                onPress={() => void submit()}
              />
            </Section>
          )}
        </>
      )}
      <Action
        variant="ghost"
        label={t.pendingOperations}
        onPress={() => router.push('/trips/operations')}
      />
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={accessory}>
          <Action label={t.done} onPress={Keyboard.dismiss} />
        </InputAccessoryView>
      )}
    </FormPage>
  );
}
