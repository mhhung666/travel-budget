import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileMutationRequest } from '@/lib/mobile/tripEntry';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ uuid: string }> }) {
  return apiResponse(v2Output.service(v2Schemas.V2MutationRequest), async () => {
    const user = await requireMobileUser(request);
    return mobileMutationRequest(user.id, (await context.params).uuid);
  });
}
