import { apiLedgerResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { ledgerCapabilities } from '@/lib/ledger';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiLedgerResponse(request, async () => {
    await requireMobileUser(request);
    return ledgerCapabilities();
  });
}
