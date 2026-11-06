'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ActivityDeletionPreview } from '@travel-budget/contracts';
import type { Activity, ItineraryDay } from '@/types';
import { previewWebActivityDeletion } from '@/actions';
import {
  captureConfirmedWebScope,
  confirmedWebKey,
  confirmWebWrite,
  readConfirmedWebWrites,
  resumeConfirmedWebWrite,
  assertWebCooldown,
  type ConfirmedWebEntry,
} from '@/lib/confirmedWebWrites';
import { tripKeys } from '@/hooks/queries/keys';
import { retainHistoryNavigation } from '@/lib/historyNavigation';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

type Selection = {
  dayId: string;
  title: string;
  date: string | null;
  dayNumber: number;
  targets: Activity[];
};
// A missing day still has a reviewable selection, but no server confirmation
// revision. It can only be cancelled or have its missing targets removed.
type DeletionReview = Omit<ActivityDeletionPreview, 'contextRevision'> & {
  contextRevision?: string;
};
type BatchContext = {
  dayId?: string;
  selected: Set<string>;
  online: boolean;
  busy: boolean;
  pending: boolean;
  canLeaveDay: (dayId: string) => boolean;
  start: (day: ItineraryDay) => void;
  toggle: (activity: Activity) => void;
  all: (day: ItineraryDay) => void;
  cancel: () => void;
  review: () => void;
  error: string | null;
  limit: boolean;
};
const Context = createContext<BatchContext | null>(null);
export const useActivityBatchSelection = () => useContext(Context);

