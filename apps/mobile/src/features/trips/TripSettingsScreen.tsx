import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, TextInput } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import {
  tripSettingsSchema,
  type TripSettings,
  type TripUpdateInput,
  type TripArchiveInput,
} from '@/api/contracts';
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
import { LocalRateLimitError } from '@/features/expenses/entry';
import { refreshManagedTrip } from './managementRefresh';
import {
  prepareTripSettings,
  restoreSettings,
  settingsFields,
  settingsChanges,
  type TripSettingsFields,
} from './settingsForm';

const fieldOrder = [
  'name',
  'description',
  'start',
  'end',
  'destination',
  'address',
  'latitude',
  'longitude',
] as const;

type Prepared =
  | { operation: 'trip.update'; body: Omit<TripUpdateInput, 'client_request_id'> }
  | { operation: 'trip.archive'; body: Omit<TripArchiveInput, 'client_request_id'> };
export function TripSettingsScreen({ tripId, source }: { tripId: string; source?: string }) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const t = useMessages();
  const online = useOnline();
  const navigation = useNavigation();
  const client = useQueryClient();
  const [context, setContext] = useState<TripSettings | null>(null);
  const [latest, setLatest] = useState<TripSettings | null>(null);
  const [fields, setFields] = useState<TripSettingsFields | null>(null);
  const [initial, setInitial] = useState<TripSettingsFields | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const flight = useRef(false);
  const generation = useRef(0);
  const refs = {
    name: useRef<TextInput>(null),
    description: useRef<TextInput>(null),
    start: useRef<TextInput>(null),
    end: useRef<TextInput>(null),
    destination: useRef<TextInput>(null),
    address: useRef<TextInput>(null),
    latitude: useRef<TextInput>(null),
    longitude: useRef<TextInput>(null),
  };
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
      `/trips/${tripId}/settings`,
      tripSettingsSchema,
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
    let start = settingsFields(data);
    if (source) {
      const previous = await (await openMutationStore()).get(scope!, source);
      beforeSend();
      if (
        previous?.status === 'completed' &&
        previous.result?.status === 'rejected' &&
        previous.payload?.operation === 'trip.update' &&
        previous.tripId === tripId
      )
        start = restoreSettings(data, previous.payload.body.changes);
    }
    if (v !== generation.current) return;
    setContext(data);
    setFields(start);
    setInitial(settingsFields(data));
    setLatest(null);
    setPrepared(null);
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
    // The route is keyed by environment/account/trip/source; locale updates never reset input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = (key: keyof TripSettingsFields, value: string) => {
    setFields((old) => old && { ...old, [key]: value });
    setPrepared(null);
  };
  const check = (archive: boolean) =>
    run(async (beforeSend, v) => {
      if (!context || !fields) return;
      setPrepared(null);
      if (archive) {
        const data = await read(beforeSend);
        if (v !== generation.current) return;
        if (data.archiveRevision !== context.archiveRevision) {
          setLatest(data);
          setError(t.tripSettingsChanged);
          return;
        }
        setPrepared({
          operation: 'trip.archive',
          body: { expected_revision: data.archiveRevision, archived: !data.archived },
        });
      } else {
        let next;
        try {
          next = await prepareTripSettings(
            (...args) => manager.requestAs(...args),
            scope!.accountId,
            tripId,
            context,
            fields,
            beforeSend
          );
        } catch (failure) {
          if (failure instanceof ApiError) throw failure;
          setError(t.invalidTripSettings);
          refs.name.current?.focus();
          return;
        }
        if (v !== generation.current) return;
        if (!next.body) {
          setLatest(next.current);
          setError(t.tripSettingsChanged);
          return;
        }
        setPrepared({ operation: 'trip.update', body: next.body });
      }
      Keyboard.dismiss();
    });
  const submit = () =>
    run(async (_beforeSend, v) => {
      if (!prepared || !scope) return;
      const outcome = await entry.confirm(scope, { ...prepared, tripId });
      if (v !== generation.current || !current()) return;
      if (outcome.kind === 'completed') {
        setPrepared(null);
        if (outcome.result.status === 'committed') {
          setDone(true);
          setRefreshFailed(outcome.refreshed === false);
        } else {
          setError(t.tripSettingsChanged);
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
  const detail = (data: TripSettings) => (
    <Card>
      <DetailRow label={t.tripName} value={data.name} />
      <DetailRow label={t.tripDescription} value={data.description || t.notSet} />
      <DetailRow label={t.startDate} value={data.startDate || t.notSet} />
      <DetailRow label={t.endDate} value={data.endDate || t.notSet} />
      <DetailRow label={t.tripDestination} value={data.destination?.display_name || t.notSet} />
      <Copy>{data.archived ? t.archived : t.tripNotArchived}</Copy>
    </Card>
  );
  return (
    <FormPage
      title={t.tripSettings}
      backLabel={t.backShort}
      backTestID="trip-settings-back"
      busy={busy}
      onBack={() => goBack({ pathname: '/trips/[id]', params: { id: tripId } })}
    >
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!!error && <Notice tone="warning">{error}</Notice>}
      {!context && visible && (
        <Action
          testID="settings-load"
          label={busy ? t.loading : t.retry}
          busy={busy}
          disabled={!online}
          onPress={() => void run(load)}
        />
      )}
      {!visible && <Notice tone="danger">{t.notFound}</Notice>}
      {done && visible && (
        <>
          <Notice tone="success">{t.operationDone}</Notice>
          {refreshFailed && (
            <>
              <Notice tone="warning">{t.staleData}</Notice>
              <Action
                label={t.refresh}
                busy={busy}
                disabled={!online}
                onPress={() =>
                  void run(async (beforeSend) => {
                    await refreshManagedTrip(client, manager, catalog, scope!, tripId);
                    beforeSend();
                    setRefreshFailed(false);
                  })
                }
              />
            </>
          )}
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
          <Copy>{context.role === 'admin' ? t.tripSettingsHint : t.tripAdminOnly}</Copy>
          {context.role !== 'admin' ? (
            detail(context)
          ) : (
            <Section title={t.tripDetails}>
              {fieldOrder.map((key, i, keys) => (
                <TextField
                  key={key}
                  inputRef={refs[key]}
                  testID={`settings-${key}`}
                  label={
                    t[
                      (
                        {
                          name: 'tripName',
                          description: 'tripDescription',
                          start: 'startDate',
                          end: 'endDate',
                          destination: 'tripDestination',
                          address: 'destinationAddress',
                          latitude: 'latitude',
                          longitude: 'longitude',
                        } as const
                      )[key]
                    ]
                  }
                  value={fields[key]}
                  editable={!busy}
                  onChangeText={(value) => change(key, value)}
                  multiline={key === 'description'}
                  maxLength={
                    key === 'name'
                      ? 100
                      : key === 'description' || key === 'address'
                        ? 2000
                        : key === 'start' || key === 'end'
                          ? 10
                          : key === 'destination'
                            ? 300
                            : 30
                  }
                  placeholder={key === 'start' || key === 'end' ? t.dateFormatHint : undefined}
                  autoCapitalize={
                    key === 'start' || key === 'end' || key === 'latitude' || key === 'longitude'
                      ? 'none'
                      : 'sentences'
                  }
                  returnKeyType={i === keys.length - 1 ? 'done' : 'next'}
                  submitBehavior="submit"
                  onSubmitEditing={() =>
                    i === keys.length - 1 ? Keyboard.dismiss() : refs[keys[i + 1]].current?.focus()
                  }
                />
              ))}
              <Copy>{t.destinationCoordinatesHint}</Copy>
              <Action
                testID="settings-clear-location"
                variant="ghost"
                label={t.clearDestination}
                disabled={busy}
                onPress={() => {
                  setFields(
                    (old) =>
                      old && { ...old, destination: '', address: '', latitude: '', longitude: '' }
                  );
                  setPrepared(null);
                }}
              />
              <Action
                testID="settings-review"
                label={t.reviewExpenseChangesAction}
                busy={busy}
                disabled={!online || !dirty || !!latest}
                onPress={() => void check(false)}
              />
            </Section>
          )}
          {(dirty || latest) && (
            <Action
              testID="settings-discard-changes"
              variant="ghost"
              label={t.discardTripChanges}
              disabled={busy}
              onPress={() => {
                const current = latest ?? context;
                setContext(current);
                setFields(settingsFields(current));
                setInitial(settingsFields(current));
                setLatest(null);
                setPrepared(null);
                setError('');
              }}
            />
          )}
          <Action
            testID="settings-currency"
            variant="secondary"
            label={t.currencySettings}
            disabled={busy || dirty || !!prepared}
            onPress={() =>
              router.push({ pathname: '/trips/[id]/currency-settings', params: { id: tripId } })
            }
          />
          <Section title={t.personalArchive}>
            <Copy>{t.personalArchiveHint}</Copy>
            {dirty && <Copy>{t.archiveFinishEdits}</Copy>}
            <Action
              testID="settings-archive"
              variant="secondary"
              label={context.archived ? t.unarchiveTrip : t.archiveTrip}
              busy={busy}
              disabled={!online || !!latest || dirty}
              onPress={() => void check(true)}
            />
          </Section>
          {latest && (
            <Section title={t.latestExpense}>
              {detail(latest)}
              <Action
                testID="settings-reconfirm"
                label={t.tripSettingsReconfirm}
                disabled={busy}
                onPress={() => {
                  try {
                    const changes =
                      context.role === 'admin' && dirty ? settingsChanges(context, fields) : null;
                    setFields(changes ? restoreSettings(latest, changes) : settingsFields(latest));
                  } catch {
                    setError(t.invalidTripSettings);
                    return;
                  }
                  setContext(latest);
                  setInitial(settingsFields(latest));
                  setLatest(null);
                  setPrepared(null);
                  setError('');
                }}
              />
            </Section>
          )}
          {prepared && (
            <Section title={t.confirmExpenseEdit}>
              {prepared.operation === 'trip.update' ? (
                detail({
                  ...context,
                  ...prepared.body.changes,
                  name: fields.name.trim(),
                  description: fields.description.trim(),
                  startDate: fields.start || null,
                  endDate: fields.end || null,
                  destination:
                    prepared.body.changes.destination_location === undefined
                      ? context.destination
                      : prepared.body.changes.destination_location,
                })
              ) : (
                <Copy>{prepared.body.archived ? t.archiveTrip : t.unarchiveTrip}</Copy>
              )}
              <Action
                testID="settings-confirm"
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
