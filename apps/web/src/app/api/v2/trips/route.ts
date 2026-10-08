import { mobileEnterTrip } from '@/lib/mobile/tripEntry';
import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileTrips } from '@/lib/mobile/trips';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    return mobileTrips(user.id, new URL(request.url));
  });
}

export async function POST(request: Request) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    return mobileEnterTrip(request, user.id, 'trip.create');
  });
}
