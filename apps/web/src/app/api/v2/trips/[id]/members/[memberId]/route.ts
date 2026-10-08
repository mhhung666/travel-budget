import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileManageMember } from '@/lib/mobile/members';
export const runtime = 'nodejs';
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  return apiResponse(v2Output.trip(v2Schemas.V2MemberMutationResult), async () => {
    const user = await requireMobileUser(request);
    const { id, memberId } = await params;
    return mobileManageMember(request, user.id, id, memberId);
  });
}
