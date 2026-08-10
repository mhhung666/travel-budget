'use client';

import { AlertTriangle, CheckCircle2, Keyboard, Loader2, ScanLine, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ReceiptUploader } from '@/components/trips/detail/ReceiptAttachments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { NormalizedExpenseTextDraft } from '@/lib/ai/normalizeExpenseTextDraft';
import type { ReceiptDraft } from '@/lib/ai/receiptDraftSchema';
import type { ExpenseAttachment, Member } from '@/types';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type PendingDraft =
  | { source: 'text'; draft: NormalizedExpenseTextDraft }
  | { source: 'receipt'; draft: ReceiptDraft };

type PreviewRow = {
  label: string;
  value: string;
  needsReview?: boolean;
};

function readErrorCode(body: unknown): string {
  if (!body || typeof body !== 'object') return 'UNKNOWN';
  const error = 'error' in body ? body.error : undefined;
  if (!error || typeof error !== 'object' || !('code' in error)) return 'UNKNOWN';
  return typeof error.code === 'string' ? error.code : 'UNKNOWN';
}

/**
 * Unified entry point for manual, natural-language and receipt-assisted expense entry.
 * AI results remain pending until the user explicitly applies them to the editable form.
 */
export function ExpenseAiInput({
  open,
  tripId,
  attachments,
  onAttachmentsChange,
  members,
  onApplyTextDraft,
  onApplyReceiptDraft,
}: {
  open: boolean;
  tripId: string;
  attachments: ExpenseAttachment[];
  onAttachmentsChange: (next: ExpenseAttachment[]) => void;
  members: Member[];
  onApplyTextDraft: (draft: NormalizedExpenseTextDraft) => void;
  onApplyReceiptDraft: (draft: ReceiptDraft) => void;
}) {
  const t = useTranslations('expense.form.ai');
  const tReceipt = useTranslations('expense.receipts');
  const tCategory = useTranslations('category');
  const [mode, setMode] = useState('manual');
  const [sourceText, setSourceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [pending, setPending] = useState<PendingDraft | null>(null);
  const [applied, setApplied] = useState(false);
  const [selectedReceiptKey, setSelectedReceiptKey] = useState('');

  const images = attachments.filter((attachment) => imageTypes.has(attachment.content_type));
  const receiptKey = images.some((image) => image.key === selectedReceiptKey)
    ? selectedReceiptKey
    : (images[0]?.key ?? '');

  useEffect(() => {
    if (open) return;
    setMode('manual');
    setSourceText('');
    setLoading(false);
    setErrorCode('');
    setPending(null);
    setApplied(false);
    setSelectedReceiptKey('');
  }, [open]);

  const beginRequest = () => {
    setLoading(true);
    setErrorCode('');
    setPending(null);
    setApplied(false);
  };

  const parseText = async () => {
    if (!sourceText.trim()) return;
    beginRequest();
    try {
      const response = await fetch('/api/ai/expense-text-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, sourceText }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        setErrorCode(readErrorCode(body));
        return;
      }
      setPending({ source: 'text', draft: body.draft as NormalizedExpenseTextDraft });
    } catch {
      setErrorCode('UNKNOWN');
    } finally {
      setLoading(false);
    }
  };

  const parseReceipt = async () => {
    if (!receiptKey) return;
    beginRequest();
    try {
      const response = await fetch('/api/ai/receipt-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, key: receiptKey }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        setErrorCode(readErrorCode(body));
        return;
      }
      setPending({ source: 'receipt', draft: body.draft as ReceiptDraft });
    } catch {
      setErrorCode('UNKNOWN');
    } finally {
      setLoading(false);
    }
  };

  const applyDraft = () => {
    if (!pending) return;
    if (pending.source === 'text') onApplyTextDraft(pending.draft);
    else onApplyReceiptDraft(pending.draft);
    setApplied(true);
  };

  let rows: PreviewRow[] = [];
  let needsReview = false;
  if (pending?.source === 'text') {
    const { draft } = pending;
    const payer = members.find((member) => member.id === draft.payerId)?.display_name;
    const participants = members
      .filter((member) => draft.participantIds.includes(member.id))
      .map((member) => member.display_name)
      .join(t('listSeparator'));
    rows = [
      { label: t('fields.description'), value: draft.description },
      { label: t('fields.amount'), value: String(draft.originalAmount) },
      {
        label: t('fields.currency'),
        value: draft.currency ?? t('notRecognized'),
        needsReview: !draft.currency,
      },
      {
        label: t('fields.payer'),
        value: payer ?? draft.payerName ?? t('notRecognized'),
        needsReview: !draft.payerId,
      },
      {
        label: t('fields.split'),
        value: participants || t('notRecognized'),
        needsReview: !draft.resolvedSplit,
      },
      ...(draft.date ? [{ label: t('fields.date'), value: draft.date }] : []),
      ...(draft.category
        ? [{ label: t('fields.category'), value: tCategory(draft.category) }]
        : []),
    ];
    needsReview = draft.requiresCorrection;
  } else if (pending?.source === 'receipt') {
    const { draft } = pending;
    const totals = draft.amountCandidates.filter((candidate) => candidate.kind === 'total');
    const total = totals.length === 1 ? String(totals[0].amount) : t('notRecognized');
    rows = [
      {
        label: t('fields.description'),
        value: draft.merchantName ?? t('notRecognized'),
        needsReview: draft.fieldStatus.merchantName !== 'read',
      },
      {
        label: t('fields.amount'),
        value: total,
        needsReview: draft.fieldStatus.total !== 'read' || totals.length !== 1,
      },
      {
        label: t('fields.currency'),
        value: draft.currency ?? t('notRecognized'),
        needsReview: draft.fieldStatus.currency !== 'read',
      },
      {
        label: t('fields.date'),
        value: draft.transactionDate ?? t('notRecognized'),
        needsReview: draft.fieldStatus.transactionDate !== 'read',
      },
      ...(draft.suggestedCategory
        ? [{ label: t('fields.category'), value: tCategory(draft.suggestedCategory) }]
        : []),
    ];
    needsReview = draft.warnings.length > 0 || rows.some((row) => row.needsReview);
  }

  return (
    <section
      className="space-y-3 rounded-xl border bg-muted/20 p-3"
      aria-labelledby="expense-ai-title"
    >
      <div className="flex items-start gap-2">
        <span className="rounded-lg bg-primary/10 p-2 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 id="expense-ai-title" className="text-sm font-semibold">
            {t('title')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
      </div>

      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value);
          setErrorCode('');
          setPending(null);
          setApplied(false);
        }}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual">
            <Keyboard className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('modes.manual')}
          </TabsTrigger>
          <TabsTrigger value="text">
            <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('modes.text')}
          </TabsTrigger>
          <TabsTrigger value="receipt">
            <ScanLine className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('modes.receipt')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mb-0 text-sm text-muted-foreground">
          {t('manualHint')}
        </TabsContent>

        <TabsContent value="text" className="mb-0 space-y-2">
          <Label htmlFor="expense-ai-source" className="sr-only">
            {t('sourceLabel')}
          </Label>
          <Textarea
            id="expense-ai-source"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder={t('sourcePlaceholder')}
          />
          <Button
            type="button"
            variant="outline"
            onClick={parseText}
            disabled={loading || !sourceText.trim()}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('createDraft')}
          </Button>
        </TabsContent>

        <TabsContent value="receipt" className="mb-0 space-y-3">
          <div className="space-y-2">
            <Label>{tReceipt('label')}</Label>
            <ReceiptUploader tripId={tripId} value={attachments} onChange={onAttachmentsChange} />
          </div>
          {images.length > 1 && (
            <select
              aria-label={tReceipt('scanImage')}
              value={receiptKey}
              onChange={(event) => setSelectedReceiptKey(event.target.value)}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {images.map((image, index) => (
                <option key={image.key} value={image.key}>
                  {tReceipt('scanImageNumber', { number: index + 1 })}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={parseReceipt}
            disabled={loading || !receiptKey}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanLine className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {tReceipt('scan')}
          </Button>
          {attachments.length > 0 && images.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('imageOnlyHint')}</p>
          )}
        </TabsContent>
      </Tabs>

      {errorCode && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${errorCode}`)}
        </p>
      )}

      {pending && (
        <div className="space-y-3 rounded-lg border bg-background p-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{t('previewTitle')}</h4>
            <Badge
              variant={needsReview ? 'outline' : 'secondary'}
              className={needsReview ? 'border-amber-500 text-amber-700 dark:text-amber-300' : ''}
            >
              {needsReview ? (
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
              )}
              {needsReview ? t('needsReview') : t('ready')}
            </Badge>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0 rounded-md bg-muted/40 px-3 py-2">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  {row.label}
                  {row.needsReview && (
                    <AlertTriangle
                      className="h-3 w-3 text-amber-600"
                      aria-label={t('needsReview')}
                    />
                  )}
                </dt>
                <dd className="truncate text-sm font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {needsReview ? t('reviewHint') : t('readyHint')}
          </p>
          <Button
            type="button"
            onClick={applyDraft}
            disabled={applied}
            className="w-full sm:w-auto"
          >
            {applied && <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            {applied ? t('applied') : t('apply')}
          </Button>
        </div>
      )}
    </section>
  );
}
