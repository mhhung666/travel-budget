import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileTripSettings } from '@/lib/mobile/tripManagement';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2TripSettings), async () => {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileTripSettings(user.id, id);
  });
}
