'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { getTripLanding } from '@/actions/tripLanding.actions';
import { fetchWithPublicFallback } from '@/hooks/queries/fetcher';
import { useAuthenticatedSession } from '@/components/providers/QueryProvider';
import type { TripLanding } from '@/types/tripLanding';
import type { ItineraryDay } from '@/types';
import { buildItineraryPdfModel, type PdfLabels } from '@/lib/exporters/itineraryPdfModel';
import { dateForDayNumber, toDateOnly } from '@/lib/itineraryDayTarget';
import { sanitizeBaseName } from '@/lib/download';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function ItineraryPdfExportDialog({
  tripId,
  days,
  isMember,
  startDate,
  onClose,
}: {
  tripId: string;
  days: ItineraryDay[];
  isMember: boolean;
  startDate?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('export.pdfOptions');
  const tAct = useTranslations('itinerary.activities');
  const locale = useLocale();
  const authenticated = useAuthenticatedSession();
  const client = useQueryClient();
  const saving = useIsMutating() > 0;
  const [selected, setSelected] = useState(() => days.map((day) => day.id));
  const [notes, setNotes] = useState(true);
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<{ url: string; name: string } | null>(null);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const url = useRef<string | null>(null);
  const pending = useRef(false);
  const cancelRender = useRef<(() => void) | null>(null);

  function clearFile() {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setReady(null);
  }
  useEffect(
    () => () => {
      generation.current++;
      cancelRender.current?.();
      worker.current?.terminate();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    []
  );

  async function generate() {
    if (pending.current || !selected.length) return;
    clearFile();
    setError('');
    if (!navigator.onLine) {
      setError(t('offline'));
      return;
    }
    if (client.isMutating()) {
      setError(t('saving'));
      return;
    }
    pending.current = true;
    setBusy(true);
    const run = ++generation.current;
    try {
      // Bypass query/landing caches. The endpoint rechecks membership and strips public fields.
      const snapshot = await fetchWithPublicFallback(
        tripId,
        getTripLanding,
        { path: 'landing', fresh: true },
        null as unknown as TripLanding,
        authenticated
      );
      if (run !== generation.current) return;
      if (!snapshot?.trip || !snapshot.shell || !Array.isArray(snapshot.itinerary))
        throw new Error('PDF_READ_FAILED');
      if (client.isMutating()) throw new Error('PDF_SAVING');
      const labels: PdfLabels = {
        day: t('day', { n: '{n}' }),
        generated: t('generated'),
        range: t('range'),
        outsideRange: t('outsideRange'),
        end: tAct('endTime'),
        confirmation: tAct('confirmationCode'),
        imageOmitted: t('imageOmitted'),
        types: {
          sightseeing: tAct('types.sightseeing'),
          food: tAct('types.food'),
          flight: tAct('types.flight'),
          ground_transport: tAct('types.ground_transport'),
          transport: tAct('types.transport'),
          accommodation: tAct('types.accommodation'),
          shopping: tAct('types.shopping'),
          activity: tAct('types.activity'),
          other: tAct('types.other'),
        },
      };
      const model = buildItineraryPdfModel(
        snapshot.trip,
        snapshot.itinerary,
        {
          dayIds: selected,
          includeNotes: notes,
          includeConfirmation: confirmation,
        },
        isMember && snapshot.shell.role != null,
        locale,
        labels
      );
      const activeWorker = new Worker(
        new URL('../../lib/exporters/itineraryPdf.worker.ts', import.meta.url)
      );
      worker.current = activeWorker;
      const blob = await new Promise<Blob>((resolve, reject) => {
        const fail = () => reject(new Error('PDF_RENDER_FAILED'));
        const timeout = window.setTimeout(fail, 120_000);
        cancelRender.current = () => {
          window.clearTimeout(timeout);
          fail();
        };
        const finish = () => {
          window.clearTimeout(timeout);
          cancelRender.current = null;
        };
        activeWorker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: boolean }>) => {
          finish();
          if (event.data.blob instanceof Blob) resolve(event.data.blob);
          else reject(new Error('PDF_RENDER_FAILED'));
        };
        activeWorker.onerror = () => {
          finish();
          fail();
        };
        activeWorker.onmessageerror = () => {
          finish();
          fail();
        };
        activeWorker.postMessage({
          model,
          fontUrl: new URL('/fonts/TravelCJK-Regular.ttf', window.location.origin).href,
        });
      });
      if (run !== generation.current) return;
      url.current = URL.createObjectURL(blob);
      setReady({ url: url.current, name: `${sanitizeBaseName(snapshot.trip.name)}-itinerary.pdf` });
    } catch (cause) {
      if (run === generation.current)
        setError(
          t(
            cause instanceof Error && cause.message === 'PDF_SELECTION_CHANGED'
              ? 'selectionChanged'
              : 'failed'
          )
        );
    } finally {
      if (run === generation.current) {
        cancelRender.current?.();
        worker.current?.terminate();
        worker.current = null;
        cancelRender.current = null;
        pending.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="space-y-4">
          <legend className="mb-2 font-medium">{t('range')}</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.length === days.length}
              onChange={(event) => {
                clearFile();
                setSelected(event.target.checked ? days.map((day) => day.id) : []);
              }}
            />
            {t('allDays')}
          </label>
          <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border p-3">
            {days.map((day) => (
              <label key={day.id} className="flex items-start gap-2">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={selected.includes(day.id)}
                  onChange={(event) => {
                    clearFile();
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, day.id]
                        : current.filter((id) => id !== day.id)
                    );
                  }}
                />
                <span>
                  {t('day', { n: day.day_number })}
                  {toDateOnly(startDate)
                    ? ` · ${dateForDayNumber(toDateOnly(startDate)!, day.day_number)}`
                    : ''}
                  {day.title ? ` · ${day.title}` : ''}
                </span>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notes}
              onChange={(event) => {
                clearFile();
                setNotes(event.target.checked);
              }}
            />
            {t('includeNotes')}
          </label>
          {isMember && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={confirmation}
                onChange={(event) => {
                  clearFile();
                  setConfirmation(event.target.checked);
                }}
              />
              {t('includeConfirmation')}
            </label>
          )}
        </fieldset>
        <p className="text-xs text-muted-foreground">{t('privacy')}</p>
        {saving && (
          <p role="status" className="text-sm">
            {t('saving')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div role="status" aria-live="polite" className="text-sm">
          {busy ? t('generating') : ready ? t('ready') : ''}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('close')}
          </Button>
          {ready ? (
            <>
              <Button asChild variant="outline">
                <a href={ready.url} target="_blank" rel="noopener noreferrer">
                  {t('open')}
                </a>
              </Button>
              <Button asChild>
                <a href={ready.url} download={ready.name}>
                  {t('download')}
                </a>
              </Button>
            </>
          ) : (
            <Button
              disabled={busy || saving || selected.length === 0}
              onClick={() => void generate()}
            >
              {t('generate')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
