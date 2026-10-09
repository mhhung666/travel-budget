import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2BudgetContext), () =>
    mobileOperation('budget.context', request, params)
  );
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2BudgetMutationResult), () =>
    mobileOperation('budget.set', request, params)
  );
}
