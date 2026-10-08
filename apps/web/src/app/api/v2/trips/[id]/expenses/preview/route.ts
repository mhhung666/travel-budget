import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpensePreview } from '@/lib/mobile/expenseOptions';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2ExpensePreview), async () => {
    const user = await requireMobileUser(request);
    return mobileExpensePreview(request, user.id, (await params).id);
  });
}
