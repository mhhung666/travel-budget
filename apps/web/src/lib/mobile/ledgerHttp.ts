import { v2Schemas } from '@travel-budget/contracts';
import { withLedgerV2, ledgerOutput } from '@/lib/ledger';
import { apiResponse, ApiError } from './http';

function outputSchema(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/v2/, '');
  const get = request.method === 'GET';
  if (path === '/capabilities') return v2Schemas.V2Capabilities;
  if (path.startsWith('/mutation-requests/')) return v2Schemas.V2MutationRequest;
  if (path.includes('/expense-requests/')) return v2Schemas.V2ExpenseRequest;
  if (path === '/trips') return get ? v2Schemas.V2Trips : v2Schemas.V2TripMutationResult;
  if (path === '/trips/join') return v2Schemas.V2TripMutationResult;
  if (path.endsWith('/exchange-rates')) return v2Schemas.V2ReferenceRates;
  if (path.endsWith('/landing')) return v2Schemas.V2Landing;
  if (path.endsWith('/expense-options')) return v2Schemas.V2ExpenseOptions;
  if (path.endsWith('/preview')) return v2Schemas.V2ExpensePreview;
  if (path.endsWith('/edit-context')) return v2Schemas.V2ExpenseEditContext;
  if (path.endsWith('/settlement')) return v2Schemas.V2Settlement;
  if (path.endsWith('/payment-context')) return v2Schemas.V2PaymentContext;
  if (path.endsWith('/revoke-context')) return v2Schemas.V2PaymentRevokeContext;
  if (path.includes('/payments')) return v2Schemas.V2PaymentMutationResult;
  if (path.endsWith('/currency-settings'))
    return get ? v2Schemas.V2TripCurrencyContext : v2Schemas.V2TripManagementResult;
  if (path.endsWith('/settings')) return v2Schemas.V2TripSettings;
  if (path.endsWith('/invitation')) return v2Schemas.V2Invitation;
  if (path.endsWith('/claim-invitation')) return v2Schemas.V2MemberClaimInvitation;
  if (path.includes('/members'))
    return get ? v2Schemas.V2TripMembers : v2Schemas.V2MemberMutationResult;
  if (path.endsWith('/access'))
    return get ? v2Schemas.V2TripAccessContext : v2Schemas.V2TripAccessResult;
  if (/\/expenses\/[^/]+$/.test(path))
    return get ? v2Schemas.V2ExpenseDetail : v2Schemas.V2ExpenseMutationResult;
  if (path.endsWith('/expenses')) return get ? v2Schemas.V2Expenses : v2Schemas.V2ExpenseDetail;
  return v2Schemas.V2TripManagementResult;
}
/** Separate adapters, shared authorized services. Schema validation never guesses a missing unit. */
export function apiLedgerResponse(request: Request, work: () => Promise<unknown>) {
  return apiResponse(() =>
    withLedgerV2(async () => {
      const value = await work();
      const path = new URL(request.url).pathname;
      const preserved =
        path.endsWith('/capabilities') ||
        path.includes('/mutation-requests/') ||
        path.includes('/expense-requests/') ||
        (path.endsWith('/trips') && request.method === 'GET');
      if (!value || typeof value !== 'object') throw new ApiError(503, 'LEDGER_DATA_INVALID');
      const withUnit = preserved ? value : 'ledger' in value ? value : ledgerOutput(value);
      const result = outputSchema(request).safeParse(withUnit);
      if (!result.success) throw new ApiError(503, 'LEDGER_DATA_INVALID');
      return result.data;
    })
  );
}
