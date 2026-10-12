'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  captureConfirmedWebScope,
  confirmedWebKey,
  confirmWebWrite,
  readConfirmedWebWrites,
  resumeConfirmedWebWrite,
  type ConfirmedWebEntry,
  type ConfirmedWebWrite,
} from '@/lib/confirmedWebWrites';

export type TripCreationRequest = Extract<ConfirmedWebWrite, { operation: 'trip.create' }>;
type OwnedEntry = { entry: ConfirmedWebEntry; current: () => boolean };

/** Mirrors the account's durable journal. Missing/failed reads never retire a confirmed intent. */
export function useTripCreationConfirmation(open: boolean) {
  const client = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = captureConfirmedWebScope(client);
  const query = useQuery({
    queryKey: confirmedWebKey,
    queryFn: () => readConfirmedWebWrites(client),
    enabled: open && current(),
    staleTime: Infinity,
    networkMode: 'always',
    retry: false,
  });
  const [owned, setOwned] = useState<OwnedEntry | null>(null);
  const [failure, setFailure] = useState('');
  const [recovering, setRecovering] = useState(false);
  const running = useRef(false);
  const active = owned?.current() ? owned : null;
  const pending = current()
    ? Object.values(query.data ?? {}).find(
        (entry) => entry.status === 'pending' && entry.request.operation === 'trip.create'
      )
    : undefined;
  if (!active && pending) setOwned({ entry: pending, current });
  const record =
    current() && active
      ? (query.data?.[active.entry.request.body.client_request_id] ?? active.entry)
      : pending;
  const frozen = record?.status === 'pending' || record?.status === 'done';
  const ready = current() && query.isSuccess && query.fetchStatus === 'idle';
  const error =
    failure || (record?.status === 'rejected' ? (record.error ?? 'ledger.writeRejected') : '');

  const confirm = async (request: TripCreationRequest) => {
    if (!ready || frozen || running.current) throw new Error('ledger.pendingWrite');
    const owner = captureConfirmedWebScope(client);
    running.current = true;
    setOwned(null);
    setFailure('');
    try {
      const result = await confirmWebWrite(client, request, (entry) => {
        if (owner() && mounted.current) setOwned({ entry, current: owner });
      });
      if (!owner() || !mounted.current) throw new Error('UNAUTHORIZED');
      return result;
    } catch (error) {
      if (owner() && mounted.current)
        setFailure(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      running.current = false;
    }
  };
  const recover = async () => {
    if (!record || running.current) return;
    const owner = captureConfirmedWebScope(client);
    running.current = true;
    setRecovering(true);
    setFailure('');
    try {
      await resumeConfirmedWebWrite(client, record);
    } catch (error) {
      if (owner() && mounted.current)
        setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      if (owner() && mounted.current) {
        // A terminal may have been written by the global recovery entry point as well.
        await query.refetch();
        if (owner() && mounted.current) setRecovering(false);
      }
      running.current = false;
    }
  };
  const acknowledge = useCallback(() => {
    setOwned(null);
    setFailure('');
  }, [setOwned, setFailure]);
  return {
    record,
    frozen,
    ready,
    error,
    recovering,
    confirm,
    recover,
    query,
    current,
    acknowledge,
  };
}
