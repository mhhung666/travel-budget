import type { z } from 'zod';
import { withLedgerV2, ledgerOutput } from '@/lib/ledger';
import { apiResponse, ApiError } from './http';

/**
 * How a v2 route attaches the ledger unit; each route names its schema and mode explicitly.
 * - `none`: identity/auth output without a trip ledger.
 * - `trip`: single-trip output; the current trip ledger is injected unless already present.
 * - `service`: per-row or receipt ledgers produced by the service are preserved as-is.
 */
export type V2Output = { schema: z.ZodType; unit: 'none' | 'trip' | 'service' };
export const v2Output = {
  none: (schema: z.ZodType): V2Output => ({ schema, unit: 'none' }),
  trip: (schema: z.ZodType): V2Output => ({ schema, unit: 'trip' }),
  service: (schema: z.ZodType): V2Output => ({ schema, unit: 'service' }),
};

/** Separate adapters, shared authorized services. Schema validation never guesses a missing unit. */
export function apiLedgerResponse(output: V2Output, work: () => Promise<unknown>) {
  return apiResponse(() =>
    withLedgerV2(async () => {
      const value = await work();
      if (output.unit === 'none') {
        const result = output.schema.safeParse(value);
        // Identity responses carry no ledger; a mismatch is a server bug, not ledger data.
        if (!result.success) throw new Error('Invalid v2 identity response');
        return result.data;
      }
      if (!value || typeof value !== 'object') throw new ApiError(503, 'LEDGER_DATA_INVALID');
      const withUnit = output.unit === 'service' || 'ledger' in value ? value : ledgerOutput(value);
      const result = output.schema.safeParse(withUnit);
      if (!result.success) throw new ApiError(503, 'LEDGER_DATA_INVALID');
      return result.data;
    })
  );
}
