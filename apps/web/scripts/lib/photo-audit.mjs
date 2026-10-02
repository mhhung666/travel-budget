import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mongo } from 'mongoose';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const HASH_VERSION = 'sha256-stored-jpeg-v1';
const MAX_TIME_MS = 10000;
const MAX_HASH_BYTES = 6 * 1024 * 1024;
const projection = {
  trip: 1,
  key: 1,
  thumbKey: 1,
  updatedAt: 1,
  storedHash: 1,
  storedHashVersion: 1,
  storedHashSize: 1,
  storedHashETag: 1,
  storedHashLastModified: 1,
  storedHashVerifiedAt: 1,
};
const findOptions = { maxTimeMS: MAX_TIME_MS };
const id = (value) => String(value);
const iso = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const publicKey = (key) => (typeof key === 'string' ? key.replace(/\.jpg$/, '_p.jpg') : null);
const displayKey = (key) => key.replace(/_t\.webp$|_p\.jpg$/, '.jpg');
export function parsePhotoKey(key) {
  const match = /^photos\/([a-f\d]{24})\/([a-f\d-]{36})(\.jpg|_t\.webp|_p\.jpg)$/i.exec(key);
  if (!match || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(match[2])) return null;
  return {
    tripId: match[1].toLowerCase(),
    role: match[3] === '.jpg' ? 'display' : match[3] === '_t.webp' ? 'thumbnail' : 'public',
  };
}

/** Classifications are observations, never authorization to delete. References always win. */
export function classifyObject(object, context, cutoff) {
  const refs = context.photos.filter(
    (p) => p.key === object.Key || p.thumbKey === object.Key || publicKey(p.key) === object.Key
  );
  const cleanup = context.blobs.find((j) => j._id === object.Key);
  const jobs = context.uploads.filter(
    (j) => j.key === object.Key || j.thumbKey === object.Key || publicKey(j.key) === object.Key
  );
  const parsed = parsePhotoKey(object.Key);
  const trip = parsed && context.trips.find((t) => id(t._id) === parsed.tripId);
  const tripCleanup = parsed && context.tripJobs.find((t) => id(t._id) === parsed.tripId);
  let category;
  if (refs.length) category = cleanup || tripCleanup ? 'referenced_cleanup_conflict' : 'referenced';
  else if (!parsed) category = 'unknown_key';
  else if (cleanup)
    category = cleanup.completedAt ? 'retired_object_present' : 'pending_blob_cleanup';
  else if (tripCleanup)
    category = trip
      ? 'trip_cleanup_conflict'
      : tripCleanup.completedAt
        ? 'deleted_trip_object_present'
        : 'pending_trip_cleanup';
  else if (jobs.length)
    category = jobs.some((j) => j.status === 'pending' && new Date(j.expiresAt) > context.now)
      ? 'active_upload'
      : 'tracked_upload';
  else if (!object.LastModified || !Number.isFinite(new Date(object.LastModified).getTime()))
    category = 'unknown_age';
  else if (new Date(object.LastModified) > cutoff) category = 'recent_unreferenced';
  else category = trip ? 'suspected_orphan' : 'missing_trip_candidate';
  return {
    key: object.Key,
    size: object.Size ?? null,
    lastModified: iso(object.LastModified),
    etag: object.ETag ?? null,
    tripId: parsed?.tripId ?? null,
    role: parsed?.role ?? null,
    category,
    photoIds: refs.map((p) => id(p._id)),
    uploadIds: jobs.map((j) => id(j._id)),
    cleanupAttempts: cleanup?.attempts ?? null,
  };
}

export function objectIdentity(metadata) {
  return {
    etag: metadata.ETag,
    size: metadata.ContentLength,
    lastModified: iso(metadata.LastModified),
  };
}
export function sameIdentity(a, b) {
  return Boolean(
    a.etag &&
    b.etag &&
    a.lastModified &&
    b.lastModified &&
    a.etag === b.etag &&
    a.size === b.size &&
    a.lastModified === b.lastModified
  );
}
export function cachedHash(photo, identity) {
  return (
    photo.storedHashVersion === HASH_VERSION &&
    /^[a-f\d]{64}$/.test(photo.storedHash ?? '') &&
    sameIdentity(identity, {
      etag: photo.storedHashETag,
      size: photo.storedHashSize,
      lastModified: iso(photo.storedHashLastModified),
    })
  );
}
export async function digestBody(body, expectedSize) {
  if (
    !body ||
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > MAX_HASH_BYTES
  ) {
    body?.destroy?.();
    throw new Error('invalid_object');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of body) {
    bytes += chunk.length;
    if (bytes > MAX_HASH_BYTES || bytes > expectedSize) {
      body.destroy?.();
      throw new Error('invalid_object');
    }
    hash.update(chunk);
  }
  if (bytes !== expectedSize) throw new Error('incomplete_object');
  return hash.digest('hex');
}

