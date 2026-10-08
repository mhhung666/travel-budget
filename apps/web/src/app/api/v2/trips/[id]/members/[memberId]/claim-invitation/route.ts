import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileMemberClaimInvitation } from '@/lib/mobile/tripAccess';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  return apiResponse(v2Output.trip(v2Schemas.V2MemberClaimInvitation), async () => {
    const user = await requireMobileUser(request);
    const { id, memberId } = await params;
    return mobileMemberClaimInvitation(user.id, id, memberId);
  });
}
