import { passwordChangeInput, passwordChangeResultSchema } from '@travel-budget/contracts';
import { changeAccountPassword, AccountPasswordError } from '@/lib/accountPassword';
import { AccountEntryError } from '@/lib/accountEntry';
import { accountEnvironment } from '@/lib/accountAdapter';
import { requireMobileUser } from '@/lib/mobile/session';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { ApiError, readBody } from '@/lib/mobile/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.none(passwordChangeResultSchema), async () => {
    const actor = await requireMobileUser(request);
    const input = await readBody(request, passwordChangeInput);
    const { db, context } = await accountEnvironment(request.headers);
    try {
      return await changeAccountPassword(db, actor.id, input, context);
    } catch (error) {
      if (error instanceof AccountEntryError) throw new ApiError(429, error.code, error.retryAfter);
      if (error instanceof AccountPasswordError)
        throw new ApiError(
          error.code === 'NOT_FOUND' ? 404 : error.code === 'RESOURCE_CHANGED' ? 409 : 400,
          error.code
        );
      throw error;
    }
  });
}
