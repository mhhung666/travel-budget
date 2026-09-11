import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { deleteObjects } from './storage';
import { logger } from './logger';

const LEASE_MS = 5 * 60_000;
/** One bounded storage request, with durable retry and token-protected checkpoints. */
export async function runBlobCleanup(
  db: mongo.Db,
  remove: (keys: string[]) => Promise<void>,
  options: { keys?: string[]; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  const jobs = db.collection<{
    _id: string;
    token?: string;
    availableAt?: Date;
    firstSweepAt?: Date;
  }>('blobcleanupjobs');
  const due = {
    availableAt: { $lte: now },
    ...(options.keys ? { _id: { $in: options.keys } } : {}),
  };
  const candidates = await jobs
    .find(due, { projection: { _id: 1 } })
    .sort({ availableAt: 1 })
    .limit(50)
    .toArray();
  if (!candidates.length) return { status: 'idle' as const };
  const token = randomUUID();
  const ids = candidates.map((j) => j._id);
  await jobs.updateMany(
    { _id: { $in: ids }, availableAt: { $lte: now } },
    {
      $set: { token, availableAt: new Date(now.getTime() + LEASE_MS) },
      $inc: { attempts: 1 },
    }
  );
  const claimed = await jobs.find({ _id: { $in: ids }, token }).toArray();
  if (!claimed.length) return { status: 'idle' as const };
  const lease = { _id: { $in: claimed.map((j) => j._id) }, token };
  try {
    await remove(claimed.map((j) => j._id));
    await jobs.updateMany(
      { ...lease, firstSweepAt: { $exists: true } },
      {
        $set: { completedAt: now },
        $unset: { availableAt: '', token: '' },
      }
    );
    await jobs.updateMany(
      { ...lease, firstSweepAt: { $exists: false } },
      {
        $set: { firstSweepAt: now, availableAt: new Date(now.getTime() + 24 * 60 * 60_000) },
        $unset: { token: '' },
      }
    );
    return { status: 'cleaned' as const };
  } catch {
    await jobs.updateMany(lease, {
      $set: { availableAt: new Date(now.getTime() + LEASE_MS) },
      $unset: { token: '' },
    });
    return { status: 'retry' as const };
  }
}

/** A failure after the transaction must never turn a committed user action into an error. */
export async function cleanupRetiredBlobs(db: mongo.Db, keys: string[]) {
  if (!keys.length) return;
  try {
    await runBlobCleanup(db, (keys) => deleteObjects('receipts', keys, AbortSignal.timeout(5000)), {
      keys,
    });
  } catch (error) {
    logger.error('Blob cleanup deferred to cron', error);
  }
}
