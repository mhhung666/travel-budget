import { after } from 'next/server';
import { apiLedgerResponse as apiResponse } from '@/lib/mobile/ledgerHttp';
import { requireMobileUser } from '@/lib/mobile/session';
import { mobileExpenses } from '@/lib/mobile/expenses';
import { mobileCreateExpense } from '@/lib/mobile/expenseWrite';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    return mobileExpenses(user.id, (await params).id, new URL(request.url));
  });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(request, async () => {
    const user = await requireMobileUser(request);
    // `after` runs the delivery trigger once the response has been sent, as the Web action does.
    return mobileCreateExpense(request, user.id, (await params).id, (task) => after(task));
  });
}
