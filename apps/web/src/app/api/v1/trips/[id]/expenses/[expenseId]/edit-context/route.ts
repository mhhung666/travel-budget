import { apiResponse } from '@/lib/mobile/http';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  return apiResponse(() => mobileOperation('expense.editContext', request, params));
}
