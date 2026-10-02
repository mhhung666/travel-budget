import { mongo } from 'mongoose';
import { buildItineraryDayDateMap, type PhotoItineraryDay } from '@/lib/photoItinerary';

/** Recompute auto links in the caller's transaction; preserve manual choices and own GPS. */
export async function rebindAutoPhotosInTransaction(
  db: mongo.Db,
  session: mongo.ClientSession,
  trip: mongo.ObjectId,
  parent: { startDate?: Date | null; endDate?: Date | null },
  now: Date
): Promise<void> {
  const remaining = await db
    .collection('itinerarydays')
    .find({ trip }, { session, projection: { dayNumber: 1, location: 1 } })
    .sort({ dayNumber: 1 })
    .toArray();
  const byDate = buildItineraryDayDateMap(
    parent.startDate,
    parent.endDate,
    remaining as unknown as PhotoItineraryDay[]
  );
  const photos = await db
    .collection('photos')
    .find(
      { trip, itineraryDaySource: 'auto' },
      { session, projection: { takenLocalDate: 1, location: 1 } }
    )
    .toArray();
  const photoUpdates = photos.map((photo) => {
    const target = photo.takenLocalDate ? byDate.get(photo.takenLocalDate) : undefined;
    const set: Record<string, unknown> = { itineraryDay: target?._id ?? null };
    if (!photo.location || photo.location.source === 'itinerary') {
      const { lat, lon } = target?.location ?? {};
      set.location =
        typeof lat === 'number' && typeof lon === 'number'
          ? { lat, lon, source: 'itinerary' }
          : null;
    }
    return {
      updateOne: {
        filter: { _id: photo._id, trip, itineraryDaySource: 'auto' },
        update: { $set: set, $max: { updatedAt: now } },
      },
    };
  });
  if (photoUpdates.length)
    await db.collection('photos').bulkWrite(photoUpdates, { session, ordered: true });
}
