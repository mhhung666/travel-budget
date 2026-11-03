import { itineraryWriteStateSchema } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; uuid: string }> }
) {
  return apiLedgerResponse(v2Output.none(itineraryWriteStateSchema), () =>
    mobileOperation('itinerary.request', request, params)
  );
}
