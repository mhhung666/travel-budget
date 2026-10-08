import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileWritePayment } from '@/lib/mobile/payments';
export const runtime = 'nodejs';
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  return apiResponse(v2Output.trip(v2Schemas.V2PaymentMutationResult), async () => {
    const user = await requireMobileUser(request);
    const { id, paymentId } = await params;
    return mobileWritePayment(request, user.id, id, paymentId);
  });
}
