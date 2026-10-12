import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { tripSettingsSchema, type TripSettings } from '@/api/contracts';
import { ApiError } from '@/api/client';
import { useTripEntry } from '@/features/tripEntry/provider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { openMutationStore } from '@/storage/pendingExpenseDatabase';
import { LocalRateLimitError } from '@/features/expenses/entry';
import { errorMessage } from '@/features/auth/errorMessage';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { Action, Copy, Notice, Section } from '@/components/ui';
import { ArchiveFlow } from './archiveFlow';
import { refreshManagedTrip } from './managementRefresh';

type Props = {
  tripId: string;
  archived: boolean;
  context?: TripSettings;
  disabled?: boolean;
  testID?: string;
  onBusy?: (busy: boolean) => void;
  onCommitted?: (archived: boolean) => void;
  onSettled?: () => void;
  onCloseBlocked?: (blocked: boolean) => void;
};
export function PersonalArchive(props: Props) {
  const { scope, manager } = useTripEntry();
  if (!scope) return null;
  return (
    <ArchiveControls
      key={`${scope.environment}:${scope.accountId}:${manager.getSignInVersion()}:${props.tripId}`}
      {...props}
    />
  );
}
function ArchiveControls({
  tripId,
  archived,
  context,
  disabled,
  testID = 'trip-archive',
  onBusy,
  onCommitted,
  onSettled,
  onCloseBlocked,
}: Props) {
  const { entry, scope, manager } = useTripEntry();
  const { catalog } = useDraftCatalog();
  const client = useQueryClient();
  const t = useMessages();
  const online = useOnline();
  const blocked = useRef(disabled);
  useLayoutEffect(() => {
    blocked.current = disabled;
  }, [disabled]);
  const [flow] = useState(() => {
    const version = manager.getSignInVersion();
    const current = () =>
      !!scope &&
      manager.getSignInVersion() === version &&
      manager.api.environment === scope.environment &&
      manager.getSnapshot().status === 'signedIn' &&
      manager.getSnapshot().user?.id === scope.accountId;
    return new ArchiveFlow(
      {
        current,
        guard: async () => {
          if (!current() || !scope) throw new ApiError('CANCELLED');
          const access = catalog.captureAccess(scope);
          const store = await openMutationStore();
          await store.retryAt(scope);
          return () => {
            if (
              blocked.current ||
              !current() ||
              !onlineManager.isOnline() ||
              AppState.currentState !== 'active'
            )
              throw new ApiError('CANCELLED');
            access(tripId);
            if (!catalog.isVisible(scope, tripId)) throw new ApiError('CANCELLED');
            const until = store.rateLimitUntil(scope);
            if (until > Date.now()) throw new LocalRateLimitError(until, Date.now());
          };
        },
        read: async (beforeSend) => {
          const unchanged = catalog.captureArchive(scope!);
          const result = await manager.requestAs(
            scope!.accountId,
            `/trips/${encodeURIComponent(tripId)}/settings`,
            tripSettingsSchema,
            { beforeSend }
          );
          beforeSend();
          if (unchanged(tripId)) await catalog.rememberArchived(scope!, tripId, result.archived);
          beforeSend();
          return result;
        },
        refresh: () => refreshManagedTrip(client, manager, catalog, scope!, tripId),
        confirm: (body) => entry.confirm(scope!, { operation: 'trip.archive', tripId, body }),
        failed: async (error) => {
          if (!current()) return;
          if (
            error instanceof ApiError &&
            error.status === 429 &&
            !(error instanceof LocalRateLimitError)
          )
            await (
              await openMutationStore()
            ).pause(scope!, Date.now() + (error.retryAfter ?? 30) * 1000);
          if (
            error instanceof ApiError &&
            [403, 404].includes(error.status) &&
            error.code === 'NOT_FOUND'
          )
            await catalog.deny(scope!, tripId);
        },
      },
      context ?? { archived }
    );
  });
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const busy =
    state.status === 'reading' || state.status === 'sending' || state.refreshing === true;
  useEffect(() => {
    flow.activate();
    const connection = onlineManager.subscribe((connected) => {
      if (!connected) flow.invalidate();
    });
    const background = AppState.addEventListener('change', (status) => {
      if (status !== 'active') flow.invalidate();
    });
    return () => {
      flow.dispose();
      connection();
      background.remove();
    };
  }, [flow]);
  useEffect(() => {
    onBusy?.(busy);
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  useEffect(() => {
    onCloseBlocked?.(busy || state.status === 'pending');
    return () => onCloseBlocked?.(false);
  }, [busy, state.status, onCloseBlocked]);
  useEffect(() => {
    if (disabled) flow.invalidate();
  }, [disabled, flow]);
  useEffect(() => {
    if (state.status === 'done' && state.archived !== undefined) onCommitted?.(state.archived);
  }, [state.status, state.archived, onCommitted]);
  useEffect(() => {
    if (state.status === 'done' && state.refreshed === true) onSettled?.();
  }, [state.status, state.refreshed, onSettled]);
  if (!scope || !catalog.isVisible(scope, tripId))
    return <Notice tone="danger">{t.notFound}</Notice>;
  const activeArchived = state.context?.archived ?? state.archived ?? archived;
  return (
    <Section title={t.personalArchive}>
      <Copy>{t.personalArchiveHint}</Copy>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {state.status === 'error' && (
        <Notice tone="warning">
          {state.error === 'blocked'
            ? t.operationBlocked
            : state.error === 'not-sent'
              ? t.operationNotSent
              : errorMessage(state.error, t)}
        </Notice>
      )}
      {state.status === 'error' && state.error === 'blocked' && (
        <Action label={t.pendingOperations} onPress={() => router.push('/trips/operations')} />
      )}
      {state.status === 'conflict' && <Notice tone="warning">{t.tripSettingsChanged}</Notice>}
      {state.status === 'done' && <Notice tone="success">{t.operationDone}</Notice>}
      {state.status === 'done' && state.refreshed === false && (
        <>
          <Notice tone="warning">{t.staleData}</Notice>
          <Action
            label={t.refresh}
            disabled={!online || busy}
            busy={busy}
            onPress={() => void flow.refresh()}
          />
        </>
      )}
      {state.status === 'pending' ? (
        <>
          <Notice tone="warning">{t.operationUnknown}</Notice>
          <Action
            testID={`${testID}-pending`}
            label={t.pendingOperations}
            onPress={() => router.push('/trips/operations')}
          />
        </>
      ) : state.status === 'review' || state.status === 'sending' ? (
        <>
          <Copy>{state.context?.name}</Copy>
          <Copy>{state.archived ? t.archiveTrip : t.unarchiveTrip}</Copy>
          <Action
            testID={`${testID}-confirm`}
            label={t.confirmExpenseEdit}
            busy={busy}
            disabled={!online || disabled}
            onPress={() => void flow.submit()}
          />
          <Action
            testID={`${testID}-cancel`}
            variant="ghost"
            label={t.cancel}
            disabled={busy}
            onPress={() => flow.cancel()}
          />
        </>
      ) : (
        <Action
          testID={testID}
          variant="secondary"
          label={activeArchived ? t.unarchiveTrip : t.archiveTrip}
          busy={busy}
          disabled={!online || disabled}
          onPress={() => void flow.review()}
        />
      )}
    </Section>
  );
}
