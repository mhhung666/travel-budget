import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; expenseId: string; clientRequestId: string }> }
) {
  return apiLedgerResponse(v2Output.service(v2Schemas.V2ReceiptWriteState), () =>
    mobileOperation('expense.receiptCommand', request, context.params)
  );
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; expenseId: string; clientRequestId: string }> }
) {
  return apiLedgerResponse(v2Output.service(v2Schemas.V2ReceiptUploadTicket), () =>
    mobileOperation('expense.receiptCommand', request, context.params)
  );
}
