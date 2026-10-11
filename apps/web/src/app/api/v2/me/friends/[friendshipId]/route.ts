import { idSchema, friendCommandInput, friendMutationSchema } from '@travel-budget/contracts';
import { requireMobileUser } from '@/lib/mobile/session';
import { friendOperation } from '@/lib/mobile/friends';
import { ApiError, readBody } from '@/lib/mobile/http';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ friendshipId: string }> }
) {
  return apiLedgerResponse(v2Output.none(friendMutationSchema), async () => {
    const actor = await requireMobileUser(request);
    const { friendshipId } = await context.params;
    if (!idSchema.safeParse(friendshipId).success) throw new ApiError(404, 'NOT_FOUND');
    const body = await readBody(request, friendCommandInput);
    return friendOperation(actor.id, body.action, friendshipId);
  });
}
