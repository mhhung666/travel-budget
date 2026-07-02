'use client';

import { createContext, useContext } from 'react';

/**
 * Cross-tab actions provided by the trip-space shell (trips/[id]/layout.tsx).
 *
 * The shell owns the add-expense dialog so the flow is reachable from every
 * tab (mobile FAB); the expenses tab consumes `openAddExpense` for its own
 * toolbar button instead of mounting a second dialog.
 */
export interface TripSpaceActions {
  openAddExpense: () => void;
}

const TripSpaceContext = createContext<TripSpaceActions | null>(null);

export const TripSpaceProvider = TripSpaceContext.Provider;

export function useTripSpaceActions(): TripSpaceActions {
  const ctx = useContext(TripSpaceContext);
  if (!ctx) {
    throw new Error('useTripSpaceActions 必須在 trips/[id] layout（TripSpaceShell）內使用');
  }
  return ctx;
}
