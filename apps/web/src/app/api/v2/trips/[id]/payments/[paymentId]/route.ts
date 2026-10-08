import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileWritePayment } from '@/lib/mobile/payments';
export const runtime = 'nodejs';
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    const { id, paymentId } = await params;
    return mobileWritePayment(request, user.id, id, paymentId);
  });
}
