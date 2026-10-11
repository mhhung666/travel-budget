import { emailChangeConfirmInput, emailChangeResultSchema } from '@travel-budget/contracts';
import { confirmAccountEmail } from '@/lib/accountEmail';
import { accountEnvironment } from '@/lib/accountAdapter';
import { emailHttpFailure } from '@/lib/mobile/accountEmail';
import { requireMobileUser } from '@/lib/mobile/session';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { readBody } from '@/lib/mobile/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.none(emailChangeResultSchema), async () => {
    const actor = await requireMobileUser(request);
    const input = await readBody(request, emailChangeConfirmInput);
    const { db, context } = await accountEnvironment(request.headers);
    try {
      return await confirmAccountEmail(db, actor.id, input, context);
    } catch (error) {
      return emailHttpFailure(error);
    }
  });
}
