import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  return apiLedgerResponse(v2Output.service(v2Schemas.V2MutationRequest), () =>
    mobileOperation('mutation.request', request, params)
  );
}
