import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileManageMember } from '@/lib/mobile/members';
export const runtime = 'nodejs';
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    const { id, memberId } = await params;
    return mobileManageMember(request, user.id, id, memberId);
  });
}
