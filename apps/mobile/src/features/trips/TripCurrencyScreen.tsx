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
} from '@travel-budget/contracts';
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
import { LocalRateLimitError } from '@/features/expenses/entry';
import { currencyFields, currencySettings, type CurrencyFields } from './currencyForm';

export function TripCurrencyScreen({ tripId, source }: { tripId: string; source?: string }) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const t = useMessages();
  const online = useOnline();
  const navigation = useNavigation();
  const [context, setContext] = useState<TripCurrencyContext | null>(null);
  const [latest, setLatest] = useState<TripCurrencyContext | null>(null);
  const [fields, setFields] = useState<CurrencyFields | null>(null);
  const [initial, setInitial] = useState<CurrencyFields | null>(null);
  const [prepared, setPrepared] = useState<Omit<TripCurrencyInput, 'client_request_id'> | null>(
    null
  );
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
  const version = manager.getSignInVersion();
  const current = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    scope.environment === manager.api.baseUrl;
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
    const captured = catalog.captureAccess(scope);
    const store = await openMutationStore();
    await store.retryAt(scope);
    return () => {
      if (!current() || !onlineManager.isOnline() || AppState.currentState !== 'active')
        throw new ApiError('CANCELLED');
      captured(tripId);
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
        '/exchange-rates',
        referenceRatesSchema,
        { beforeSend }
      );
      beforeSend();
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
    // Route keyed by environment/account/trip/source; locale changes keep input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function change(next: CurrencyFields) {
    setFields(next);
    setPrepared(null);
  }
  const review = () =>
    run(async (beforeSend, v) => {
      if (!context || !fields || context.role !== 'admin') return;
      setPrepared(null);
      let settings;
      try {
        settings = currencySettings(fields, context.supportedCurrencies);
      } catch {
        setError(t.invalidCurrencySettings);
        return;
      }
      const data = await read(beforeSend);
      if (v !== generation.current) return;
      if (data.role !== 'admin' || data.revision !== context.revision) {
        setLatest(data);
        setError(t.currencyChanged);
        return;
      }
      setPrepared({ expected_revision: data.revision, settings });
      Keyboard.dismiss();
    });
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
      <DetailRow label={t.defaultCurrency} value={data?.default_currency ?? 'TWD'} />
      {!data?.currencies.length && <Copy>{t.currencyEmpty}</Copy>}
      {data?.currencies.map((c) => (
        <DetailRow
          key={c.code}
          label={c.code}
          value={c.code === 'TWD' ? '1' : c.rate == null ? t.referenceRate : String(c.rate)}
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
                            'TWD',
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
                    {row.code === 'TWD' ? (
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
                        <DetailRow
                          label={t.referenceRate}
                          value={
                            rates?.rates[row.code] == null
                              ? t.rateUnavailable
                              : String(rates.rates[row.code])
                          }
                        />
                        {rates?.dates[row.code] && (
                          <DetailRow label={t.ratePublished} value={rates.dates[row.code]} />
                        )}
                        {rates && <DetailRow label={t.rateProvider} value={rates.provider} />}
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
                            fields.defaultCurrency === row.code ? 'TWD' : fields.defaultCurrency,
                          rows: fields.rows.filter((c) => c.code !== row.code),
                        })
                      }
                    />
                  </Card>
                ))}
              </Section>
              <Section title={t.defaultCurrency}>
                {Array.from(
                  new Set(['TWD', fields.defaultCurrency, ...fields.rows.map((c) => c.code)])
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
