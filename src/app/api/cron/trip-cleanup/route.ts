import { timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { dbConnect } from '@/lib/mongodb';
import { runTripCleanup } from '@/lib/tripCleanup';
import { runBlobCleanup } from '@/lib/blobCleanup';
import { deleteObjects, deletePrefixPage } from '@/lib/storage';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  try {
    await dbConnect();
    const deadline = Date.now() + 40_000;
    const tripDeadline = Date.now() + 20_000;
    const results: Record<string, number> = {};
    for (let i = 0; i < 10 && Date.now() < tripDeadline; i++) {
      const result = await runTripCleanup(
        mongoose.connection.db!,
        (prefix) => deletePrefixPage('receipts', prefix),
        { deadline: tripDeadline }
      );
      results[result.status] = (results[result.status] ?? 0) + 1;
      if (result.status === 'idle') break;
    }
    for (let i = 0; i < 10 && Date.now() < deadline; i++) {
      const result = await runBlobCleanup(mongoose.connection.db!, (keys) =>
        deleteObjects('receipts', keys, AbortSignal.timeout(5000))
      );
      results[`blobs_${result.status}`] = (results[`blobs_${result.status}`] ?? 0) + 1;
      if (result.status === 'idle') break;
    }
    return NextResponse.json({ success: true, results });
  } catch {
    logger.error('Trip cleanup batch unavailable');
    return NextResponse.json({ error: 'WORKER_UNAVAILABLE' }, { status: 503 });
  }
}
