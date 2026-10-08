import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileManageTrip } from '@/lib/mobile/tripManagement';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileManageTrip(request, user.id, id, 'trip.archive');
  });
}
