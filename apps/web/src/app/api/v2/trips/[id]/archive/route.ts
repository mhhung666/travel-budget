import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileManageTrip } from '@/lib/mobile/tripManagement';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2TripManagementResult), async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileManageTrip(request, user.id, id, 'trip.archive');
  });
}
