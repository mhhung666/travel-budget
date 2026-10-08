import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileSettlement } from '@/lib/mobile/settlement';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    return mobileSettlement(user.id, (await params).id);
  });
}
