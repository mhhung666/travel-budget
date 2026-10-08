import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpenseRequest } from '@/lib/mobile/expenseWrite';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; clientRequestId: string }> }
) {
  return apiResponse(v2Output.service(v2Schemas.V2ExpenseRequest), async () => {
    const user = await requireMobileUser(request);
    const { id, clientRequestId } = await params;
    return mobileExpenseRequest(user.id, id, clientRequestId);
  });
}
