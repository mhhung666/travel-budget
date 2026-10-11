import { avatarContextSchema } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { avatarOperation } from '@/lib/mobile/avatar';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiLedgerResponse(v2Output.none(avatarContextSchema), () =>
    avatarOperation(request, 'read')
  );
}
