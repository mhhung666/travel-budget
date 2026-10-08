import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileTripCurrency, mobileManageTrip } from '@/lib/mobile/tripManagement';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    return mobileTripCurrency(user.id, (await params).id);
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    return mobileManageTrip(request, user.id, (await params).id, 'trip.currency');
  });
}
