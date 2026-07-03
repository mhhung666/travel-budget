'use client';

import { createContext, useContext } from 'react';

/** 開新增支出時可帶入的預填欄位（目前僅描述，供清單「勾完購物→記一筆」帶品名）。 */
export interface AddExpensePrefill {
  description?: string;
}

/**
 * Cross-tab actions provided by the trip-space shell (trips/[id]/layout.tsx).
 *
 * The shell owns the add-expense dialog so the flow is reachable from every
 * tab (mobile FAB); the expenses tab consumes `openAddExpense` for its own
 * toolbar button instead of mounting a second dialog. 亦供清單分頁的購物項
 * 勾選後「記一筆」帶入品名（`prefill.description`）。
 */
export interface TripSpaceActions {
  openAddExpense: (prefill?: AddExpensePrefill) => void;
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
