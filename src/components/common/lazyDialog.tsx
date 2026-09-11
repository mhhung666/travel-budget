'use client';

import { Component, Suspense, lazy, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { ResponsiveFormSheet } from './ResponsiveFormSheet';
import { ErrorState } from './ErrorState';

type CloseControl = { open: boolean; onClose: () => void };
type DialogControl = CloseControl | { open: boolean; onOpenChange: (open: boolean) => void };

function LoadingDialog({ open, onClose, onRetry }: CloseControl & { onRetry?: () => void }) {
  const t = useTranslations('common');
  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t(onRetry ? 'errorTitle' : 'loading')}
      description={t('loading')}
    >
      {onRetry ? (
        <ErrorState message={t('queryLoadFailed')} onRetry={onRetry} />
      ) : (
        <div role="status" className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p>{t('loading')}</p>
        </div>
      )}
    </ResponsiveFormSheet>
  );
}

class ChunkBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Import only on first open. Keep the resolved component mounted afterwards so each
 * dialog retains its existing close/reset/draft semantics. Explicit preload can overlap
 * the requested form's chunk with its metadata reads (never use it on an idle page). Pending imports never reopen
 * a dismissed dialog. A failed import gets a fresh lazy promise on explicit retry. */
export function lazyDialog<P extends DialogControl>(
  load: () => Promise<{ default: ComponentType<P> }>
) {
  return function LazyDialog(props: P & { preload?: boolean }) {
    const [activated, setActivated] = useState(false);
    const [entry, setEntry] = useState(() => ({ View: lazy(load), attempt: 0 }));
    const requested = props.open || props.preload;
    if (requested && !activated) setActivated(true);
    if (!activated && !requested) return null;
    const onClose = () => ('onClose' in props ? props.onClose() : props.onOpenChange(false));
    const control = { open: props.open, onClose };
    const retry = () => setEntry((prev) => ({ View: lazy(load), attempt: prev.attempt + 1 }));
    return (
      <ChunkBoundary key={entry.attempt} fallback={<LoadingDialog {...control} onRetry={retry} />}>
        <Suspense fallback={<LoadingDialog {...control} />}>
          <entry.View {...(props as P)} />
        </Suspense>
      </ChunkBoundary>
    );
  };
}

/** Inline optional tools must not replace or block their containing form. */
export function lazyPanel<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  return function LazyPanel(props: P) {
    const t = useTranslations('common');
    const [entry, setEntry] = useState(() => ({ View: lazy(load), attempt: 0 }));
    return (
      <ChunkBoundary
        key={entry.attempt}
        fallback={
          <ErrorState
            message={t('queryLoadFailed')}
            onRetry={() => setEntry((prev) => ({ View: lazy(load), attempt: prev.attempt + 1 }))}
          />
        }
      >
        <Suspense
          fallback={
            <div role="status" className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p>{t('loading')}</p>
            </div>
          }
        >
          <entry.View {...props} />
        </Suspense>
      </ChunkBoundary>
    );
  };
}
