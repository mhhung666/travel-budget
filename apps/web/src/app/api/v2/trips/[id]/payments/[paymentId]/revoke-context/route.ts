import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobilePaymentContext } from '@/lib/mobile/payments';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  return apiResponse(v2Output.trip(v2Schemas.V2PaymentRevokeContext), async () => {
    const user = await requireMobileUser(request);
    const { id, paymentId } = await params;
    return mobilePaymentContext(user.id, id, paymentId);
  });
}
