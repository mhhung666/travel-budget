import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileEnterTrip } from '@/lib/mobile/tripEntry';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    return mobileEnterTrip(request, user.id, 'trip.join');
  });
}
