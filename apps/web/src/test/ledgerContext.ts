import { withLedgerV2 } from '@/lib/ledger';

/**
 * Every production entry runs a request in its own ledger context (`withLedgerAuth`, `/api/v2`,
 * public v2). Tests that call a service directly wrap it here, so each call gets a fresh context
 * exactly like one request, and concurrent calls never share the recorded trip unit.
 */
export const inLedgerContext =
  <A extends unknown[], R>(service: (...args: A) => R) =>
  (...args: A): R =>
    withLedgerV2(() => service(...args));
