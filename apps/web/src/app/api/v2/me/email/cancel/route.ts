import { emailChangeCancelInput, emailChangeCancelledSchema } from '@travel-budget/contracts';
import { cancelAccountEmail } from '@/lib/accountEmail';
import { accountEnvironment } from '@/lib/accountAdapter';
import { emailHttpFailure } from '@/lib/mobile/accountEmail';
import { requireMobileUser } from '@/lib/mobile/session';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { readBody } from '@/lib/mobile/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.none(emailChangeCancelledSchema), async () => {
    const actor = await requireMobileUser(request);
    await readBody(request, emailChangeCancelInput);
    const { db } = await accountEnvironment(request.headers);
    try {
      return await cancelAccountEmail(db, actor.id);
    } catch (error) {
      return emailHttpFailure(error);
    }
  });
}