/** CAS does not upsert deleted photos, touch sourceHash, or change user-visible timestamps. */
export async function saveStoredHash(db, photo, identity, hash, now) {
  const observed = (value) => (value === undefined ? { $exists: false } : value);
  return db.collection('photos').updateOne(
    {
      _id: photo._id,
      trip: photo.trip,
      key: photo.key,
      updatedAt: observed(photo.updatedAt),
      storedHashVerifiedAt: observed(photo.storedHashVerifiedAt),
    },
    {
      $set: {
        storedHash: hash,
        storedHashVersion: HASH_VERSION,
        storedHashSize: identity.size,
        storedHashETag: identity.etag,
        storedHashLastModified: new Date(identity.lastModified),
        storedHashVerifiedAt: now,
      },
    },
    { maxTimeMS: MAX_TIME_MS }
  );
}

export function createAuditStorage(client, bucket, { delayMs = 100, signal } = {}) {
  let nextRequest = 0;
  async function send(command) {
    signal?.throwIfAborted();
    const wait = Math.max(0, nextRequest - Date.now());
    if (wait) await delay(wait, undefined, { signal });
    nextRequest = Date.now() + delayMs;
    return client.send(command, {
      abortSignal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
  }
  return {
    async *pages(prefix, pageSize) {
      let token;
      do {
        const result = await send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            MaxKeys: pageSize,
            ContinuationToken: token,
          })
        );
        yield result.Contents ?? [];
        if (
          result.IsTruncated &&
          (!result.NextContinuationToken || result.NextContinuationToken === token)
        )
          throw new Error('invalid_pagination');
        token = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (token);
    },
    async head(key) {
      try {
        return await send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },
    async hash(key, metadata) {
      const result = await send(
        new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: metadata.ETag })
      );
      if (!sameIdentity(objectIdentity(metadata), objectIdentity(result))) {
        result.Body?.destroy?.();
        throw new Error('object_changed');
      }
      // SDK request cancellation need not cover a stalled response body after headers.
      const transfer = AbortSignal.timeout(30000);
      const bodySignal = signal ? AbortSignal.any([signal, transfer]) : transfer;
      const stop = () => result.Body?.destroy?.(new Error('read_aborted'));
      bodySignal.addEventListener('abort', stop, { once: true });
      try {
        bodySignal.throwIfAborted();
        return await digestBody(result.Body, result.ContentLength);
      } finally {
        bodySignal.removeEventListener('abort', stop);
        result.Body?.destroy?.();
      }
    },
  };
}

async function pageContext(db, objects, now) {
  const keys = objects.map((o) => o.Key);
  const tripIds = [...new Set(keys.map((key) => parsePhotoKey(key)?.tripId).filter(Boolean))].map(
    (value) => new mongo.ObjectId(value)
  );
  const candidates = [...new Set([...keys, ...keys.map(displayKey)])];
  const [photos, blobs, uploads, trips, tripJobs] = await Promise.all([
    // Include explicit references even for malformed/foreign keys; no false orphan from key parsing.
    db
      .collection('photos')
      .find(
        { $or: [{ key: { $in: candidates } }, { thumbKey: { $in: keys } }] },
        { ...findOptions, projection: { key: 1, thumbKey: 1 } }
      )
      .toArray(),
    db
      .collection('blobcleanupjobs')
      .find({ _id: { $in: keys } }, findOptions)
      .toArray(),
    db
      .collection('photouploadjobs')
      .find(
        {
          trip: { $in: tripIds },
          $or: [{ key: { $in: candidates } }, { thumbKey: { $in: keys } }],
        },
        { ...findOptions, projection: { key: 1, thumbKey: 1, status: 1, expiresAt: 1 } }
      )
      .toArray(),
    db
      .collection('trips')
      .find({ _id: { $in: tripIds } }, { ...findOptions, projection: { _id: 1 } })
      .toArray(),
    db
      .collection('tripcleanupjobs')
      .find({ _id: { $in: tripIds } }, { ...findOptions, projection: { _id: 1, completedAt: 1 } })
      .toArray(),
  ]);
  return { photos, blobs, uploads, trips, tripJobs, now };
}

