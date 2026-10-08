import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileEditContext } from '@/lib/mobile/expenseMaintenance';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    const { id, expenseId } = await params;
    return mobileEditContext(user.id, id, expenseId);
  });
}
