import { apiLedgerResponse } from '@/lib/mobile/ledgerHttp';
import { ApiError } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { requireTripMember } from '@/lib/mobile/access';
import { currentLedger } from '@/lib/ledger';
import { getAllCurrencyCodes } from '@/constants/currencies';
import { readReferenceRates, rebaseReferenceRates } from '@/lib/referenceRates';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiLedgerResponse(request, async () => {
    const user = await requireMobileUser(request);
    await requireTripMember(user.id, (await params).id);
    try {
      return rebaseReferenceRates(
        await readReferenceRates(),
        currentLedger().baseCurrency,
        getAllCurrencyCodes()
      );
    } catch {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE');
    }
  });
}
