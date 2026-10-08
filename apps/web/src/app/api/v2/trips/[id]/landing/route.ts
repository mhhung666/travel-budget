import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileLanding, viewerDate } from '@/lib/mobile/trips';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2Landing), async () => {
    const user = await requireMobileUser(request);
    return mobileLanding(user.id, (await params).id, viewerDate(new URL(request.url)));
  });
}
