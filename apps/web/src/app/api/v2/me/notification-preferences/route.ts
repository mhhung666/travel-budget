import {
  notificationPreferencesInput,
  notificationPreferencesSchema,
} from '@travel-budget/contracts';
import {
  AccountNotificationsError,
  readAccountNotifications,
  updateAccountNotifications,
} from '@/lib/accountNotifications';
import { requireMobileUser } from '@/lib/mobile/session';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { ApiError, readBody } from '@/lib/mobile/http';
export const runtime = 'nodejs';
async function preferences(request: Request, write: boolean) {
  const actor = await requireMobileUser(request);
  try {
    return write
      ? await updateAccountNotifications(
          actor.id,
          await readBody(request, notificationPreferencesInput)
        )
      : await readAccountNotifications(actor.id);
  } catch (error) {
    if (error instanceof AccountNotificationsError)
      throw new ApiError(error.code === 'NOT_FOUND' ? 404 : 400, error.code);
    throw error;
  }
}
export async function GET(request: Request) {
  return apiLedgerResponse(v2Output.none(notificationPreferencesSchema), () =>
    preferences(request, false)
  );
}
export async function PATCH(request: Request) {
  return apiLedgerResponse(v2Output.none(notificationPreferencesSchema), () =>
    preferences(request, true)
  );
}
