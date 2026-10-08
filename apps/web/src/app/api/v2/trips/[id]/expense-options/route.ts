import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpenseOptions } from '@/lib/mobile/expenseOptions';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2ExpenseOptions), async () => {
    const user = await requireMobileUser(request);
    return mobileExpenseOptions(user.id, (await params).id);
  });
}
