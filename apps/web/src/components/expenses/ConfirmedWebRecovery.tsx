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
    t = useTranslations('ledger');
  const query = useQuery({
    queryKey: confirmedWebKey,
    queryFn: () => readConfirmedWebWrites(client),
    staleTime: Infinity,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = Object.values(query.data ?? {}).filter((e) => e.status === 'pending');
  if (query.isError)
    return (
      <p role="alert" className="px-4 py-3">
        {t('storageInvalid')}
      </p>
    );
  if (!pending.length) return null;
  return (
    <aside className="border-b bg-muted px-4 py-3" role="status">
      <p>{t('pendingWrite')}</p>
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
              setError('');
              try {
                await resumeConfirmedWebWrite(client, e);
                await query.refetch();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('recover')}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert">
          {t.has(error.replace(/^ledger\./, ''))
            ? t(error.replace(/^ledger\./, ''))
            : t('writeUnknown')}
        </p>
      )}
    </aside>
  );
}
