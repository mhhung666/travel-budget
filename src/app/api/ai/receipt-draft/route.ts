import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getTripMembership } from '@/lib/permissions';
import { getObjectBuffer, headObject } from '@/lib/storage';
import { isReceiptKeyForTrip, validateUpload } from '@/lib/uploads';
import { receiptDraftRequestSchema } from '@/lib/ai/receiptDraftSchema';
import { normalizeReceiptDraft } from '@/lib/ai/normalizeReceiptDraft';
import { parseReceiptDraft } from '@/lib/ai/receiptDraftProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const parsed = receiptDraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400 });
  const membership = await getTripMembership(session.userId, parsed.data.tripId);
  if (!membership) return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  if (!isReceiptKeyForTrip(membership.tripId, parsed.data.key))
    return NextResponse.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400 });
  const head = await headObject('receipts', parsed.data.key);
  if (
    !head ||
    !imageTypes.has(head.contentType) ||
    !validateUpload('receipt', head.contentType, head.size).ok
  )
    return NextResponse.json({ error: { code: 'INVALID_IMAGE' } }, { status: 400 });
  const bytes = await getObjectBuffer('receipts', parsed.data.key);
  if (!bytes) return NextResponse.json({ error: { code: 'INVALID_IMAGE' } }, { status: 400 });
  try {
    return NextResponse.json({
      success: true,
      draft: normalizeReceiptDraft(
        await parseReceiptDraft(
          bytes,
          head.contentType as 'image/jpeg' | 'image/png' | 'image/webp'
        )
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
