import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { clearTripChildren } from './tripDeletion';
import { receiptKeyPrefix, itineraryKeyPrefix, noteKeyPrefix, photoKeyPrefix } from './uploads';

const LEASE_MS = 5 * 60_000;
const SWEEP_DELAY_MS = 24 * 60 * 60_000;
const prefixes = [receiptKeyPrefix, itineraryKeyPrefix, noteKeyPrefix, photoKeyPrefix];

/** One lease, at most four storage pages. HTTP is always outside a transaction.
 * A failed/expired lease is reclaimed; the token prevents stale workers from checkpointing.
 */
export async function runTripCleanup(
  db: mongo.Db,
  deletePage: (prefix: string) => Promise<boolean>,
  options: { tripId?: string; now?: Date; deadline?: number } = {}
) {
  const now = options.now ?? new Date();
  const token = randomUUID();
  const jobs = db.collection('tripcleanupjobs');
  const job = await jobs.findOneAndUpdate(
    {
      ...(options.tripId ? { _id: new mongo.ObjectId(options.tripId) } : {}),
      availableAt: { $lte: now },
    },
    { $set: { token, availableAt: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { sort: { availableAt: 1 }, returnDocument: 'after' }
  );
  if (!job) return { status: 'idle' as const };
  const lease = { _id: job._id, token };
  try {
    // Never remove a live trip's blobs, including an operator-restored trip.
    if (await db.collection('trips').findOne({ _id: job._id }, { projection: { _id: 1 } }))
      throw new Error('Cleanup parent still exists');
    await clearTripChildren(db, job._id);
    for (let i = job.prefixIndex ?? 0; i < prefixes.length; i++) {
      if (options.deadline !== undefined && Date.now() >= options.deadline) {
        await jobs.updateOne(lease, { $set: { availableAt: new Date() }, $unset: { token: '' } });
        return { status: 'pending' as const };
      }
      // Verify ownership before each external page. Repeated deletes are idempotent.
      if (!(await jobs.findOne({ ...lease, availableAt: { $gt: options.now ?? new Date() } })))
        return { status: 'lost_lease' as const };
      const done = await deletePage(prefixes[i](job._id.toHexString()));
      const update = await jobs.updateOne(lease, { $set: { prefixIndex: done ? i + 1 : i } });
      if (update.matchedCount !== 1) return { status: 'lost_lease' as const };
      if (!done) {
        await jobs.updateOne(lease, { $set: { availableAt: now }, $unset: { token: '' } });
        return { status: 'pending' as const };
      }
    }
    if (!job.firstSweepAt) {
      await jobs.updateOne(lease, {
        $set: {
          firstSweepAt: now,
          prefixIndex: 0,
          availableAt: new Date(now.getTime() + SWEEP_DELAY_MS),
        },
        $unset: { token: '' },
      });
    } else {
      // Keep a small tombstone; no TTL can erase a failed job before recovery.
      await jobs.updateOne(lease, {
        $set: { completedAt: now },
        $unset: { token: '', availableAt: '' },
      });
    }
    return { status: 'swept' as const };
  } catch {
    await jobs.updateOne(lease, {
      $set: { availableAt: new Date(now.getTime() + LEASE_MS) },
      $unset: { token: '' },
    });
    return { status: 'retry' as const };
  }
}