/** Only report writes occur through emit. DB mutation is confined to opt-in hash metadata. */
export async function runPhotoAudit({
  db,
  storage,
  emit,
  tripId,
  apply = false,
  inventoryOnly = false,
  graceHours = 48,
  pageSize = 200,
  now = new Date(),
  signal,
}) {
  const summary = {
    format: 1,
    startedAt: now.toISOString(),
    complete: false,
    scope: tripId ?? 'all',
    apply,
    inventoryOnly,
    graceHours,
    objects: 0,
    bytes: 0,
    categories: {},
    photos: 0,
    hashes: 0,
    cached: 0,
    backfilled: 0,
    hashErrors: 0,
    skipped: 0,
    duplicateGroups: 0,
    duplicatePhotos: 0,
    anomalies: 0,
  };
  await emit('summary', summary);
  const cutoff = new Date(now.getTime() - graceHours * 3600000);
  for await (const objects of storage.pages(tripId ? `photos/${tripId}/` : 'photos/', pageSize)) {
    signal?.throwIfAborted();
    const context = await pageContext(db, objects, now);
    for (const object of objects) {
      const row = classifyObject(object, context, cutoff);
      summary.objects++;
      summary.bytes += row.size ?? 0;
      const totals = (summary.categories[row.category] ??= { count: 0, bytes: 0 });
      totals.count++;
      totals.bytes += row.size ?? 0;
      await emit('objects', row);
    }
    await emit('summary', summary);
  }
  // Ordered cursor bounds duplicate grouping to one trip, rather than the full bucket.
  const cursor = db
    .collection('photos')
    .find(tripId ? { trip: new mongo.ObjectId(tripId) } : {}, { ...findOptions, projection })
    .sort({ trip: 1, _id: 1 })
    .allowDiskUse()
    .batchSize(pageSize);
  let groupTrip;
  let groups = new Map();
  async function flush() {
    for (const [hash, photos] of groups) {
      if (photos.length < 2) continue;
      summary.duplicateGroups++;
      summary.duplicatePhotos += photos.length;
      await emit('duplicates', {
        tripId: groupTrip,
        storedHashVersion: HASH_VERSION,
        storedHash: hash,
        photos,
      });
    }
    groups = new Map();
  }
  try {
    for await (const photo of cursor) {
      signal?.throwIfAborted();
      if (groupTrip !== id(photo.trip)) {
        await flush();
        groupTrip = id(photo.trip);
      }
      summary.photos++;
      const row = {
        photoId: id(photo._id),
        tripId: id(photo.trip),
        key: photo.key,
        thumbKey: photo.thumbKey,
      };
      const anomalies = [];
      try {
        const parsed = typeof photo.key === 'string' && parsePhotoKey(photo.key);
        const thumb = typeof photo.thumbKey === 'string' && parsePhotoKey(photo.thumbKey);
        if (
          !parsed ||
          parsed.role !== 'display' ||
          parsed.tripId !== id(photo.trip) ||
          !thumb ||
          thumb.role !== 'thumbnail' ||
          displayKey(photo.thumbKey) !== photo.key
        )
          throw new Error('invalid_photo_keys');
        // Missing objects are HEAD-confirmed, not inferred from a listing taken at another time.
        const display = await storage.head(photo.key);
        const thumbnail = await storage.head(photo.thumbKey);
        if (!display) anomalies.push('missing_display');
        if (!thumbnail) anomalies.push('missing_thumbnail');
        if (!display || !thumbnail) summary.anomalies++;
        row.anomalies = anomalies;
        if (!display) {
          row.status = 'missing_display';
          summary.skipped++;
        } else if (inventoryOnly) row.status = 'inventory_only';
        else {
          const identity = objectIdentity(display);
          if (
            display.ContentType !== 'image/jpeg' ||
            !identity.etag ||
            !identity.lastModified ||
            !Number.isSafeInteger(identity.size) ||
            identity.size <= 0 ||
            identity.size > MAX_HASH_BYTES
          )
            throw new Error('invalid_object');
          if (new Date(identity.lastModified) > cutoff) {
            row.status = 'recent_object';
            summary.skipped++;
          } else {
            const cached = cachedHash(photo, identity);
            const hash = cached ? photo.storedHash : await storage.hash(photo.key, display);
            // ETag is only a conditional object identifier, never used as the SHA-256 value.
            const after = await storage.head(photo.key);
            if (!after || !sameIdentity(identity, objectIdentity(after)))
              throw new Error('object_changed');
            // Recheck live DB reference before including the photo in a duplicate group.
            const current = await db.collection('photos').findOne(
              {
                _id: photo._id,
                trip: photo.trip,
                key: photo.key,
                updatedAt: photo.updatedAt === undefined ? { $exists: false } : photo.updatedAt,
              },
              { ...findOptions, projection: { _id: 1 } }
            );
            if (!current) throw new Error('photo_changed');
            if (apply && !cached) {
              const result = await saveStoredHash(db, photo, identity, hash, new Date());
              if (result.matchedCount !== 1) throw new Error('photo_changed');
              summary.backfilled++;
            }
            summary.hashes++;
            if (cached) summary.cached++;
            Object.assign(row, {
              status: cached ? 'cached' : 'hashed',
              storedHash: hash,
              storedHashVersion: HASH_VERSION,
              ...identity,
            });
            const members = groups.get(hash) ?? [];
            members.push({ photoId: row.photoId, key: row.key, size: identity.size });
            groups.set(hash, members);
          }
        }
      } catch (error) {
        signal?.throwIfAborted();
        summary.hashErrors++;
        const safeReasons = [
          'invalid_photo_keys',
          'invalid_object',
          'incomplete_object',
          'object_changed',
          'photo_changed',
        ];
        row.status = 'error';
        row.reason = safeReasons.includes(error.message)
          ? error.message
          : 'storage_or_database_error';
      }
      await emit('photos', row);
      // Frequent checkpoint makes interruption visible without retaining every result in memory.
      if (summary.photos % pageSize === 0) await emit('summary', summary);
    }
    await flush();
  } finally {
    await cursor.close();
  }
  summary.complete = true;
  summary.finishedAt = new Date().toISOString();
  summary.hashCoverageComplete =
    !inventoryOnly && summary.hashErrors === 0 && summary.skipped === 0;
  await emit('summary', summary);
  return summary;
}
