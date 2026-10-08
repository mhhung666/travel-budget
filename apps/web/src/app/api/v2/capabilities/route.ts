import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { ledgerCapabilities } from '@/lib/ledger';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiLedgerResponse(v2Output.service(v2Schemas.V2Capabilities), async () => {
    await requireMobileUser(request);
    return ledgerCapabilities();
  });
}
