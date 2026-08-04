'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  confirmItineraryImport,
  type ItineraryImportConfirmation,
} from '@/actions/itineraryImport.actions';
import { countImportCharacters, ITINERARY_IMPORT_LIMITS } from '@/lib/ai/importLimits';
import { trackProductEvent } from '@/lib/productEvents';
import {
  itineraryImportDraftSchema,
  type ItineraryImportErrorCode,
} from '@/lib/ai/itineraryImportSchema';
import {
  createItineraryImportPreview,
  toItineraryImportDraft,
  validateItineraryImportPreview,
  type ItineraryImportPreview,
} from '@/lib/ai/itineraryImportPreview';
import ImportPreview from './ImportPreview';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ItineraryImportDialogProps = {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  onImported?: () => void;
};

type ImportApiResponse =
  | { success: true; draft: unknown }
  | { success: false; error?: { code?: ItineraryImportErrorCode } };

function mergeConfirmations(
  previous: ItineraryImportConfirmation | null,
  next: ItineraryImportConfirmation
): ItineraryImportConfirmation {
  if (!previous || previous.operationId !== next.operationId) return next;
  const byDate = new Map(previous.days.map((day) => [day.date, day]));
  next.days.forEach((day) => byDate.set(day.date, day));
  const days = [...byDate.values()];
  return {
    operationId: next.operationId,
    days,
    summary: {
      successfulDays: days.filter((day) => day.status === 'success').length,
      addedActivities: days.reduce((sum, day) => sum + day.addedActivities, 0),
      alreadyImportedDays: days.filter((day) => day.status === 'already_imported').length,
      failedDays: days.filter((day) => day.status === 'failed').length,
    },
  };
}

