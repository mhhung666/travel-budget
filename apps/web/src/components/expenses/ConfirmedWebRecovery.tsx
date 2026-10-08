'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  confirmedWebKey,
  readConfirmedWebWrites,
  resumeConfirmedWebWrite,
} from '@/lib/confirmedWebWrites';
import { Button } from '@/components/ui/button';
export function ConfirmedWebRecovery() {
  const client = useQueryClient(),
    t = useTranslations('ledger'),
    tCommon = useTranslations('common');
  const query = useQuery({
    queryKey: confirmedWebKey,
    queryFn: () => readConfirmedWebWrites(client),
    staleTime: Infinity,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<{ id: string; message: string } | null>(null);
  const pending = Object.values(query.data ?? {}).filter((e) => e.status === 'pending');
  const failedEntry = error ? query.data?.[error.id] : undefined;
  const shownError = failedEntry ? error : null;
  const errorKey = shownError?.message.replace(/^ledger\./, '');
  const rejected = failedEntry?.status === 'rejected';
  if (query.isError)
    return (
      <p role="alert" className="px-4 py-3">
        {t('storageInvalid')}
      </p>
    );
  if (!pending.length && !shownError) return null;
  return (
    <aside className="border-b bg-muted px-4 py-3" role="status">
      {pending.length > 0 && <p>{t('pendingWrite')}</p>}
      {pending.map((e) => (
        <div key={e.request.body.client_request_id} className="flex items-center gap-3">
          <span>
            {t(`operations.${e.request.operation.replace('.', '_')}`)}
            {'tripId' in e.request ? ` · ${e.request.body.base_currency}` : ''}
          </span>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await resumeConfirmedWebWrite(client, e);
                await query.refetch();
              } catch (err) {
                setError({
                  id: e.request.body.client_request_id,
                  message: err instanceof Error ? err.message : String(err),
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('recover')}
          </Button>
        </div>
      ))}
      {shownError && (
        <div>
          <div role="alert">
            {rejected && <p>{t('writeRejected')}</p>}
            {errorKey && t.has(errorKey) ? (
              <p>{t(errorKey)}</p>
            ) : (
              !rejected && <p>{t('writeUnknown')}</p>
            )}
          </div>
          <Button variant="ghost" disabled={busy} onClick={() => setError(null)}>
            {tCommon('close')}
          </Button>
        </div>
      )}
    </aside>
  );
}
