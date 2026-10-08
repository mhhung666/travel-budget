import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiLedgerResponse(v2Output.service(v2Schemas.V2Trips), () =>
    mobileOperation('trip.list', request)
  );
}
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.trip(v2Schemas.V2TripMutationResult), () =>
    mobileOperation('trip.create', request)
  );
}
