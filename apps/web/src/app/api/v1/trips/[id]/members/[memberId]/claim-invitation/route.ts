import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileMemberClaimInvitation } from '@/lib/mobile/tripAccess';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    const { id, memberId } = await params;
    return mobileMemberClaimInvitation(user.id, id, memberId);
  });
}
