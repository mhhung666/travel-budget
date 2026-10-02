'use client';

import type { ReactNode } from 'react';
import { QueryFeedback } from './QueryFeedback';
import type { ReadState } from '@/lib/queryReadState';

/** A query's successful empty/null value differs from data that never loaded. */
export function QueryStatus({ query, children }: { query: ReadState; children?: ReactNode }) {
  const hasData = query.data !== undefined;
  return (
    <>
      <QueryFeedback
        hasData={hasData}
        isError={!!query.isError}
        isFetching={!!query.isFetching || (!hasData && !query.isError && !query.isPaused)}
        isPaused={query.isPaused}
        onRetry={() => void query.refetch()}
      />
      {hasData && children}
    </>
  );
}
