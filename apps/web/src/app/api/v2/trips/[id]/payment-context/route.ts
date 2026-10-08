import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobilePaymentContext } from '@/lib/mobile/payments';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2PaymentContext), async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobilePaymentContext(user.id, id);
  });
}