export function ActivityBatchDeletionProvider({
  tripId,
  days,
  dates,
  isAdmin,
  children,
}: {
  tripId: string;
  days: ItineraryDay[];
  dates: Map<string, string | null | undefined>;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('itinerary.batch'),
    tLedger = useTranslations('ledger');
  const client = useQueryClient(),
    online = useOnlineStatus(),
    { toast } = useToast();
  const currentScope = useMemo(() => captureConfirmedWebScope(client), [client]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<DeletionReview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false),
    [accessDenied, setAccessDenied] = useState(false);
  const lock = useRef(false),
    generation = useRef(0);
  const query = useQuery({
    queryKey: confirmedWebKey,
    queryFn: () => readConfirmedWebWrites(client),
    staleTime: Infinity,
    networkMode: 'always',
  });
  const entries = Object.values(query.data ?? {}).filter(
    (e) => e.request.operation === 'activities.delete' && e.request.tripId === tripId
  );
  const pending = entries.find((e) => e.status === 'pending');
  const active = isAdmin && !accessDenied && currentScope();
  const visible = active ? selection : null;
  const selected = new Set(visible?.targets.map((a) => a.id) ?? []);
  const owner = useRef(true);
  useEffect(() => {
    owner.current = true;
    return () => {
      owner.current = false;
    };
  }, []);
  const valid = () => owner.current && currentScope();
  const clear = () => {
    generation.current++;
    setSelection(null);
    setPreview(null);
    setError(null);
    setChanged(false);
  };
  const cancelSelection = () => {
    if (!busy && !pending) {
      const id = visible?.dayId;
      clear();
      if (id)
        requestAnimationFrame(() => {
          const target =
            document.getElementById(`batch-start-${id}`) ??
            document.getElementById(`batch-day-${id}`);
          target?.focus();
        });
    }
  };
  const focusDay = (id: string) =>
    requestAnimationFrame(() => document.getElementById(`batch-day-${id}`)?.focus());
  const finished = useRef(new Set<string>());
  const tracked = useRef<string | null>(null);
  const finish = (entry: ConfirmedWebEntry) => {
    if (!valid() || entry.request.operation !== 'activities.delete') return;
    if (entry.status === 'pending' || finished.current.has(entry.request.body.client_request_id))
      return;
    finished.current.add(entry.request.body.client_request_id);
    if (entry.status === 'done') {
      clear();
      focusDay(entry.request.body.dayId);
      toast({ description: t('success', { count: entry.request.body.targets.length }) });
    } else if (entry.status === 'rejected') {
      if (entry.error === 'FORBIDDEN' || entry.error === 'UNAUTHORIZED') {
        setAccessDenied(true);
        clear();
        return;
      }
      setPreview(null);
      setChanged(true);
      setError(t('conflict'));
    }
  };
  // On reload/reconnect, only look up the frozen UUID. Never auto-retry a missing receipt.
  const recovered = useRef(new Set<string>());
  useEffect(() => {
    if (!active || !online || !pending || lock.current) return;
    const id = pending.request.body.client_request_id;
    tracked.current = id;
    if (recovered.current.has(id)) return;
    recovered.current.add(id);
    lock.current = true;
    setBusy(true);
    let failure: unknown;
    void resumeConfirmedWebWrite(client, pending)
      .catch((e) => {
        failure = e;
      })
      .finally(async () => {
        if (valid()) {
          const journal = await readConfirmedWebWrites(client).catch(() => null);
          const entry = journal?.[id];
          // Terminal NOT_FOUND means the targets vanished, not loss of access.
          // A query failure alone says nothing about the pending write's outcome.
          if (entry && entry.status !== 'pending') finish(entry);
          else if (failure) {
            if (
              failure instanceof Error &&
              ['FORBIDDEN', 'UNAUTHORIZED'].includes(failure.message)
            ) {
              setAccessDenied(true);
              clear();
            } else
              setError(
                failure instanceof Error && failure.message === 'ledger.retryOriginal'
                  ? tLedger('retryOriginal')
                  : t('unknown')
              );
          }
          setBusy(false);
        }
        lock.current = false;
      });
    // A pending UUID gets one lookup per mounted/online generation, not a request loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.request.body.client_request_id, active, online, client]);
  useEffect(() => {
    if (!online) recovered.current.clear();
  }, [online]);
  useEffect(() => {
    if (!active) return;
    const id = tracked.current;
    if (id && query.data?.[id]) finish(query.data[id]);
    if (pending?.request.operation === 'activities.delete' && !selection) {
      const body = pending.request.body;
      const day = days.find((d) => d.id === body.dayId);
      if (day)
        setSelection({
          dayId: day.id,
          title: day.title,
          dayNumber: day.day_number,
          date: dates.get(day.id) ?? null,
          targets: pending.request.body.targets.map((target) => ({
            ...(day.activities.find((a) => a.id === target.activityId) ?? {
              id: target.activityId,
              title: t('missing'),
              time: null,
              end_time: null,
              type: 'other',
              location: null,
              location_name: '',
              note: '',
              confirmation_code: '',
              attachments: [],
            }),
            revision: target.expectedRevision,
          })),
        });
    }
    // Journal updates include completions made from the global recovery banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, active, days, dates]);

  useEffect(() => {
    if (!active) {
      generation.current++;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- discard private in-memory selection immediately on role/session loss
      setSelection(null);
      setPreview(null);
      setError(null);
    }
  }, [active]);
  // Late previews cannot re-open a dialog after cancel, account change or a new selection.
  const snapshot = visible
    ? JSON.stringify({
        title: days.find((d) => d.id === visible.dayId)?.title,
        number: days.find((d) => d.id === visible.dayId)?.day_number,
        date: dates.get(visible.dayId) ?? null,
        targets: visible.targets.map(
          (a) =>
            days.find((d) => d.id === visible.dayId)?.activities.find((x) => x.id === a.id) ?? null
        ),
      })
    : '';
  const previewSnapshot = useRef('');
  useEffect(() => {
    if (preview && previewSnapshot.current !== snapshot) {
      setPreview(null);
      setChanged(true);
      setError(t('conflict'));
    }
  }, [snapshot, preview, t]);
  const hasSelection = !!visible?.targets.length && !pending;
  useEffect(() => {
    if (!hasSelection) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !link ||
        link.getAttribute('target') === '_blank' ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const url = new URL(link.getAttribute('href')!, window.location.href);
      if (url.href === window.location.href) return;
      if (!window.confirm(t('leave'))) {
        event.preventDefault();
        event.stopPropagation();
      } else clear();
    };
    const history = retainHistoryNavigation();
    const unblock = history.block(() => {
      if (!window.confirm(t('leave'))) return false;
      clear();
      return true;
    });
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', leave, true);
      unblock();
      history.release();
    };
  }, [hasSelection, t]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !visible || busy || pending) return;
      if (preview) {
        setPreview(null);
        event.preventDefault();
      } else cancelSelection();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  });
  const start = (day: ItineraryDay) => {
    if (!active || !online || busy || pending) return;
    if (visible?.dayId !== day.id && hasSelection && !window.confirm(t('leave'))) return;
    clear();
    setSelection({
      dayId: day.id,
      dayNumber: day.day_number,
      title: day.title,
      date: dates.get(day.id) ?? null,
      targets: [],
    });
  };
  const review = async () => {
    if (!visible?.targets.length || !active || !online || lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const token = ++generation.current;
    try {
      await assertWebCooldown(client);
      if (!valid() || generation.current !== token) return;
      const result = await previewWebActivityDeletion(tripId, {
        dayId: visible.dayId,
        targets: visible.targets.map((a) => ({ activityId: a.id, expectedRevision: a.revision })),
      });
      if (!valid() || generation.current !== token) return;
      if (!result.success) {
        if (result.code === 'NOT_FOUND') {
          previewSnapshot.current = snapshot;
          setChanged(false);
          setError(t('conflict'));
          setPreview({
            tripId,
            dayId: visible.dayId,
            dayNumber: visible.dayNumber,
            title: visible.title,
            date: visible.date,
            targets: [],
            missingIds: visible.targets.map((a) => a.id),
            changedIds: [],
          });
          void client.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) });
          return;
        }
        if (['FORBIDDEN', 'UNAUTHORIZED'].includes(result.code ?? '')) {
          setAccessDenied(true);
          clear();
          void client.invalidateQueries({ queryKey: tripKeys.shell(tripId) });
        }
        throw new Error(result.code);
      }
      const next = result.data;
      setChanged(
        next.changedIds.length > 0 ||
          next.title !== visible.title ||
          next.dayNumber !== visible.dayNumber ||
          next.date !== visible.date
      );
      previewSnapshot.current = snapshot;
      setPreview(next);
    } catch (e) {
      if (valid() && generation.current === token)
        setError(
          e instanceof Error && e.message === 'ledger.wait' ? tLedger('wait') : t('readFailed')
        );
    } finally {
      lock.current = false;
      if (valid()) setBusy(false);
    }
  };
  const confirm = async () => {
    if (
      !preview ||
      !preview.contextRevision ||
      !visible ||
      changed ||
      preview.missingIds.length ||
      !online ||
      lock.current ||
      !active
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const id = crypto.randomUUID();
    let persisted = false;
    let failure: unknown;
    try {
      await confirmWebWrite(
        client,
        {
          operation: 'activities.delete',
          tripId,
          body: {
            client_request_id: id,
            dayId: visible.dayId,
            targets: visible.targets.map((a) => ({
              activityId: a.id,
              expectedRevision: a.revision,
            })),
            expectedContextRevision: preview.contextRevision,
          },
        },
        () => {
          persisted = true;
          recovered.current.add(id);
          tracked.current = id;
        }
      );
    } catch (e) {
      failure = e;
    } finally {
      if (valid()) {
        const journal = await readConfirmedWebWrites(client).catch(() => null);
        const entry = journal?.[id];
        if (entry && entry.status !== 'pending') finish(entry);
        else if (failure)
          setError(
            failure instanceof Error &&
              ['ledger.wait', 'ledger.pendingWrite'].includes(failure.message)
              ? tLedger(failure.message.slice(7))
              : t(persisted ? 'unknown' : 'saveFailed')
          );
        if (persisted) setPreview(null);
        setBusy(false);
      }
      lock.current = false;
    }
  };
  const context: BatchContext = {
    dayId:
      visible?.dayId ??
      (active && pending?.request.operation === 'activities.delete'
        ? pending.request.body.dayId
        : undefined),
    canLeaveDay: (dayId) => {
      if (!visible || visible.dayId === dayId || pending) return true;
      if (hasSelection && !window.confirm(t('leave'))) return false;
      clear();
      return true;
    },
    selected,
    online,
    busy,
    pending: !!pending,
    start,
    error: error ?? (query.isError ? t('saveFailed') : null),
    limit: days.some((d) => d.id === visible?.dayId && d.activities.length > 15),
    toggle: (a) => {
      if (busy || pending) return;
      setPreview(null);
      setSelection((s) =>
        !s
          ? s
          : {
              ...s,
              targets: s.targets.some((x) => x.id === a.id)
                ? s.targets.filter((x) => x.id !== a.id)
                : s.targets.length < 15
                  ? [...s.targets, structuredClone(a)]
                  : s.targets,
            }
      );
    },
    all: (day) => {
      if (busy || pending) return;
      setPreview(null);
      setSelection((s) =>
        !s || (day.activities.length > 15 && selected.size !== day.activities.length)
          ? s
          : {
              ...s,
              targets:
                selected.size === day.activities.length ? [] : structuredClone(day.activities),
            }
      );
    },
    cancel: cancelSelection,
    review: () => void review(),
  };
  return (
    <Context.Provider value={context}>
      {children}
      <AlertDialog
        open={!!preview && !!visible && !pending}
        onOpenChange={(open) => {
          if (!open && !busy) setPreview(null);
        }}
      >
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('confirmTitle', { count: visible?.targets.length ?? 0 })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('impact')}</AlertDialogDescription>
          </AlertDialogHeader>
          {preview && (
            <>
              <p>
                Day {preview.dayNumber} · {preview.date ?? t('undated')} · {preview.title}
              </p>
              {changed && (
                <div role="alert">
                  <p>{t('conflict')}</p>
                  <p>
                    {t('previous')}: Day {visible?.dayNumber} · {visible?.date ?? t('undated')} ·{' '}
                    {visible?.title}
                  </p>
                </div>
              )}
              <ul className="space-y-2">
                {visible?.targets.map((a) => {
                  const latest = preview.targets.find((x) => x.activityId === a.id);
                  return (
                    <li key={a.id} className="rounded border p-3 break-words">
                      <p>
                        {a.time ?? t('untimed')}
                        {a.end_time ? `–${a.end_time}` : ''} · {a.title}
                      </p>
                      {!latest ? (
                        <span>{t('missing')}</span>
                      ) : (
                        (changed || preview.changedIds.includes(a.id)) && (
                          <p>
                            {t('latest')}: {latest.time ?? t('untimed')} · {latest.title} ·{' '}
                            {latest.locationName} · {t('detailsChanged')}
                          </p>
                        )
                      )}
                      {!latest && (
                        <Button
                          variant="outline"
                          className="min-h-11 h-auto whitespace-normal"
                          onClick={() => {
                            setSelection((s) =>
                              s ? { ...s, targets: s.targets.filter((x) => x.id !== a.id) } : s
                            );
                            setPreview(null);
                          }}
                        >
                          {t('removeMissing')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {changed && !preview.missingIds.length && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelection((s) =>
                      s
                        ? {
                            ...s,
                            title: preview.title,
                            date: preview.date,
                            dayNumber: preview.dayNumber,
                            targets: s.targets.map((a) => {
                              const n = preview.targets.find((x) => x.activityId === a.id)!;
                              return {
                                ...a,
                                revision: n.revision,
                                title: n.title,
                                time: n.time,
                                end_time: n.endTime,
                              };
                            }),
                          }
                        : s
                    );
                    setPreview(null);
                    setChanged(false);
                    setError(t('reviewAgain'));
                  }}
                >
                  {t('acceptChanges')}
                </Button>
              )}
            </>
          )}
          <AlertDialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              className="min-h-11 h-auto whitespace-normal"
              onClick={() => setPreview(null)}
            >
              {t('back')}
            </Button>
            <Button
              variant="destructive"
              disabled={
                busy ||
                !online ||
                changed ||
                !preview?.contextRevision ||
                !!preview?.missingIds.length
              }
              className="min-h-11 h-auto whitespace-normal"
              onClick={() => void confirm()}
            >
              {t('confirm', { count: visible?.targets.length ?? 0 })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Context.Provider>
  );
}

export function ActivityBatchBar({ day }: { day: ItineraryDay }) {
  const batch = useActivityBatchSelection(),
    t = useTranslations('itinerary.batch');
  if (batch?.dayId !== day.id) return null;
  const count = batch.selected.size;
  return (
    <div
      className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 shadow-sm"
      aria-label={t('toolbar')}
    >
      <p role="status" aria-live="polite" className="mr-auto">
        <span className="mr-2 font-medium">Day {day.day_number}</span>
        {batch.pending ? t('unknown') : t('selected', { count })}
      </p>
      {batch.error && (
        <p role="alert" className="w-full text-sm">
          {batch.error}
        </p>
      )}
      {batch.limit && <p className="w-full text-sm">{t('limit', { max: 15 })}</p>}
      {!batch.pending && (
        <>
          <label className="flex min-h-11 items-center gap-2 px-2">
            <Checkbox
              disabled={
                batch.busy || (day.activities.length > 15 && count !== day.activities.length)
              }
              checked={
                count === day.activities.length && count > 0
                  ? true
                  : count
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={() => batch.all(day)}
            />
            {t(count === day.activities.length && count > 0 ? 'unselectAll' : 'selectAll')}
          </label>
          <Button
            variant="outline"
            className="min-h-11 h-auto whitespace-normal"
            disabled={batch.busy}
            onClick={batch.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            className="min-h-11 h-auto whitespace-normal"
            disabled={!count || batch.busy || !batch.online}
            onClick={batch.review}
          >
            {t('delete', { count })}
          </Button>
        </>
      )}
    </div>
  );
}
