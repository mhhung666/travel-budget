import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpensePreview } from '@/lib/mobile/expenseOptions';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    return mobileExpensePreview(request, user.id, (await params).id);
  });
}
