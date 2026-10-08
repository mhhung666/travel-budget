import { mobileMaintainExpense } from '@/lib/mobile/expenseMaintenance';
import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpense } from '@/lib/mobile/expenses';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiResponse(v2Output.trip(v2Schemas.V2ExpenseDetail), async () => {
    const user = await requireMobileUser(request);
    const { id, expenseId } = await params;
    return mobileExpense(user.id, id, expenseId);
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiResponse(v2Output.trip(v2Schemas.V2ExpenseMutationResult), async () => {
    const user = await requireMobileUser(request);
    const { id, expenseId } = await params;
    return mobileMaintainExpense(request, user.id, id, expenseId, 'expense.update');
  });
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiResponse(v2Output.trip(v2Schemas.V2ExpenseMutationResult), async () => {
    const user = await requireMobileUser(request);
    const { id, expenseId } = await params;
    return mobileMaintainExpense(request, user.id, id, expenseId, 'expense.delete');
  });
}
