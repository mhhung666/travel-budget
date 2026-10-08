import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileTripMembers, mobileManageMember } from '@/lib/mobile/members';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileTripMembers(user.id, id);
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileManageMember(request, user.id, id);
  });
}
