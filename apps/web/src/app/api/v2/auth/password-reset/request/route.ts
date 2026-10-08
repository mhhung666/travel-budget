import { passwordResetAcceptedSchema } from '@travel-budget/contracts';
import { mobileAuth } from '@/lib/mobile/auth';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.none(passwordResetAcceptedSchema), () =>
    mobileAuth(request, 'passwordResetRequest')
  );
}