export default function ItineraryImportDialog({
  open,
  onClose,
  tripId,
  tripStartDate,
  tripEndDate,
  onImported,
}: ItineraryImportDialogProps) {
  const t = useTranslations('itinerary.aiImport');
  const tCommon = useTranslations('common');
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const cancellationTrackedRef = useRef(false);
  const [sourceText, setSourceText] = useState('');
  const [preview, setPreview] = useState<ItineraryImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<ItineraryImportErrorCode | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState<ItineraryImportConfirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [previewCorrected, setPreviewCorrected] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- every open starts a separate import session
    setSourceText('');
    setPreview(null);
    setErrorCode(null);
    setOperationId(null);
    setConfirmation(null);
    setConfirmationError(null);
    setPreviewCorrected(false);
    cancellationTrackedRef.current = false;
    requestAnimationFrame(() => sourceRef.current?.focus());
  }, [open]);

  const sourceCharacters = countImportCharacters(sourceText);
  const sourceTooLong = sourceCharacters > ITINERARY_IMPORT_LIMITS.sourceCharacters;
  const issues = useMemo(
    () =>
      preview
        ? validateItineraryImportPreview(preview, {
            startDate: tripStartDate,
            endDate: tripEndDate,
          })
        : [],
    [preview, tripStartDate, tripEndDate]
  );
  const canConfirmPreview =
    !!preview && issues.length === 0 && toItineraryImportDraft(preview) !== null;

  const parseSource = async () => {
    if (!sourceText.trim() || sourceTooLong || loading) return;
    setLoading(true);
    setErrorCode(null);
    setPreview(null);
    setOperationId(null);
    setConfirmation(null);
    setConfirmationError(null);
    setPreviewCorrected(false);
    trackProductEvent('ai_itinerary_import', {
      stage: 'parse_started',
      result: 'pending',
      corrected: 'unknown',
      errorCode: 'none',
    });
    try {
      const response = await fetch('/api/ai/itinerary-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, sourceText }),
      });
      const body = (await response.json()) as ImportApiResponse;
      if (!response.ok || !body.success) {
        const code = body.success ? 'INTERNAL_ERROR' : (body.error?.code ?? 'INTERNAL_ERROR');
        setErrorCode(code);
        trackProductEvent('ai_itinerary_import', {
          stage: 'parse_failed',
          result: 'failure',
          corrected: 'unknown',
          errorCode: code,
        });
        return;
      }
      const draft = itineraryImportDraftSchema.safeParse(body.draft);
      if (!draft.success) {
        setErrorCode('INVALID_MODEL_OUTPUT');
        trackProductEvent('ai_itinerary_import', {
          stage: 'parse_failed',
          result: 'failure',
          corrected: 'unknown',
          errorCode: 'INVALID_MODEL_OUTPUT',
        });
        return;
      }
      setPreview(createItineraryImportPreview(draft.data));
      setOperationId(crypto.randomUUID());
      trackProductEvent('ai_itinerary_import', {
        stage: 'preview_shown',
        result: 'success',
        corrected: 'no',
        errorCode: 'none',
      });
    } catch {
      setErrorCode('INTERNAL_ERROR');
      trackProductEvent('ai_itinerary_import', {
        stage: 'parse_failed',
        result: 'failure',
        corrected: 'unknown',
        errorCode: 'INTERNAL_ERROR',
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmPreview = async () => {
    if (!preview || !canConfirmPreview || !operationId || confirming) return;
    const draft = toItineraryImportDraft(preview);
    if (!draft) return;
    setConfirming(true);
    setConfirmationError(null);
    trackProductEvent('ai_itinerary_import', {
      stage: 'confirm_started',
      result: 'pending',
      corrected: previewCorrected ? 'yes' : 'no',
      errorCode: 'none',
    });
    try {
      const result = await confirmItineraryImport(tripId, { operationId, draft });
      if (!result.success) {
        setConfirmationError(result.code ?? 'INTERNAL_ERROR');
        trackProductEvent('ai_itinerary_import', {
          stage: 'confirm_failed',
          result: 'failure',
          corrected: previewCorrected ? 'yes' : 'no',
          errorCode: 'CONFIRMATION_ERROR',
        });
        return;
      }
      setConfirmation((previous) => mergeConfirmations(previous, result.data));
      if (result.data.summary.failedDays > 0) {
        const failedDates = new Set(
          result.data.days.filter((day) => day.status === 'failed').map((day) => day.date)
        );
        const retryDraft = toItineraryImportDraft({
          ...preview,
          days: preview.days.map((day) => ({
            ...day,
            included: failedDates.has(day.date),
          })),
        });
        if (retryDraft) setPreview(createItineraryImportPreview(retryDraft));
      }
      if (result.data.summary.addedActivities > 0 || result.data.summary.successfulDays > 0) {
        onImported?.();
      }
      trackProductEvent('ai_itinerary_import', {
        stage: 'confirmed',
        result: result.data.summary.failedDays > 0 ? 'partial' : 'success',
        corrected: previewCorrected ? 'yes' : 'no',
        errorCode: 'none',
      });
    } catch {
      setConfirmationError('INTERNAL_ERROR');
      trackProductEvent('ai_itinerary_import', {
        stage: 'confirm_failed',
        result: 'failure',
        corrected: previewCorrected ? 'yes' : 'no',
        errorCode: 'CONFIRMATION_ERROR',
      });
    } finally {
      setConfirming(false);
    }
  };

  const importFinished = confirmation?.summary.failedDays === 0;

  const closeDialog = () => {
    if (!cancellationTrackedRef.current && !importFinished && (sourceText.trim() || preview)) {
      cancellationTrackedRef.current = true;
      trackProductEvent('ai_itinerary_import', {
        stage: 'cancelled',
        result: 'cancelled',
        corrected: preview ? (previewCorrected ? 'yes' : 'no') : 'unknown',
        errorCode: 'none',
      });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeDialog()}>
      <DialogContent
        className="flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-4xl flex-col p-4 sm:p-6"
        aria-busy={loading || confirming}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Sparkles className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-0.5">
          {!preview ? (
            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <div className="flex items-end justify-between gap-3">
                  <Label htmlFor="ai-itinerary-source">{t('sourceLabel')}</Label>
                  <span
                    className={`text-xs ${sourceTooLong ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                    aria-live="polite"
                  >
                    {t('characterCount', {
                      count: sourceCharacters,
                      limit: ITINERARY_IMPORT_LIMITS.sourceCharacters,
                    })}
                  </span>
                </div>
                <Textarea
                  ref={sourceRef}
                  id="ai-itinerary-source"
                  className="min-h-[280px] resize-y"
                  value={sourceText}
                  placeholder={t('sourcePlaceholder')}
                  aria-invalid={sourceTooLong}
                  onChange={(event) => setSourceText(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('privacyHint')}</p>
              </div>

              {errorCode && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('parseFailed')}</AlertTitle>
                  <AlertDescription>{t(`errors.${errorCode}`)}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-1">
              {confirmation && (
                <Alert variant={confirmation.summary.failedDays > 0 ? 'destructive' : 'success'}>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>
                    {confirmation.summary.failedDays > 0
                      ? t('resultPartialTitle')
                      : t('resultSuccessTitle')}
                  </AlertTitle>
                  <AlertDescription>
                    {t('resultSummary', {
                      days: confirmation.summary.successfulDays,
                      activities: confirmation.summary.addedActivities,
                      skipped: confirmation.summary.alreadyImportedDays,
                      failed: confirmation.summary.failedDays,
                    })}
                    <ul className="mt-2 space-y-1">
                      {confirmation.days.map((day, index) => (
                        <li key={`${day.date}-${index}`}>
                          {day.date || t('unknownDate')}：
                          {day.status === 'failed'
                            ? t(`confirmErrors.${day.errorCode ?? 'INTERNAL_ERROR'}`)
                            : t(`resultStatus.${day.status}`)}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {confirmationError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('confirmFailed')}</AlertTitle>
                  <AlertDescription>{t(`confirmErrors.${confirmationError}`)}</AlertDescription>
                </Alert>
              )}
              <ImportPreview
                preview={preview}
                issues={issues}
                tripStartDate={tripStartDate}
                tripEndDate={tripEndDate}
                onChange={(nextPreview) => {
                  setPreview(nextPreview);
                  setPreviewCorrected(true);
                  setConfirmation(null);
                  setConfirmationError(null);
                }}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t pt-4 sm:space-x-0">
          {preview ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setOperationId(null);
                  setConfirmation(null);
                  setConfirmationError(null);
                  requestAnimationFrame(() => sourceRef.current?.focus());
                }}
              >
                {t('backToSource')}
              </Button>
              <Button
                type="button"
                onClick={importFinished ? closeDialog : confirmPreview}
                disabled={!importFinished && (!canConfirmPreview || confirming)}
              >
                {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {importFinished
                  ? tCommon('close')
                  : confirmation
                    ? t('retryFailed')
                    : t('confirmImport')}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={loading}>
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                onClick={parseSource}
                disabled={loading || !sourceText.trim() || sourceTooLong}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('parse')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
