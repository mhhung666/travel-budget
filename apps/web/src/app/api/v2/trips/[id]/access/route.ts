import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileTripAccess, mobileManageTripAccess } from '@/lib/mobile/tripAccess';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileTripAccess(user.id, id);
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileManageTripAccess(request, user.id, id);
  });
}
