'use client';

import { Loader2, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ReceiptDraft } from '@/lib/ai/receiptDraftSchema';
import type { ExpenseAttachment } from '@/types';
import { Button } from '@/components/ui/button';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Runs the receipt draft endpoint for one already-private uploaded image. */
export function ReceiptScanButton({
  tripId,
  attachments,
  onDraft,
}: {
  tripId: string;
  attachments: ExpenseAttachment[];
  onDraft: (draft: ReceiptDraft) => boolean;
}) {
  const t = useTranslations('expense.receipts');
  const images = attachments.filter((attachment) => imageTypes.has(attachment.content_type));
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const selectedKey = images.some((image) => image.key === key) ? key : (images[0]?.key ?? '');

  if (images.length === 0) return null;

  const scan = async () => {
    if (!selectedKey) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/ai/receipt-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, key: selectedKey }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error();
      setMessage(onDraft(body.draft as ReceiptDraft) ? t('scanReview') : t('scanApplied'));
    } catch {
      setMessage(t('scanFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {images.length > 1 && (
        <select
          aria-label={t('scanImage')}
          value={selectedKey}
          onChange={(event) => setKey(event.target.value)}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {images.map((image, index) => (
            <option key={image.key} value={image.key}>
              {t('scanImageNumber', { number: index + 1 })}
            </option>
          ))}
        </select>
      )}
      <Button type="button" variant="outline" onClick={scan} disabled={loading || !selectedKey}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ScanLine className="mr-2 h-4 w-4" />
        )}
        {t('scan')}
      </Button>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
