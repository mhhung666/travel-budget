import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import {
  runExpenseBackgroundDelivery,
  inspectExpenseBackgroundDelivery,
} from '@/lib/expenseDeliveryRuntime';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** One bounded batch, including draining old jobs while new outbox writes are disabled. */
export async function GET(request: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.get('inspect') === '1')
      return NextResponse.json({ success: true, ...(await inspectExpenseBackgroundDelivery()) });
    return NextResponse.json({ success: true, ...(await runExpenseBackgroundDelivery()) });
  } catch {
    logger.error('Expense delivery batch unavailable');
    return NextResponse.json({ error: 'WORKER_UNAVAILABLE' }, { status: 503 });
  }
}
