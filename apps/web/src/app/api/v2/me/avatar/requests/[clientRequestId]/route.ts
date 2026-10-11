import { avatarWriteStateSchema, avatarUploadTicketSchema } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { avatarOperation } from '@/lib/mobile/avatar';
export const runtime = 'nodejs';
type Context = { params: Promise<{ clientRequestId: string }> };
export async function GET(request: Request, context: Context) {
  return apiLedgerResponse(v2Output.none(avatarWriteStateSchema), async () =>
    avatarOperation(request, 'status', (await context.params).clientRequestId)
  );
}
export async function POST(request: Request, context: Context) {
  return apiLedgerResponse(v2Output.none(avatarUploadTicketSchema), async () =>
    avatarOperation(request, 'command', (await context.params).clientRequestId)
  );
}
