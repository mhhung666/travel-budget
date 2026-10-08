'use client';
import { createContext, useContext } from 'react';
const LedgerCurrencyContext = createContext<string | null>(null);
export const TripLedgerProvider = LedgerCurrencyContext.Provider;
export function useLedgerCurrency() {
  return useContext(LedgerCurrencyContext) ?? 'TWD';
}
