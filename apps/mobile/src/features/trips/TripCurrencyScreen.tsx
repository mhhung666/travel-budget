import { baseCurrency } from '@/api/ledger';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Keyboard } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import {
  tripCurrencyContextSchema,
  referenceRatesSchema,
  type TripCurrencyContext,
  type TripCurrencyInput,
  type ReferenceRates,
} from '@/api/contracts';
import { FormPage } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { Action, Card, Chip, Copy, DetailRow, Notice, Section, TextField } from '@/components/ui';
import { ApiError } from '@/api/client';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useOnline } from '@/providers/useOnline';
import { useMessages } from '@/i18n/useMessages';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { expenseReadGuard, expenseReadWait } from '@/features/expenses/readGuard';
import { currencyFields, currencySettings, type CurrencyFields } from './currencyForm';

export function TripCurrencyScreen({ tripId, source }: { tripId: string; source?: string }) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const online = useOnline();
  const navigation = useNavigation();
  const [context, setContext] = useState<TripCurrencyContext | null>(null);
  const t = useMessages(baseCurrency(context));
  const [latest, setLatest] = useState<TripCurrencyContext | null>(null);
  const [fields, setFields] = useState<CurrencyFields | null>(null);
  const [initial, setInitial] = useState<CurrencyFields | null>(null);
  const [prepared, setPrepared] = useState<
    (Omit<TripCurrencyInput, 'client_request_id'> & { base_currency?: string }) | null
  >(null);
  const [rates, setRates] = useState<ReferenceRates | null>(null);
  const [ratesError, setRatesError] = useState(false);
  const [search, setSearch] = useState('');
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
      `/trips/${tripId}/currency-settings`,
      tripCurrencyContextSchema,
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
    let start = currencyFields(data);
    if (source) {
      const previous = await (await openMutationStore()).get(scope!, source);
      beforeSend();
      if (
        previous?.status === 'completed' &&
        previous.result?.status === 'rejected' &&
        previous.payload?.operation === 'trip.currency' &&
        previous.tripId === tripId
      )
        start = currencyFields({ ...data, settings: previous.payload.body.settings });
    }
    if (v !== generation.current) return;
    setContext(data);
    setFields(start);
    setInitial(currencyFields(data));
    setLatest(null);
    setPrepared(null);
  }
  async function loadRates(beforeSend: () => void, v: number) {
    setRates(null);
    setRatesError(false);
    try {
      const data = await manager.requestAs(
        scope!.accountId,
        `/trips/${encodeURIComponent(tripId)}/exchange-rates`,
        referenceRatesSchema,
        { beforeSend }
      );
      beforeSend();
      if (context && baseCurrency(data) !== baseCurrency(context))
        throw new ApiError('LEDGER_CURRENCY_MISMATCH');
      if (v === generation.current) setRates(data);
    } catch (failure) {
      if (v === generation.current && current()) setRatesError(true);
      throw failure;
    }
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
  function change(next: CurrencyFields) {
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
      if (!context || !fields || context.role !== 'admin') return;
      let settings;
      try {
        settings = currencySettings(fields, context.supportedCurrencies, baseCurrency(context));
      } catch {
        setError(t.invalidCurrencySettings);
        return;
      }
      const reviewGuard = () => {
        if (reviewVersion !== reviewGeneration.current) throw new ApiError('CANCELLED');
        beforeSend();
      };
      const data = await read(reviewGuard);
      if (v !== generation.current || reviewVersion !== reviewGeneration.current) return;
      if (data.role !== 'admin' || data.revision !== context.revision) {
        setLatest(data);
        setError(t.currencyChanged);
        return;
      }
      setPrepared({
        base_currency: baseCurrency(data),
        expected_revision: data.revision,
        settings,
      });
      Keyboard.dismiss();
    });
  };
  const submit = () =>
    run(async (_beforeSend, v) => {
      if (!prepared || !scope) return;
      const outcome = await entry.confirm(scope, {
        operation: 'trip.currency',
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
          setError(t.currencyChanged);
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
  const detail = (data: TripCurrencyContext['settings']) => (
    <Card>
      <DetailRow
        label={t.defaultCurrency}
        value={data?.default_currency ?? baseCurrency(context)}
      />
      {!data?.currencies.length && <Copy>{t.currencyEmpty}</Copy>}
      {data?.currencies.map((c) => (
        <DetailRow
          key={c.code}
          label={c.code}
          value={
            c.code === baseCurrency(context)
              ? '1'
              : c.rate == null
                ? t.referenceRate
                : String(c.rate)
          }
        />
      ))}
    </Card>
  );
  const canEdit = context?.role === 'admin' && latest?.role !== 'member';
  return (
    <FormPage
      title={t.currencySettings}
      backLabel={t.backShort}
      backTestID="currency-back"
      busy={busy}
      onBack={() => goBack({ pathname: '/trips/[id]/settings', params: { id: tripId } })}
    >
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!!error && <Notice tone="warning">{error}</Notice>}
      {!visible && <Notice tone="danger">{t.notFound}</Notice>}
      {!context && visible && (
        <Action
          testID="currency-load"
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
          <Copy>{t.currencyHint}</Copy>
          {!canEdit ? (
            <>
              <Copy>{t.currencyAdminOnly}</Copy>
              {detail(latest?.settings ?? context.settings)}
            </>
          ) : (
            <>
              <Section title={t.commonCurrencies}>
                <TextField
                  testID="currency-search"
                  label={t.searchCurrency}
                  value={search}
                  editable={!busy}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  onChangeText={setSearch}
                />
                <Copy>{t.currencySearchHint}</Copy>
                {context.supportedCurrencies
                  .filter(
                    (code) =>
                      !fields.rows.some((c) => c.code === code) &&
                      (search.trim()
                        ? code.includes(search.trim().toUpperCase())
                        : [
                            baseCurrency(context),
                            'JPY',
                            'USD',
                            'EUR',
                            'HKD',
                            'THB',
                            'KRW',
                            'CNY',
                            'GBP',
                            'SGD',
                            'AUD',
                            'MYR',
                            'VND',
                            'PHP',
                            'IDR',
                          ].includes(code))
                  )
                  .map((code) => (
                    <Chip
                      key={code}
                      testID={`currency-add-${code}`}
                      label={code}
                      selected={false}
                      disabled={busy || fields.rows.length >= 30}
                      onPress={() =>
                        change({ ...fields, rows: [...fields.rows, { code, rate: '' }] })
                      }
                    />
                  ))}
                {!fields.rows.length && <Copy>{t.currencyEmpty}</Copy>}
                {fields.rows.map((row) => (
                  <Card key={row.code}>
                    <Copy>{row.code}</Copy>
                    {row.code === baseCurrency(context) ? (
                      <Copy>{t.currencyBaseHint}</Copy>
                    ) : (
                      <>
                        <TextField
                          testID={`currency-rate-${row.code}`}
                          label={`${row.code} · ${t.customRate}`}
                          value={row.rate}
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                          editable={!busy}
                          maxLength={60}
                          onChangeText={(rate) =>
                            change({
                              ...fields,
                              rows: fields.rows.map((c) =>
                                c.code === row.code ? { ...c, rate } : c
                              ),
                            })
                          }
                        />
                        <Copy>{t.customRateHint}</Copy>
                      </>
                    )}
                    <Action
                      testID={`currency-remove-${row.code}`}
                      label={`${t.removeCurrency} (${row.code})`}
                      variant="ghost"
                      disabled={busy}
                      onPress={() =>
                        change({
                          defaultCurrency:
                            fields.defaultCurrency === row.code
                              ? baseCurrency(context)
                              : fields.defaultCurrency,
                          rows: fields.rows.filter((c) => c.code !== row.code),
                        })
                      }
                    />
                  </Card>
                ))}
              </Section>
              <Section title={t.defaultCurrency}>
                {Array.from(
                  new Set([
                    baseCurrency(context),
                    fields.defaultCurrency,
                    ...fields.rows.map((c) => c.code),
                  ])
                ).map((code) => (
                  <Chip
                    key={code}
                    testID={`currency-default-${code}`}
                    label={code}
                    selected={fields.defaultCurrency === code}
                    disabled={busy}
                    onPress={() => change({ ...fields, defaultCurrency: code })}
                  />
                ))}
              </Section>
              <Action
                testID="currency-review"
                label={t.reviewExpenseChangesAction}
                busy={busy}
                disabled={!online || !dirty || !!latest}
                onPress={() => void review()}
              />
            </>
          )}
          <Section title={t.referenceRate}>
            {(canEdit ? fields.rows : ((latest ?? context).settings?.currencies ?? []))
              .filter((row) => row.code !== baseCurrency(context))
              .map((row) => (
                <Card key={row.code}>
                  <DetailRow
                    label={row.code}
                    value={
                      rates?.rates[row.code] == null
                        ? t.rateUnavailable
                        : String(rates.rates[row.code])
                    }
                  />
                  {rates?.dates[row.code] && (
                    <DetailRow label={t.ratePublished} value={rates.dates[row.code]} />
                  )}
                </Card>
              ))}
            {rates && <DetailRow label={t.rateProvider} value={rates.provider} />}
          </Section>
          <Copy>{t.referenceRateHint}</Copy>
          {ratesError && <Notice tone="warning">{t.rateLoadFailed}</Notice>}
          <Action
            testID="currency-reference"
            label={t.loadReferenceRates}
            variant="secondary"
            busy={busy}
            disabled={!online}
            onPress={() => void run(loadRates)}
          />
          {(dirty || latest) && (
            <Action
              testID="currency-discard"
              label={t.discardTripChanges}
              variant="ghost"
              disabled={busy}
              onPress={() => {
                const data = latest ?? context;
                setContext(data);
                setFields(currencyFields(data));
                setInitial(currencyFields(data));
                setLatest(null);
                setPrepared(null);
                setError('');
              }}
            />
          )}
          {latest && (
            <Section title={t.latestExpense}>
              {detail(latest.settings)}
              <Action
                testID="currency-reconfirm"
                label={t.tripSettingsReconfirm}
                disabled={busy || latest.role !== 'admin'}
                onPress={() => {
                  setContext(latest);
                  setInitial(currencyFields(latest));
                  setLatest(null);
                  setPrepared(null);
                  setError('');
                }}
              />
            </Section>
          )}
          {prepared && (
            <Section title={t.confirmExpenseEdit}>
              {detail(prepared.settings)}
              <Action
                testID="currency-confirm"
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
    </FormPage>
  );
}
