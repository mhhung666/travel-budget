import { mongo } from 'mongoose';

export class RetiredBlobError extends Error {
  readonly code = 'CONFLICT' as const;
}

/** Called under the same Trip fence as every writer and retirement. Tombstones never expire. */
export async function assertBlobsAvailable(
  db: mongo.Db,
  session: mongo.ClientSession,
  keys: string[]
) {
  if (!keys.length) return;
  if (
    await db
      .collection<{ _id: string }>('blobcleanupjobs')
      .findOne({ _id: { $in: keys } }, { session, projection: { _id: 1 } })
  ) {
    throw new RetiredBlobError('Attachment retired; upload a new object');
  }
}

/** Run AFTER removing DB references, before committing their Trip-fenced transaction.
 * At most four reference queries and one bulk write, even for a large photo batch.
 */
export async function retireUnreferencedBlobs(
  db: mongo.Db,
  session: mongo.ClientSession,
  tripId: string,
  keys: string[]
) {
  const unique = [...new Set(keys)];
  if (!unique.length) return [];
  const trip = new mongo.ObjectId(tripId);
  const recognized = new Set<string>();
  const referenced = new Set<string>();
  for (const [prefix, collection, path] of [
    ['itinerary', 'itinerarydays', 'activities.attachments.key'],
    ['receipts', 'expenses', 'attachments.key'],
    ['notes', 'notes', 'attachments.key'],
  ] as const) {
    const candidates = unique.filter((key) => key.startsWith(`${prefix}/${tripId}/`));
    if (!candidates.length) continue;
    candidates.forEach((key) => recognized.add(key));
    const docs = await db
      .collection(collection)
      .find({ trip, [path]: { $in: candidates } }, { session, projection: { [path]: 1 } })
      .toArray();
    for (const doc of docs) {
      const attachments: { key: string }[] =
        prefix === 'itinerary'
          ? (doc.activities ?? []).flatMap(
              (a: { attachments?: { key: string }[] }) => a.attachments ?? []
            )
          : (doc.attachments ?? []);
      attachments.forEach((a) => referenced.add(a.key));
    }
  }
  const photos = unique.filter((key) => key.startsWith(`photos/${tripId}/`));
  if (photos.length) {
    photos.forEach((key) => recognized.add(key));
    const displayKey = (key: string) => key.replace(/_t\.webp$|_p\.jpg$/, '.jpg');
    const docs = await db
      .collection('photos')
      .find({ trip, key: { $in: photos.map(displayKey) } }, { session, projection: { key: 1 } })
      .toArray();
    const live = new Set(docs.map((doc) => doc.key));
    photos.filter((key) => live.has(displayKey(key))).forEach((key) => referenced.add(key));
  }
  // Unknown and foreign keys never become external deletion jobs.
  const retired = unique.filter((key) => recognized.has(key) && !referenced.has(key));
  if (retired.length) {
    const now = new Date();
    await db.collection<{ _id: string }>('blobcleanupjobs').bulkWrite(
      retired.map((key) => ({
        updateOne: {
          filter: { _id: key },
          update: { $setOnInsert: { trip, retiredAt: now, availableAt: now, attempts: 0 } },
          upsert: true,
        },
      })),
      { session }
    );
  }
  return retired;
}
