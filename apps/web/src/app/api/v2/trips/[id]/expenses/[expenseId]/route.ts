import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2ExpenseDetail), () =>
    mobileOperation('expense.detail', request, params)
  );
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2ExpenseMutationResult), () =>
    mobileOperation('expense.update', request, params)
  );
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2ExpenseMutationResult), () =>
    mobileOperation('expense.delete', request, params)
  );
}
