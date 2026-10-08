import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobilePaymentContext } from '@/lib/mobile/payments';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    const { id, paymentId } = await params;
    return mobilePaymentContext(user.id, id, paymentId);
  });
}
