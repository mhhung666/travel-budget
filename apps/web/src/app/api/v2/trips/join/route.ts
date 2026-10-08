import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileEnterTrip } from '@/lib/mobile/tripEntry';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiResponse(v2Output.trip(v2Schemas.V2TripMutationResult), async () => {
    const user = await requireMobileUser(request);
    return mobileEnterTrip(request, user.id, 'trip.join');
  });
}
