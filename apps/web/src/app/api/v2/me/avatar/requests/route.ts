import { avatarWriteStateSchema } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { avatarOperation } from '@/lib/mobile/avatar';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.none(avatarWriteStateSchema), () =>
    avatarOperation(request, 'begin')
  );
}
