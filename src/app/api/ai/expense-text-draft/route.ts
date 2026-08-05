import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import { User } from '@/models';
import { expenseTextDraftRequestSchema } from '@/lib/ai/expenseTextDraftSchema';
import { normalizeExpenseTextDraft } from '@/lib/ai/normalizeExpenseTextDraft';
import { parseExpenseTextDraft } from '@/lib/ai/expenseTextDraftProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const input = expenseTextDraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400 });
  const membership = await getTripMembership(session.userId, input.data.tripId);
  if (!membership) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  const trip = await (await import('@/models')).Trip.findById(membership.tripId)
    .select('members')
    .lean();
  if (!trip) return NextResponse.json({ error: { code: 'TRIP_NOT_FOUND' } }, { status: 404 });
  const users = await User.find({ _id: { $in: trip.members.map((member) => member.user) } })
    .select('_id displayName username')
    .lean();
  const members = users.map((user) => ({
    id: user._id.toString(),
    displayName: user.displayName,
    username: user.username,
  }));
  try {
    return NextResponse.json({
      success: true,
      draft: normalizeExpenseTextDraft(
        await parseExpenseTextDraft(input.data.sourceText),
        members,
        session.userId
      ),
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message === 'FEATURE_DISABLED'
        ? 'FEATURE_DISABLED'
        : 'PROVIDER_ERROR';
    return NextResponse.json(
      { success: false, error: { code } },
      { status: code === 'FEATURE_DISABLED' ? 503 : 502 }
    );
  }
}
