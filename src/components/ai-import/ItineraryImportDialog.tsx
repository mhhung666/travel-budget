'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { countImportCharacters, ITINERARY_IMPORT_LIMITS } from '@/lib/ai/importLimits';
import {
  itineraryImportDraftSchema,
  type ItineraryImportDraft,
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
  onPreviewReady?: (draft: ItineraryImportDraft) => void;
};

type ImportApiResponse =
  | { success: true; draft: unknown }
  | { success: false; error?: { code?: ItineraryImportErrorCode } };

export default function ItineraryImportDialog({
  open,
  onClose,
  tripId,
  tripStartDate,
  tripEndDate,
  onPreviewReady,
}: ItineraryImportDialogProps) {
  const t = useTranslations('itinerary.aiImport');
  const tCommon = useTranslations('common');
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [sourceText, setSourceText] = useState('');
  const [preview, setPreview] = useState<ItineraryImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<ItineraryImportErrorCode | null>(null);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- every open starts a separate import session
    setSourceText('');
    setPreview(null);
    setErrorCode(null);
    setPreviewReady(false);
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
    setPreviewReady(false);
    try {
      const response = await fetch('/api/ai/itinerary-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, sourceText }),
      });
      const body = (await response.json()) as ImportApiResponse;
      if (!response.ok || !body.success) {
        setErrorCode(body.success ? 'INTERNAL_ERROR' : (body.error?.code ?? 'INTERNAL_ERROR'));
        return;
      }
      const draft = itineraryImportDraftSchema.safeParse(body.draft);
      if (!draft.success) {
        setErrorCode('INVALID_MODEL_OUTPUT');
        return;
      }
      setPreview(createItineraryImportPreview(draft.data));
    } catch {
      setErrorCode('INTERNAL_ERROR');
    } finally {
      setLoading(false);
    }
  };

  const confirmPreview = () => {
    if (!preview || !canConfirmPreview) return;
    const draft = toItineraryImportDraft(preview);
    if (!draft) return;
    setPreviewReady(true);
    onPreviewReady?.(draft);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex max-h-[94vh] w-[calc(100vw-1rem)] max-w-4xl flex-col p-4 sm:p-6">
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
              {previewReady && (
                <Alert variant="success">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>{t('previewReadyTitle')}</AlertTitle>
                  <AlertDescription>{t('previewReadyDescription')}</AlertDescription>
                </Alert>
              )}
              <ImportPreview
                preview={preview}
                issues={issues}
                tripStartDate={tripStartDate}
                tripEndDate={tripEndDate}
                onChange={(nextPreview) => {
                  setPreview(nextPreview);
                  setPreviewReady(false);
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
                  setPreviewReady(false);
                  requestAnimationFrame(() => sourceRef.current?.focus());
                }}
              >
                {t('backToSource')}
              </Button>
              <Button type="button" onClick={confirmPreview} disabled={!canConfirmPreview}>
                {t('confirmPreview')}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
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
