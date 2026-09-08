'use client';

import { Component, Suspense, lazy, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveFormSheet } from './ResponsiveFormSheet';
import { ErrorState } from './ErrorState';

type DialogControl = { open: boolean; onClose: () => void };

function LoadingDialog({ open, onClose, onRetry }: DialogControl & { onRetry?: () => void }) {
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
        <p role="status" className="py-6 text-sm text-muted-foreground">
          {t('loading')}
        </p>
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
 * dialog retains its existing close/reset/draft semantics. Pending imports never reopen
 * a dismissed dialog. A failed import gets a fresh lazy promise on explicit retry. */
export function lazyDialog<P extends DialogControl>(
  load: () => Promise<{ default: ComponentType<P> }>
) {
  return function LazyDialog(props: P) {
    const [activated, setActivated] = useState(false);
    const [entry, setEntry] = useState(() => ({ View: lazy(load), attempt: 0 }));
    if (props.open && !activated) setActivated(true);
    if (!activated && !props.open) return null;
    const retry = () => setEntry((prev) => ({ View: lazy(load), attempt: prev.attempt + 1 }));
    return (
      <ChunkBoundary key={entry.attempt} fallback={<LoadingDialog {...props} onRetry={retry} />}>
        <Suspense fallback={<LoadingDialog {...props} />}>
          <entry.View {...props} />
        </Suspense>
      </ChunkBoundary>
    );
  };
}
