import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2TripManagementResult), () =>
    mobileOperation('trip.update', request, params)
  );
}
