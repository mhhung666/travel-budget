import { apiResponse } from '@/lib/mobile/http';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; clientRequestId: string }> }
) {
  return apiResponse(() => mobileOperation('expense.request', request, params));
}
