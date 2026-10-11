import { emailChangeRequestInput, emailChangeSentSchema } from '@travel-budget/contracts';
import { requestAccountEmail } from '@/lib/accountEmail';
import { accountEnvironment, deliverAccountEmail } from '@/lib/accountAdapter';
import { emailHttpFailure } from '@/lib/mobile/accountEmail';
import { requireMobileUser } from '@/lib/mobile/session';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { readBody } from '@/lib/mobile/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.none(emailChangeSentSchema), async () => {
    const actor = await requireMobileUser(request);
    const input = await readBody(request, emailChangeRequestInput);
    const { db, context } = await accountEnvironment(request.headers);
    try {
      return await requestAccountEmail(db, actor.id, input, context, deliverAccountEmail);
    } catch (error) {
      return emailHttpFailure(error);
    }
  });
}
