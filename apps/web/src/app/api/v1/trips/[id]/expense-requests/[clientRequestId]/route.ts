import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpenseRequest } from '@/lib/mobile/expenseWrite';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; clientRequestId: string }> }
) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    const { id, clientRequestId } = await params;
    return mobileExpenseRequest(user.id, id, clientRequestId);
  });
}
