import { ZodError } from 'zod';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import type { ItineraryEditContext } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { FormPage } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { Action, Card, Copy, DetailRow, Notice, Section, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useOnline } from '@/providers/useOnline';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { dayRejection, itineraryMessages } from '@/i18n/itineraryMessages';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { readItineraryEditContext } from './editContext';
import {
  dayFields,
  prepareDay,
  restoreDayFields,
  sameDaySnapshot,
  DayFormError,
  type DayFields,
  type DayCommand,
} from './dayForm';

export function DayEditorScreen(props: {
  tripId: string;
  dayId?: string;
  remove?: boolean;
  source?: string;
}) {
  const { manager, user, status } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return (
    <DayEditor
      key={JSON.stringify([manager.api.environment, user.id, manager.getSignInVersion(), props])}
      {...props}
    />
  );
}
function DayEditor({
  tripId,
  dayId,
  remove = false,
  source,
}: {
  tripId: string;
  dayId?: string;
  remove?: boolean;
  source?: string;
}) {
  const { entry, scope, records, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const copy = itineraryMessages[useAppLocale()];
  const t = useMessages();
  const navigation = useNavigation();
  const online = useOnline();
  const [version] = useState(() => manager.getSignInVersion());
  const mounted = useRef(true);
  const flight = useRef(false);
  const inputRevision = useRef(0);
  const preparedRevision = useRef(-1);
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<ItineraryEditContext | null>(null);
  const [latest, setLatest] = useState<ItineraryEditContext | null>(null);
  const [fields, setFields] = useState<DayFields | null>(null);
  const [initial, setInitial] = useState<DayFields | null>(null);
  const [prepared, setPrepared] = useState<DayCommand | null>(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const sameOwner = () =>
    !!scope &&
    manager.getSignInVersion() === version &&
    manager.api.environment === scope.environment &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId;
  const current = () => mounted.current && sameOwner();
  const visible = sameOwner() && !!scope && catalog.isVisible(scope, tripId);
  const pending = records.data?.find((r) => r.tripId === tripId && r.status === 'pending');
  const terminal = requestId
    ? records.data?.find((r) => r.clientRequestId === requestId)?.result
    : null;
  const completed = done || terminal?.status === 'committed';
  const dirty = !!fields && JSON.stringify(fields) !== JSON.stringify(initial);
  const frozen = busy || !!pending || submitted || done;
  const day = context?.days.find((d) => d.id === dayId);
  const latestDay = latest?.days.find((d) => d.id === dayId);
  const missing = !!context && !!dayId && !day;
  const ready =
    visible &&
    online &&
    !forbidden &&
    !frozen &&
    !missing &&
    !!context &&
    !!fields &&
    !!records.data &&
    !records.isPending &&
    !records.isError &&
    !records.isFetching;
  const latestState = useRef({ ready, frozen });
  useLayoutEffect(() => {
    latestState.current = { ready, frozen };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  usePreventRemove(visible && (busy || (dirty && !submitted && !done)), ({ data }) => {
    if (!current() || flight.current) return;
    Alert.alert(t.leaveFormTitle, copy.unsaved, [
      { text: t.stayForm, style: 'cancel' },
      {
        text: t.leaveForm,
        style: 'destructive',
        onPress: () => {
          if (current() && !flight.current) navigation.dispatch(data.action);
        },
      },
    ]);
  });
  async function read() {
    const access = catalog.captureAccess(scope!);
    return readItineraryEditContext({
      store: openMutationStore,
      scope: scope!,
      tripId,
      request: (...args) => manager.requestAs(...args),
      guard: () => {
        if (
          !current() ||
          !onlineManager.isOnline() ||
          AppState.currentState !== 'active' ||
          !catalog.isVisible(scope!, tripId)
        )
          throw new ApiError('CANCELLED');
        access(tripId);
      },
      deny: () => catalog.deny(scope!, tripId),
    });
  }
  async function run(task: () => Promise<void>) {
    if (flight.current || !current() || !visible || !online) return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      if (current()) {
        if (failure instanceof ApiError && failure.status === 403) {
          setForbidden(true);
          setPrepared(null);
          setContext(null);
          setLatest(null);
        }
        setError(
          failure instanceof DayFormError
            ? dayRejection(failure.code, copy)
            : failure instanceof ApiError
              ? failure.status === 403
                ? copy.admin
                : errorMessage(failure, t)
              : failure instanceof ZodError
                ? copy.invalid
                : t.genericError
        );
      }
    } finally {
      flight.current = false;
      if (current()) setBusy(false);
    }
  }
  async function load() {
    const prior = source ? await (await openMutationStore()).get(scope!, source) : null;
    const data = await read();
    let restored = dayFields(
      data,
      data.days.find((d) => d.id === dayId)
    );
    if (source) {
      if (
        prior?.tripId === tripId &&
        prior.status === 'completed' &&
        prior.result?.status === 'rejected' &&
        prior.payload?.operation === 'itinerary.write' &&
        prior.payload.body.operation.startsWith('day.') &&
        ('dayId' in prior.payload.body ? prior.payload.body.dayId === dayId : !dayId) &&
        (prior.payload.body.operation === 'day.delete') === remove
      )
        restored = restoreDayFields(data, prior.payload.body as DayCommand);
    }
    if (!current() || !catalog.isVisible(scope!, tripId)) return;
    inputRevision.current++;
    setContext(data);
    setForbidden(false);
    setLatest(null);
    setPrepared(null);
    setFields(restored);
    setInitial(
      dayFields(
        data,
        data.days.find((d) => d.id === dayId)
      )
    );
    setSubmitted(false);
    setRequestId(null);
    setDone(false);
  }
  // Capture the mount's owner. Refocus/reconnect must never reset unsaved fields.
  const [initialize] = useState(() => () => run(load));
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void initialize();
    });
    return () => {
      active = false;
    };
  }, [initialize]);
  const review = () =>
    run(async () => {
      if (!latestState.current.ready || !context || !fields) return;
      const data = await read();
      if (!current()) return;
      if (!sameDaySnapshot(context, data, dayId, remove)) {
        setLatest(data);
        setPrepared(null);
        setError(copy.conflict);
        return;
      }
      const command = prepareDay(
        data,
        fields,
        data.days.find((d) => d.id === dayId),
        remove
      );
      setContext(data);
      preparedRevision.current = inputRevision.current;
      setPrepared(command);
    });
  const submit = () =>
    run(async () => {
      if (
        !latestState.current.ready ||
        !prepared ||
        !scope ||
        preparedRevision.current !== inputRevision.current
      )
        return;
      const body = prepared; // The engine always replaces this local validation ID before persistence.
      const result = await entry.confirm(scope, { operation: 'itinerary.write', tripId, body });
      if (!current() || !catalog.isVisible(scope, tripId)) return;
      if (result.kind === 'completed') {
        setPrepared(null);
        if (result.result.status === 'committed') {
          setSubmitted(true);
          setDone(true);
        } else if (result.result.status === 'rejected') {
          setError(dayRejection(result.result.code, copy));
          // Keep the input; re-reading/rebasing must be an explicit user action.
          const data = await read();
          if (current()) setLatest(data);
        }
      } else if (result.kind === 'pending') {
        setRequestId(result.clientRequestId ?? null);
        setSubmitted(true);
        setPrepared(null);
        setError(result.error ? errorMessage(result.error, t) : '');
      } else if (result.kind === 'not-sent') {
        setError(result.error instanceof ApiError ? errorMessage(result.error, t) : copy.storage);
      } else setError(t.operationBlocked);
    });
  function change(key: keyof DayFields, value: string) {
    if (!current() || flight.current || latestState.current.frozen) return;
    inputRevision.current++;
    setFields((old) => old && { ...old, [key]: value });
    setPrepared(null);
  }
  const title = remove ? copy.remove : dayId ? copy.edit : copy.add;
  if (!visible)
    return (
      <FormPage title={title} backLabel={t.backShort} onBack={() => goBack('/trips')}>
        <Notice tone="danger">{t.notFound}</Notice>
      </FormPage>
    );
  return (
    <FormPage
      title={title}
      backLabel={t.backShort}
      busy={busy}
      onBack={() => goBack({ pathname: '/trips/[id]/itinerary', params: { id: tripId } })}
    >
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {!!error && <Notice tone="warning">{error}</Notice>}
      {(records.isError || records.isPending) && (
        <Notice tone="warning">{records.isError ? t.recoveryLoadFailed : t.loading}</Notice>
      )}
      {records.isError && <Action label={t.retry} onPress={() => void records.refetch()} />}
      {completed && <Notice tone="success">{copy.saved}</Notice>}
      {(pending || (submitted && !completed)) && (
        <Card>
          <Notice tone="warning">
            {terminal?.status === 'rejected' ? dayRejection(terminal.code, copy) : copy.pending}
          </Notice>
          {terminal?.status === 'rejected' && (
            <Action
              label={copy.reload}
              disabled={busy || !online}
              onPress={() =>
                void run(async () => {
                  const data = await read();
                  if (!current()) return;
                  setLatest(data);
                  setSubmitted(false);
                  setRequestId(null);
                })
              }
            />
          )}
          {pending && <DetailRow label={t.requestId} value={pending.clientRequestId} />}
          <Action label={t.pendingOperations} onPress={() => router.push('/trips/operations')} />
        </Card>
      )}
      {(!context || forbidden) && !pending && (
        <Action
          label={busy ? t.loading : copy.reload}
          busy={busy}
          disabled={!online || busy}
          onPress={() => void run(load)}
        />
      )}
      {missing && <Notice tone="warning">{copy.missing}</Notice>}
      {latest && !frozen && (
        <Card>
          <Notice tone="warning">{copy.conflict}</Notice>
          <DetailRow label={t.startDate} value={latest.startDate ?? '—'} />
          <DetailRow label={t.endDate} value={latest.endDate ?? '—'} />
          {dayId && (
            <DetailRow
              label={copy.title}
              value={latest.days.find((d) => d.id === dayId)?.title ?? copy.missing}
            />
          )}
          {latestDay && (
            <>
              <DetailRow
                label={latestDay.date ? copy.date : copy.number}
                value={latestDay.date ?? String(latestDay.dayNumber)}
              />
              <DetailRow label={copy.content} value={latestDay.content || '—'} />
              <DetailRow label={copy.place} value={latestDay.location?.name || '—'} />
              {latestDay.location && (
                <>
                  <DetailRow label={copy.address} value={latestDay.location.display_name || '—'} />
                  <DetailRow label={copy.latitude} value={String(latestDay.location.lat)} />
                  <DetailRow label={copy.longitude} value={String(latestDay.location.lon)} />
                </>
              )}
            </>
          )}
          {(!dayId || latest.days.some((d) => d.id === dayId)) && (
            <Action
              label={copy.rebase}
              onPress={() => {
                if (!current() || flight.current || latestState.current.frozen) return;
                inputRevision.current++;
                setContext(latest);
                setLatest(null);
                setPrepared(null);
                setError('');
              }}
            />
          )}
        </Card>
      )}
      {fields && context && !forbidden && !pending && !done && !submitted && (
        <>
          <TextField
            label={copy.title}
            value={fields.title}
            editable={!frozen && !remove}
            maxLength={1000}
            onChangeText={(v) => change('title', v)}
          />
          <TextField
            label={context.startDate ? copy.date : copy.number}
            value={context.startDate ? fields.date : fields.dayNumber}
            editable={!frozen && !remove}
            keyboardType={context.startDate ? 'default' : 'number-pad'}
            onChangeText={(v) => change(context.startDate ? 'date' : 'dayNumber', v)}
          />
          {!remove && (
            <>
              <TextField
                label={copy.content}
                value={fields.content}
                multiline
                maxLength={50000}
                editable={!frozen}
                onChangeText={(v) => change('content', v)}
              />
              <Section title={copy.place}>
                <Copy>{copy.coordinates}</Copy>
                {(['place', 'address', 'latitude', 'longitude'] as const).map((key) => (
                  <TextField
                    key={key}
                    label={copy[key]}
                    value={fields[key]}
                    editable={!frozen}
                    keyboardType={
                      key === 'latitude' || key === 'longitude'
                        ? 'numbers-and-punctuation'
                        : 'default'
                    }
                    onChangeText={(v) => change(key, v)}
                  />
                ))}
                <Action
                  variant="ghost"
                  label={copy.clearPlace}
                  disabled={frozen}
                  onPress={() => {
                    if (!current() || flight.current || latestState.current.frozen) return;
                    inputRevision.current++;
                    setFields(
                      (old) =>
                        old && { ...old, place: '', address: '', latitude: '', longitude: '' }
                    );
                    setPrepared(null);
                  }}
                />
              </Section>
            </>
          )}
          {prepared ? (
            <Card>
              {remove && day && (
                <Section title={copy.impact}>
                  <Copy>{copy.deleteHint}</Copy>
                  <DetailRow
                    label={copy.activities}
                    value={String(day.deleteImpact.activityCount)}
                  />
                  <DetailRow
                    label={copy.tickets}
                    value={String(day.deleteImpact.attachmentCount)}
                  />
                  <DetailRow label={copy.expenses} value={String(day.deleteImpact.expenseCount)} />
                  <DetailRow label={copy.photos} value={String(day.deleteImpact.photoCount)} />
                </Section>
              )}
              {!remove && <Copy>{copy.review}</Copy>}
              <Action
                testID="itinerary-day-confirm"
                variant={remove ? 'danger' : 'primary'}
                label={remove ? copy.confirmDelete : copy.confirm}
                disabled={!ready || !!latest}
                busy={busy}
                onPress={() => void submit()}
              />
              <Action
                variant="ghost"
                label={copy.cancelReview}
                disabled={busy}
                onPress={() => {
                  inputRevision.current++;
                  setPrepared(null);
                }}
              />
            </Card>
          ) : (
            <Action
              testID="itinerary-day-review"
              label={copy.review}
              disabled={!ready || !!latest}
              busy={busy}
              onPress={() => void review()}
            />
          )}
        </>
      )}
    </FormPage>
  );
}
