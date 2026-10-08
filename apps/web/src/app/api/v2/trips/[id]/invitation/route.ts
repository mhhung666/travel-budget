import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileInvitation } from '@/lib/mobile/tripEntry';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2Invitation), async () => {
    const user = await requireMobileUser(request);
    return mobileInvitation(user.id, (await context.params).id);
  });
}
