import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpenses } from '@/lib/mobile/expenses';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    return mobileExpenses(user.id, (await params).id, new URL(request.url));
  });
}
