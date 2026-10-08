import { after } from 'next/server';
import { v2Schemas } from '@travel-budget/contracts';
import { apiLedgerResponse as apiResponse, v2Output } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpenses } from '@/lib/mobile/expenses';
import { mobileCreateExpense } from '@/lib/mobile/expenseWrite';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2Expenses), async () => {
    const user = await requireMobileUser(request);
    return mobileExpenses(user.id, (await params).id, new URL(request.url));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(v2Output.trip(v2Schemas.V2ExpenseDetail), async () => {
    const user = await requireMobileUser(request);
    // `after` runs the delivery trigger once the response has been sent, as the Web action does.
    return mobileCreateExpense(request, user.id, (await params).id, (task) => after(task));
  });
}
