import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { onlineManager } from '@tanstack/react-query';
import type { ActivityDeletionPreview, ItineraryEditContext } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { ScreenFrame } from '@/components/frame';
import { PageHeader } from '@/components/screen';
import { goBack } from '@/components/navigation';
import { NavigationMenu } from '@/components/NavigationMenu';
import { Action, Card, Copy, DetailRow, Notice, Title, usePalette } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useOnline } from '@/providers/useOnline';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { batchDeletionMessages } from '@/i18n/batchDeletionMessages';
import { itineraryMessages } from '@/i18n/itineraryMessages';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import type { PendingMutation, StoredMutationResult } from '@/storage/mutations';
import { spacing, typography } from '@/theme/tokens';
import { readItineraryEditContext } from './editContext';
import { useItinerary } from './queries';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { activityTiming, dayLabel } from './presentation';
import {
  itinerarySelectionSignature,
  readActivityDeletionPreview,
  selectedContextChanged,
  type BatchSelection,
} from './batchDeletion';

export function ActivityBatchScreen(props: { tripId: string; dayId?: string; source?: string }) {
  const { manager, user, status } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return (
    <BatchEditor
      key={JSON.stringify([manager.api.environment, user.id, manager.getSignInVersion(), props])}
      {...props}
    />
  );
}
function BatchEditor({
  tripId,
  dayId,
  source,
}: {
  tripId: string;
  dayId?: string;
  source?: string;
}) {
  const { entry, scope, records, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const navigation = useNavigation();
  const t = useMessages();
  const locale = useAppLocale();
  const copy = batchDeletionMessages[locale];
  const common = itineraryMessages[locale];
  const timingCopy = itineraryPresentationMessages[locale];
  const summary = (
    a: Parameters<typeof activityTiming>[0],
    d: { dayNumber: number | null; date: string | null }
  ) => activityTiming(a, d, t, timingCopy).summary;
  const format = useDisplayFormat();
  const p = usePalette();
  const online = useOnline();
  const query = useItinerary(tripId);
  const [version] = useState(() => manager.getSignInVersion());
  const mounted = useRef(true);
  const flight = useRef(false);
  const handled = useRef('');
  const allowExit = useRef(false);
  const [context, setContext] = useState<ItineraryEditContext | null>(null);
  const [activeDay, setActiveDay] = useState(dayId);
  const [selection, setSelection] = useState<BatchSelection | null>(null);
  const [review, setReview] = useState<ActivityDeletionPreview | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [changed, setChanged] = useState(false);
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const sameOwner = () =>
    !!scope &&
    manager.api.environment === scope.environment &&
    manager.getSignInVersion() === version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId;
  const current = () => mounted.current && sameOwner();
  const visible =
    sameOwner() && !!scope && catalog.isVisible(scope, tripId) && !isAccessDenied(query.error);
  const pending = records.data?.find((r) => r.tripId === tripId && r.status === 'pending');
  const submitted = !!pending || !!requestId;
  const frozen = busy || submitted || done !== null;
  const ready =
    visible &&
    online &&
    !forbidden &&
    !frozen &&
    !!context &&
    !!records.data &&
    !records.isPending &&
    !records.isError &&
    !records.isFetching;
  const day = context?.days.find((d) => d.id === activeDay);
  const ids = selection?.targets.map((a) => a.activityId) ?? [];
  const liveDay = query.data?.days.find((d) => d.id === selection?.day.id);
  const invalidated =
    !!review && !!query.data && itinerarySelectionSignature(liveDay, ids) !== signature;
  useEffect(() => {
    let active = true;
    if (invalidated)
      void Promise.resolve().then(() => {
        if (active) {
          setReview(null);
          setError(copy.conflict);
        }
      });
    return () => {
      active = false;
    };
  }, [invalidated, copy.conflict]);
  const latest = useRef({ ready, frozen });
  useLayoutEffect(() => {
    latest.current = { ready, frozen };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function clear() {
    setSelection(null);
    setReview(null);
    setMissing([]);
    setChanged(false);
    setError('');
  }
  function leave(action: () => void) {
    if (!current() || flight.current) return;
    if (allowExit.current || !ids.length || submitted || done !== null) {
      clear();
      action();
      return;
    }
    Alert.alert(t.leaveFormTitle, copy.leave, [
      { text: t.stayForm, style: 'cancel' },
      {
        text: t.leaveForm,
        style: 'destructive',
        onPress: () => {
          if (current() && !flight.current) {
            clear();
            action();
          }
        },
      },
    ]);
  }
  usePreventRemove(
    visible && !submitted && done === null && (busy || ids.length > 0),
    ({ data }) => {
      leave(() => navigation.dispatch(data.action));
    }
  );
  function guard() {
    const access = catalog.captureAccess(scope!);
    return () => {
      if (
        !current() ||
        !onlineManager.isOnline() ||
        AppState.currentState !== 'active' ||
        !catalog.isVisible(scope!, tripId)
      )
        throw new ApiError('CANCELLED');
      access(tripId);
    };
  }
  async function read() {
    return readItineraryEditContext({
      store: openMutationStore,
      scope: scope!,
      tripId,
      request: (...args) => manager.requestAs(...args),
      guard: guard(),
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
        if (failure instanceof ApiError && [401, 403].includes(failure.status)) {
          setForbidden(true);
          clear();
          setContext(null);
        }
        setError(
          failure instanceof ApiError && failure.status === 403
            ? common.admin
            : errorMessage(failure, t)
        );
      }
    } finally {
      flight.current = false;
      if (current()) setBusy(false);
    }
  }
  function restore(record: PendingMutation, data: ItineraryEditContext) {
    if (record.payload?.operation !== 'activities.delete' || record.tripId !== tripId) return;
    const body = record.payload.body;
    const savedDay = data.days.find((d) => d.id === body.dayId);
    setActiveDay(body.dayId);
    setSelection({
      day: savedDay ?? { id: body.dayId, title: '', date: null, dayNumber: null },
      targets: body.targets,
      contextRevision: body.expectedContextRevision,
      labels: Object.fromEntries(
        body.targets.map((a) => [
          a.activityId,
          savedDay?.activities.find((v) => v.id === a.activityId)?.title ?? a.activityId,
        ])
      ),
    });
    setReview(null);
  }
  async function load() {
    const saved = source ? await (await openMutationStore()).get(scope!, source) : null;
    const data = await read();
    if (!current() || !catalog.isVisible(scope!, tripId)) return;
    setContext(data);
    setReview(null);
    setForbidden(false);
    if (!activeDay) setActiveDay(data.days[0]?.id);
    if (
      !selection &&
      saved?.payload?.operation === 'activities.delete' &&
      saved.tripId === tripId
    ) {
      if (saved.status === 'completed' && saved.result?.status === 'rejected') restore(saved, data);
      else if (saved.status === 'pending') {
        restore(saved, data);
        setRequestId(saved.clientRequestId);
      }
    }
  }
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
  function finish(result: StoredMutationResult) {
    setReview(null);
    setRequestId(null);
    if (result.status === 'committed' && result.operation === 'activities.delete') {
      setDone(result.result.receipt.result.count);
      setSelection(null);
    } else if (result.status === 'rejected') {
      if (result.code === 'FORBIDDEN') {
        setForbidden(true);
        setContext(null);
        setSelection(null);
      }
      setError(
        result.code === 'FORBIDDEN'
          ? common.admin
          : result.code === 'NOT_FOUND'
            ? copy.missing
            : copy.conflict
      );
    } else {
      setError(t.operationUnknown);
      setDone(null);
    }
  }
  const synchronize = useRef(() => {});
  useLayoutEffect(() => {
    synchronize.current = () => {
      if (!visible) return;
      if (!requestId && pending?.operation === 'activities.delete') {
        setRequestId(pending.clientRequestId);
        if (!selection && context) restore(pending, context);
        return;
      }
      if (!requestId) return;
      const record = records.data?.find((r) => r.clientRequestId === requestId);
      if (!record?.result || record.status !== 'completed' || handled.current === requestId) return;
      handled.current = requestId;
      if (record.result.status === 'rejected' && !selection && context) restore(record, context);
      finish(record.result);
    };
  });
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) synchronize.current();
    });
    return () => {
      active = false;
    };
  }, [visible, requestId, pending, records.data, context]);
  function toggle(id: string) {
    if (!latest.current.ready || flight.current || !day) return;
    const a = day.activities.find((v) => v.id === id);
    if (!a) return;
    const old = selection ?? { day, targets: [], labels: {} };
    if (!ids.includes(id) && ids.length >= 15) {
      setError(copy.limit);
      return;
    }
    setSelection({
      ...old,
      targets: ids.includes(id)
        ? old.targets.filter((v) => v.activityId !== id)
        : [...old.targets, { activityId: id, expectedRevision: a.revision }],
      labels: {
        ...old.labels,
        [id]: `${summary(a, day!)} · ${a.title}${a.locationName ? ` · ${a.locationName}` : ''}`,
      },
    });
    setReview(null);
    setMissing([]);
    setChanged(false);
  }
  async function preview() {
    if (!latest.current.ready || !selection || !ids.length) return;
    setReview(null);
    setMissing([]);
    setChanged(false);
    try {
      const data = await readActivityDeletionPreview({
        request: (...args) => manager.requestAs(...args),
        store: openMutationStore,
        scope: scope!,
        tripId,
        input: {
          dayId: selection.day.id,
          targets: selection.targets,
          ...(context?.capabilities?.activityEndDayOffset ? { includeEndDayOffset: true } : {}),
        },
        guard: guard(),
      });
      if (!current() || !catalog.isVisible(scope!, tripId)) return;
      setReview(data);
      setMissing(data.missingIds);
      setChanged(selectedContextChanged(selection, data));
      setSignature(
        itinerarySelectionSignature(
          query.data?.days.find((d) => d.id === selection.day.id),
          ids
        )
      );
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404 && failure.code === 'NOT_FOUND') {
        if (current()) {
          setMissing(ids);
          setError(copy.missing);
        }
      } else throw failure;
    }
  }
  async function submit() {
    if (!latest.current.ready || !review || !selection || missing.length || changed || invalidated)
      return;
    const result = await entry.confirm(scope!, {
      operation: 'activities.delete',
      tripId,
      body: {
        dayId: selection.day.id,
        ...(context?.capabilities?.activityEndDayOffset ? { includeEndDayOffset: true } : {}),
        targets: selection.targets,
        expectedContextRevision: review.contextRevision,
      },
    });
    if (!current() || !catalog.isVisible(scope!, tripId)) return;
    if (result.kind === 'completed') finish(result.result);
    else if (result.kind === 'pending') {
      setRequestId(result.clientRequestId ?? null);
      setReview(null);
      setError(common.pending);
    } else if (result.kind === 'not-sent')
      setError(result.error instanceof ApiError ? errorMessage(result.error, t) : common.storage);
    else setError(t.operationBlocked);
  }
  const rowStyle = {
    minHeight: 48,
    padding: spacing.medium,
    borderWidth: 1,
    borderRadius: 12,
    gap: spacing.small,
  };
  const back = () => goBack({ pathname: '/trips/[id]/itinerary', params: { id: tripId } });
  if (!visible)
    return (
      <ScreenFrame>
        <PageHeader backLabel={t.backShort} onBack={back} />
        <Notice tone="danger">{t.notFound}</Notice>
      </ScreenFrame>
    );
  const all = !!day?.activities.length && day.activities.every((a) => ids.includes(a.id));
  const tooMany = new Set([...ids, ...(day?.activities.map((a) => a.id) ?? [])]).size > 15;
  const rows = review ? [] : (day?.activities ?? []);
  return (
    <ScreenFrame>
      <FlatList
        testID="batch-list"
        data={rows}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{
          padding: spacing.medium,
          gap: spacing.medium,
          width: '100%',
          maxWidth: 640,
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View style={{ gap: spacing.medium }}>
            <PageHeader title={copy.title} backLabel={t.backShort} busy={busy} onBack={back} />
            {!online && <Notice tone="warning">{t.offline}</Notice>}
            {!!error && <Notice tone="warning">{error}</Notice>}
            {(records.isPending || records.isError) && (
              <Notice tone="warning">{records.isError ? t.recoveryLoadFailed : t.loading}</Notice>
            )}
            {records.isError && <Action label={t.retry} onPress={() => void records.refetch()} />}
            {done !== null && <Notice tone="success">{`${copy.done} · ${done}`}</Notice>}
            {submitted && (
              <Card>
                <Notice tone="warning">{common.pending}</Notice>
                <Action
                  label={t.pendingOperations}
                  onPress={() => router.push('/trips/operations')}
                />
              </Card>
            )}
            {!submitted && done === null && (
              <>
                <Action
                  label={context && !forbidden ? t.refresh : t.retry}
                  disabled={busy || !online}
                  busy={busy}
                  onPress={() => void run(load)}
                />
                {context && !forbidden && (
                  <NavigationMenu
                    testID="batch-day-picker"
                    title={t.itineraryChooseDay}
                    closeLabel={t.closeNavigation}
                    label={
                      day ? `${dayLabel(day.dayNumber, t)} · ${day.title}` : t.itineraryChooseDay
                    }
                    choices={context.days.map((d) => ({
                      testID: `batch-day-${d.id}`,
                      label: `${dayLabel(d.dayNumber, t)} · ${d.title}`,
                      selected: activeDay === d.id,
                      onPress: () => {
                        if (!flight.current && d.id !== activeDay)
                          leave(() => {
                            setActiveDay(d.id);
                          });
                      },
                    }))}
                  />
                )}
                {day && !review && (
                  <>
                    <Copy>{`${dayLabel(day.dayNumber, t)}${day.date ? ` · ${format.date(day.date)}` : ''} · ${day.title}`}</Copy>
                    {!day.activities.length && <Copy>{copy.empty}</Copy>}
                    {day.activities.length > 15 && <Notice tone="warning">{copy.limit}</Notice>}
                    <Pressable
                      testID="batch-all"
                      accessibilityRole="checkbox"
                      accessibilityLabel={all ? copy.none : copy.all}
                      accessibilityState={{
                        checked: all ? true : ids.length ? 'mixed' : false,
                        disabled: !ready || (!all && tooMany),
                      }}
                      disabled={!ready || (!all && tooMany)}
                      onPress={() => {
                        if (!latest.current.ready || flight.current || (!all && tooMany)) return;
                        if (all) clear();
                        else {
                          setSelection({
                            day: selection?.day ?? day,
                            targets: [
                              ...(selection?.targets ?? []),
                              ...day.activities
                                .filter((a) => !ids.includes(a.id))
                                .map((a) => ({
                                  activityId: a.id,
                                  expectedRevision: a.revision,
                                })),
                            ],
                            labels: {
                              ...Object.fromEntries(
                                day.activities.map((a) => [
                                  a.id,
                                  `${summary(a, day)} · ${a.title}${a.locationName ? ` · ${a.locationName}` : ''}`,
                                ])
                              ),
                              ...selection?.labels,
                            },
                          });
                          setReview(null);
                        }
                      }}
                      style={[
                        rowStyle,
                        { borderColor: p.controlBorder, backgroundColor: p.surface },
                      ]}
                    >
                      <Text style={[typography.label, { color: p.text }]}>
                        {all ? copy.none : copy.all}
                      </Text>
                    </Pressable>
                  </>
                )}
                {invalidated && <Notice tone="warning">{copy.conflict}</Notice>}
                {!!missing.length && (
                  <Card>
                    <Notice tone="warning">{copy.missing}</Notice>
                    {missing.map((id) => (
                      <Copy key={id}>{`${selection?.labels[id] ?? id} · ${copy.gone}`}</Copy>
                    ))}
                    <Action
                      testID="batch-remove-missing"
                      label={copy.removeMissing}
                      disabled={!ready}
                      onPress={() => {
                        if (!latest.current.ready || flight.current || !selection) return;
                        setSelection({
                          ...selection,
                          targets: selection.targets.filter((a) => !missing.includes(a.activityId)),
                        });
                        setReview(null);
                        setMissing([]);
                        setChanged(false);
                      }}
                    />
                  </Card>
                )}
                {review && (
                  <Card>
                    <Title>{copy.review}</Title>
                    <Copy>{copy.hint}</Copy>
                    <DetailRow
                      label={copy.previous}
                      value={`${selection!.day.dayNumber === null ? copy.gone : dayLabel(selection!.day.dayNumber, t)} · ${selection!.day.date ?? t.itineraryNoDates} · ${selection!.day.title}`}
                    />
                    <DetailRow
                      label={copy.latest}
                      value={`${dayLabel(review.dayNumber, t)} · ${review.date ?? t.itineraryNoDates} · ${review.title}`}
                    />
                    {review.targets.map((a) => (
                      <View key={a.activityId} style={{ gap: spacing.small }}>
                        <DetailRow
                          label={copy.previous}
                          value={selection!.labels[a.activityId] ?? a.activityId}
                        />
                        <DetailRow
                          label={copy.latest}
                          value={`${summary(a, review)} · ${a.title}${a.locationName ? ` · ${a.locationName}` : ''}`}
                        />
                      </View>
                    ))}
                    {changed && (
                      <>
                        <Notice tone="warning">{copy.conflict}</Notice>
                        <Action
                          testID="batch-adopt"
                          label={copy.adopt}
                          disabled={!ready || !!missing.length}
                          onPress={() => {
                            if (!latest.current.ready || flight.current || missing.length) return;
                            setSelection({
                              day: {
                                id: review.dayId,
                                title: review.title,
                                dayNumber: review.dayNumber,
                                date: review.date,
                              },
                              targets: review.targets.map((a) => ({
                                activityId: a.activityId,
                                expectedRevision: a.revision,
                              })),
                              labels: Object.fromEntries(
                                review.targets.map((a) => [
                                  a.activityId,
                                  `${summary(a, review)} · ${a.title}${a.locationName ? ` · ${a.locationName}` : ''}`,
                                ])
                              ),
                              contextRevision: review.contextRevision,
                            });
                            setReview(null);
                            setChanged(false);
                          }}
                        />
                      </>
                    )}
                  </Card>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) =>
          !submitted && done === null && !forbidden ? (
            <Pressable
              testID={`batch-activity-${item.id}`}
              accessibilityRole="checkbox"
              accessibilityLabel={`${dayLabel(day!.dayNumber, t)}${day!.date ? ` · ${format.date(day!.date)}` : ''} · ${summary(item, day!)} · ${item.title}${item.locationName ? ` · ${item.locationName}` : ''}`}
              accessibilityState={{ checked: ids.includes(item.id), disabled: !ready }}
              disabled={!ready}
              onPress={() => toggle(item.id)}
              style={[
                rowStyle,
                {
                  borderColor: ids.includes(item.id) ? p.primary : p.controlBorder,
                  backgroundColor: ids.includes(item.id) ? p.selected : p.surface,
                },
              ]}
            >
              <Text
                style={[typography.body, { color: p.text }]}
              >{`${ids.includes(item.id) ? '☑' : '☐'} ${summary(item, day!)}`}</Text>
              <Text style={[typography.section, { color: p.text }]}>{item.title}</Text>
              {!!item.locationName && (
                <Text style={[typography.body, { color: p.muted }]}>{item.locationName}</Text>
              )}
            </Pressable>
          ) : null
        }
      />
      {!submitted && done === null && !forbidden && context && (
        <View
          style={{
            padding: spacing.medium,
            gap: spacing.small,
            backgroundColor: p.surface,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
          }}
        >
          <Notice
            announceText={`${copy.selected} · ${ids.length}`}
            announce="polite"
          >{`${copy.selected} · ${ids.length}`}</Notice>
          {review && (
            <Action
              testID="batch-confirm"
              label={`${copy.confirm} · ${ids.length}`}
              variant="danger"
              disabled={!ready || changed || !!missing.length || invalidated}
              busy={busy}
              onPress={() => void run(submit)}
            />
          )}
          {(!review || invalidated) && (
            <Action
              testID="batch-review"
              label={`${copy.review} · ${ids.length}`}
              variant="danger"
              disabled={!ready || !ids.length}
              busy={busy}
              onPress={() => void run(preview)}
            />
          )}
          <Action
            testID="batch-cancel"
            variant="secondary"
            label={review ? copy.back : copy.cancel}
            disabled={busy}
            onPress={() => {
              if (flight.current) return;
              if (review) setReview(null);
              else {
                allowExit.current = true;
                clear();
                back();
              }
            }}
          />
        </View>
      )}
    </ScreenFrame>
  );
}
