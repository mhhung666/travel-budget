import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2TripMutationResult), () =>
    mobileOperation('trip.join', request)
  );
}
