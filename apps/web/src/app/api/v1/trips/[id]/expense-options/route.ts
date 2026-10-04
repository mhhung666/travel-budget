import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpenseOptions } from '@/lib/mobile/expenseOptions';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    return mobileExpenseOptions(user.id, (await params).id);
  });
}
