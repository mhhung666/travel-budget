import { activityDeletionStateSchema } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiLedgerResponse(v2Output.none(activityDeletionStateSchema), () =>
    mobileOperation('itinerary.deletionWrite', request, params)
  );
}
