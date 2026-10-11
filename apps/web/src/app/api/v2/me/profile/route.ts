import { accountProfileInput, accountProfileSchema } from '@travel-budget/contracts';
import {
  AccountProfileError,
  readAccountDetails,
  updateAccountProfile,
} from '@/lib/accountProfile';
import { requireMobileUser } from '@/lib/mobile/session';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { ApiError, readBody } from '@/lib/mobile/http';

export const runtime = 'nodejs';
async function profile(request: Request, write: boolean) {
  const actor = await requireMobileUser(request);
  try {
    const result = write
      ? await updateAccountProfile(actor.id, await readBody(request, accountProfileInput))
      : await readAccountDetails(actor.id);
    const { id, username, displayName, email } = result;
    return { id, username, displayName, email };
  } catch (error) {
    if (error instanceof AccountProfileError)
      throw new ApiError(error.code === 'NOT_FOUND' ? 404 : 400, error.code);
    throw error;
  }
}
export async function GET(request: Request) {
  return apiLedgerResponse(v2Output.none(accountProfileSchema), () => profile(request, false));
}
export async function PATCH(request: Request) {
  return apiLedgerResponse(v2Output.none(accountProfileSchema), () => profile(request, true));
}
