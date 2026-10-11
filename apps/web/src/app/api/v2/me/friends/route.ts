import { friendsSchema, friendInviteInput, friendMutationSchema } from '@travel-budget/contracts';
import { requireMobileUser } from '@/lib/mobile/session';
import { readMobileFriends, friendOperation } from '@/lib/mobile/friends';
import { readBody } from '@/lib/mobile/http';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiLedgerResponse(v2Output.none(friendsSchema), async () => {
    const actor = await requireMobileUser(request);
    return readMobileFriends(actor.id);
  });
}
export async function POST(request: Request) {
  return apiLedgerResponse(v2Output.none(friendMutationSchema), async () => {
    const actor = await requireMobileUser(request);
    const body = await readBody(request, friendInviteInput);
    return friendOperation(actor.id, 'invite', body.target_user_id);
  });
}
