import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpense } from '@/lib/mobile/expenses';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    const { id, expenseId } = await params;
    return mobileExpense(user.id, id, expenseId);
  });
}
