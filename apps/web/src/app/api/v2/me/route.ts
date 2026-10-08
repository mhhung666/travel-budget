import { userSchema } from '@travel-budget/contracts';
import { mobileAuth } from '@/lib/mobile/auth';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiLedgerResponse(v2Output.none(userSchema), () => mobileAuth(request, 'me'));
}
