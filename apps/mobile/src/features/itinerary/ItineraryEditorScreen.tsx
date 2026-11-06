import { ZodError } from 'zod';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import type { ItineraryEditContext, ItineraryWriteInput } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { FormPage } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { Action, Card, Copy, DetailRow, Notice } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage } from '@/features/auth/errorMessage';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useOnline } from '@/providers/useOnline';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { dayRejection, itineraryMessages } from '@/i18n/itineraryMessages';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { readItineraryEditContext } from './editContext';
import type { ReactNode } from 'react';
import { DayFormError } from './dayForm';

export type EditorTarget = {
  tripId: string;
  dayId?: string;
  activityId?: string;
  remove?: boolean;
  source?: string;
};
export type EditorDefinition<F extends Record<string, string>, C extends ItineraryWriteInput> = {
  messages: typeof itineraryMessages;
  testId: string;
  rejection?: (code: string, locale: keyof typeof itineraryMessages) => string;
  editing: (target: EditorTarget) => boolean;
  exists: (context: ItineraryEditContext, target: EditorTarget) => boolean;
  fields: (context: ItineraryEditContext, target: EditorTarget) => F;
  prepare: (context: ItineraryEditContext, fields: F, target: EditorTarget) => C;
  restore: (context: ItineraryEditContext, command: C) => F;
  accepts: (command: ItineraryWriteInput, target: EditorTarget) => command is C;
  same: (a: ItineraryEditContext, b: ItineraryEditContext, target: EditorTarget) => boolean;
  valid?: (context: ItineraryEditContext, fields: F, target: EditorTarget) => boolean;
  Fields: (args: {
    fields: F;
    context: ItineraryEditContext;
    target: EditorTarget;
    frozen: boolean;
    change: (key: keyof F, value: string) => void;
    clearPlace: () => void;
  }) => ReactNode;
  renderLatest: (context: ItineraryEditContext, target: EditorTarget) => ReactNode;
  renderReview: (context: ItineraryEditContext, target: EditorTarget) => ReactNode;
};

export function ItineraryEditorScreen<
  F extends Record<string, string>,
  C extends ItineraryWriteInput,
>(props: EditorTarget & { definition: EditorDefinition<F, C> }) {
  const { manager, user, status } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  const { definition, ...target } = props;
  return (
    <ItineraryEditor
      key={JSON.stringify([manager.api.environment, user.id, manager.getSignInVersion(), target])}
      definition={definition}
      target={target}
    />
  );
}
function ItineraryEditor<F extends Record<string, string>, C extends ItineraryWriteInput>({
  definition,
  target,
}: {
  definition: EditorDefinition<F, C>;
  target: EditorTarget;
}) {
  const { tripId, remove = false, source } = target;
  const { entry, scope, records, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const locale = useAppLocale();
  const copy = definition.messages[locale];
  const rejection = (code: string) =>
    definition.rejection?.(code, locale) ?? dayRejection(code, copy);
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
  const [fields, setFields] = useState<F | null>(null);
  const [initial, setInitial] = useState<F | null>(null);
  const [prepared, setPrepared] = useState<C | null>(null);
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
  const missing = !!context && !definition.exists(context, target);
  const ready =
    visible &&
    online &&
    !forbidden &&
    !frozen &&
    !missing &&
    !!context &&
    !!fields &&
    (definition.valid?.(context, fields, target) ?? true) &&
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
            ? rejection(failure.code)
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
    let restored = definition.fields(data, target);
    if (
      prior?.tripId === tripId &&
      prior.status === 'completed' &&
      prior.result?.status === 'rejected' &&
      prior.payload?.operation === 'itinerary.write' &&
      definition.accepts(prior.payload.body, target)
    )
      restored = definition.restore(data, prior.payload.body);
    if (!current() || !catalog.isVisible(scope!, tripId)) return;
    inputRevision.current++;
    setContext(data);
    setForbidden(false);
    setLatest(null);
    setPrepared(null);
    setFields(restored);
    setInitial(definition.fields(data, target));
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
      if (!definition.same(context, data, target)) {
        setLatest(data);
        setPrepared(null);
        setError(copy.conflict);
        return;
      }
      const command = definition.prepare(data, fields, target);
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
          setError(rejection(result.result.code));
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
  function change(key: keyof F, value: string) {
    if (!current() || flight.current || latestState.current.frozen) return;
    inputRevision.current++;
    setFields((old) => old && { ...old, [key]: value });
    setPrepared(null);
  }
  const Fields = definition.Fields;
  const title = remove ? copy.remove : definition.editing(target) ? copy.edit : copy.add;
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
            {terminal?.status === 'rejected' ? rejection(terminal.code) : copy.pending}
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
          {definition.renderLatest(latest, target)}
          {definition.exists(latest, target) && (
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
          <Fields
            fields={fields}
            context={context}
            target={target}
            frozen={frozen}
            change={change}
            clearPlace={() => {
              if (!current() || flight.current || latestState.current.frozen) return;
              inputRevision.current++;
              setFields(
                (old) => old && { ...old, place: '', address: '', latitude: '', longitude: '' }
              );
              setPrepared(null);
            }}
          />
          {prepared ? (
            <Card>
              {definition.renderReview(context, target)}
              {!remove && <Copy>{copy.review}</Copy>}
              <Action
                testID={`${definition.testId}-confirm`}
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
              testID={`${definition.testId}-review`}
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
