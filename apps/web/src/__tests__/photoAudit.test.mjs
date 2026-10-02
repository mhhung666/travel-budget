// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { mongo } from 'mongoose';
import {
  HASH_VERSION,
  classifyObject,
  digestBody,
  cachedHash,
  saveStoredHash,
  createAuditStorage,
  runPhotoAudit,
  parsePhotoKey,
} from '../../scripts/lib/photo-audit.mjs';

const trip = new mongo.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const otherTrip = new mongo.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const key = (n, t = trip) =>
  `photos/${t}/00000000-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`;
const thumb = (key) => key.replace(/\.jpg$/, '_t.webp');
const publicKey = (key) => key.replace(/\.jpg$/, '_p.jpg');
const old = new Date('2026-09-01T00:00:00Z');
const now = new Date('2026-10-01T00:00:00Z');
const cutoff = new Date('2026-09-29T00:00:00Z');
const body = Buffer.from('identical stored JPEG bytes');
const hash = createHash('sha256').update(body).digest('hex');
const metadata = {
  ETag: '"opaque-etag"',
  ContentLength: body.length,
  LastModified: old,
  ContentType: 'image/jpeg',
};
const identity = { etag: metadata.ETag, size: body.length, lastModified: old.toISOString() };
function photo(n, t = trip) {
  return {
    _id: new mongo.ObjectId(),
    trip: t,
    key: key(n, t),
    thumbKey: thumb(key(n, t)),
    updatedAt: old,
  };
}
function object(k = key(1), date = old) {
  return { Key: k, Size: 10, LastModified: date, ETag: 'opaque' };
}
function context(extra = {}) {
  return {
    photos: [],
    blobs: [],
    uploads: [],
    trips: [{ _id: trip }],
    tripJobs: [],
    now,
    ...extra,
  };
}

// Minimal in-memory query adapter; independent real MongoDB CAS tests live below.
function equal(a, b) {
  return String(a) === String(b);
}
function matches(doc, query) {
  return Object.entries(query).every(([field, value]) => {
    if (field === '$or') return value.some((q) => matches(doc, q));
    if (value?.$in) return value.$in.some((v) => equal(doc[field], v));
    if (value && typeof value === 'object' && '$exists' in value)
      return (doc[field] !== undefined) === value.$exists;
    return equal(doc[field], value);
  });
}
function database(data = {}) {
  const collections = new Map();
  const db = {
    collection(name) {
      if (!collections.has(name)) {
        const rows = data[name] ?? [];
        collections.set(name, {
          find: vi.fn((query) => {
            const selected = rows.filter((r) => matches(r, query));
            const cursor = {
              sort() {
                selected.sort((a, b) => String(a.trip).localeCompare(String(b.trip)));
                return this;
              },
              allowDiskUse() {
                return this;
              },
              batchSize() {
                return this;
              },
              toArray: async () => selected,
              close: vi.fn(),
              async *[Symbol.asyncIterator]() {
                yield* selected;
              },
            };
            return cursor;
          }),
          findOne: vi.fn(async (query) => rows.find((r) => matches(r, query)) ?? null),
          updateOne: vi.fn(async (query, update) => {
            const row = rows.find((r) => matches(r, query));
            if (!row) return { matchedCount: 0 };
            Object.assign(row, update.$set);
            return { matchedCount: 1 };
          }),
        });
      }
      return collections.get(name);
    },
  };
  return db;
}
function storage(objects = []) {
  return {
    async *pages() {
      yield objects.slice(0, 2);
      yield objects.slice(2);
    },
    head: vi.fn(async () => ({ ...metadata })),
    hash: vi.fn(async () => hash),
  };
}
async function run(options = {}) {
  const rows = { objects: [], photos: [], duplicates: [], summary: [] };
  const db = options.db ?? database({ photos: [photo(1)], trips: [{ _id: trip }] });
  const store = options.storage ?? storage([object()]);
  const summary = await runPhotoAudit({
    db,
    storage: store,
    now,
    emit: async (kind, row) => rows[kind].push(structuredClone(row)),
    ...options,
  });
  return { rows, summary, db, store };
}

describe('historical photo inventory', () => {
  it('recognizes all three related objects and never labels public copies as orphans', () => {
    const p = photo(1);
    for (const k of [p.key, p.thumbKey, publicKey(p.key)]) {
      expect(classifyObject(object(k), context({ photos: [p] }), cutoff).category).toBe(
        'referenced'
      );
    }
    expect(parsePhotoKey('photos/wrong/arbitrary.jpg')).toBeNull();
    expect(classifyObject(object(key(1), 'invalid date'), context(), cutoff)).toMatchObject({
      category: 'unknown_age',
      lastModified: null,
    });
  });
  it('reports reference/cleanup conflict before considering retirement or age', () => {
    expect(
      classifyObject(
        object(),
        context({ photos: [photo(1)], blobs: [{ _id: key(1), completedAt: old }] }),
        cutoff
      ).category
    ).toBe('referenced_cleanup_conflict');
  });
  it.each([
    [
      'active_upload',
      {
        uploads: [
          { _id: 'job', key: key(1), status: 'pending', expiresAt: new Date('2026-10-02') },
        ],
      },
    ],
    [
      'tracked_upload',
      { uploads: [{ _id: 'job', key: key(1), status: 'pending', expiresAt: old }] },
    ],
    ['tracked_upload', { uploads: [{ _id: 'job', key: key(1), status: 'saved', expiresAt: old }] }],
    ['pending_blob_cleanup', { blobs: [{ _id: key(1), attempts: 2 }] }],
    ['retired_object_present', { blobs: [{ _id: key(1), completedAt: old }] }],
    ['pending_trip_cleanup', { trips: [], tripJobs: [{ _id: trip }] }],
    ['deleted_trip_object_present', { trips: [], tripJobs: [{ _id: trip, completedAt: old }] }],
    ['trip_cleanup_conflict', { tripJobs: [{ _id: trip }] }],
    ['missing_trip_candidate', { trips: [] }],
    ['suspected_orphan', {}],
  ])('classifies %s separately', (category, extra) => {
    expect(classifyObject(object(), context(extra), cutoff).category).toBe(category);
  });
  it('protects recent, unknown-age and unknown-key objects', () => {
    expect(classifyObject(object(key(1), now), context(), cutoff).category).toBe(
      'recent_unreferenced'
    );
    expect(classifyObject({ Key: key(1) }, context(), cutoff).category).toBe('unknown_age');
    expect(classifyObject(object('photos/unrecognized.bin'), context(), cutoff).category).toBe(
      'unknown_key'
    );
  });
  it('paginates inventory and checks missing pairs independently from the listing', async () => {
    const p = photo(1);
    const store = storage([object(), object(p.thumbKey), object(publicKey(p.key))]);
    store.head.mockImplementation(async (k) => (k === p.thumbKey ? null : metadata));
    const result = await run({
      storage: store,
      db: database({ photos: [p], trips: [{ _id: trip }] }),
    });
    expect(result.summary.objects).toBe(3);
    expect(result.summary.categories.referenced.count).toBe(3);
    expect(result.rows.photos[0].anomalies).toEqual(['missing_thumbnail']);
    expect(result.summary.anomalies).toBe(1);
  });
});

describe('stored JPEG fingerprints', () => {
  it('streams bytes and rejects truncation/oversize without accumulating the image', async () => {
    expect(
      await digestBody(Readable.from([body.subarray(0, 3), body.subarray(3)]), body.length)
    ).toBe(hash);
    await expect(digestBody(Readable.from([body]), body.length + 1)).rejects.toThrow(
      'incomplete_object'
    );
    await expect(digestBody(Readable.from([body]), body.length - 1)).rejects.toThrow(
      'invalid_object'
    );
    await expect(digestBody(Readable.from([body]), 7 * 1024 * 1024)).rejects.toThrow(
      'invalid_object'
    );
  });
  it('only reuses a matching hash semantic version and complete object identity', () => {
    const p = {
      storedHash: hash,
      storedHashVersion: HASH_VERSION,
      storedHashETag: identity.etag,
      storedHashSize: identity.size,
      storedHashLastModified: old,
    };
    expect(cachedHash(p, identity)).toBe(true);
    expect(cachedHash(p, { ...identity, lastModified: now.toISOString() })).toBe(false);
    expect(cachedHash(p, { ...identity, etag: 'different' })).toBe(false);
    expect(cachedHash({ ...p, storedHashVersion: 'sha256-file-v1' }, identity)).toBe(false);
  });
  it('dry run computes same-trip duplicates without changing any documents', async () => {
    const db = database({
      photos: [photo(1), photo(2), photo(3, otherTrip)],
      trips: [{ _id: trip }, { _id: otherTrip }],
    });
    const result = await run({ db });
    expect(result.rows.duplicates).toHaveLength(1);
    expect(result.rows.duplicates[0].tripId).toBe(String(trip));
    expect(result.rows.duplicates[0].photos).toHaveLength(2);
    expect(result.summary.hashes).toBe(3);
    expect(result.summary.hashCoverageComplete).toBe(true);
    expect(db.collection('photos').updateOne).not.toHaveBeenCalled();
  });
  it('apply backfills only stored metadata and re-run avoids downloading unchanged objects', async () => {
    const p = photo(1);
    p.sourceHash = 'f'.repeat(64);
    const db = database({ photos: [p] });
    expect((await run({ db, apply: true })).summary.backfilled).toBe(1);
    expect(p.sourceHash).toBe('f'.repeat(64));
    expect(p.updatedAt).toEqual(old);
    const repeat = await run({ db, apply: true });
    expect(repeat.summary.cached).toBe(1);
    expect(repeat.store.hash).not.toHaveBeenCalled();
    expect(repeat.summary.backfilled).toBe(0);
  });
  it('object change between GET and final HEAD prevents backfill and duplicate inclusion', async () => {
    const store = storage();
    store.head
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce({ ...metadata, ETag: 'changed' });
    const result = await run({ storage: store, apply: true });
    expect(result.rows.photos[0].reason).toBe('object_changed');
    expect(result.summary.hashes).toBe(0);
    expect(result.db.collection('photos').updateOne).not.toHaveBeenCalled();
  });
  it('deleted/edited photos cannot be recreated or included in duplicate groups', async () => {
    const db = database({ photos: [photo(1)] });
    db.collection('photos').findOne.mockResolvedValue(null);
    const result = await run({ db, apply: true });
    expect(result.rows.photos[0].reason).toBe('photo_changed');
    expect(db.collection('photos').updateOne).not.toHaveBeenCalled();
  });
  it('CAS conflict is reported instead of silently claiming a backfill', async () => {
    const db = database({ photos: [photo(1)] });
    db.collection('photos').updateOne.mockResolvedValue({ matchedCount: 0 });
    const result = await run({ db, apply: true });
    expect(result.rows.photos[0].reason).toBe('photo_changed');
    expect(result.summary.backfilled).toBe(0);
  });
  it('missing displays and recent uploads do not generate hashes', async () => {
    const store = storage();
    store.head.mockResolvedValueOnce(null).mockResolvedValueOnce(metadata);
    const missing = await run({ storage: store });
    expect(missing.summary.skipped).toBe(1);
    expect(missing.summary.hashCoverageComplete).toBe(false);
    const recentStore = storage();
    recentStore.head.mockResolvedValue({ ...metadata, LastModified: now });
    const recent = await run({ storage: recentStore });
    expect(recent.rows.photos[0].status).toBe('recent_object');
    expect(recentStore.hash).not.toHaveBeenCalled();
  });
  it('isolates storage failures, redacts errors, and continues subsequent photos', async () => {
    const store = storage();
    store.hash.mockRejectedValueOnce(new Error('secret credentials and endpoint'));
    const result = await run({ storage: store, db: database({ photos: [photo(1), photo(2)] }) });
    expect(result.summary.complete).toBe(true);
    expect(result.summary.hashErrors).toBe(1);
    expect(result.summary.hashes).toBe(1);
    expect(JSON.stringify(result.rows)).not.toContain('secret');
  });
  it('inventory-only checks missing pairs without GET or mutation', async () => {
    const result = await run({ inventoryOnly: true });
    expect(result.store.hash).not.toHaveBeenCalled();
    expect(result.db.collection('photos').updateOne).not.toHaveBeenCalled();
    expect(result.rows.photos[0].status).toBe('inventory_only');
  });
  it('aborted scans retain an incomplete checkpoint and never mark complete', async () => {
    const emit = vi.fn();
    const abort = new AbortController();
    abort.abort();
    await expect(
      runPhotoAudit({
        db: database(),
        storage: storage([object()]),
        emit,
        now,
        signal: abort.signal,
      })
    ).rejects.toThrow();
    expect(emit).toHaveBeenCalledWith('summary', expect.objectContaining({ complete: false }));
  });
});

describe('R2 adapter and CLI boundaries', () => {
  it('uses continuation tokens, includes metadata, and fails on broken pagination', async () => {
    const client = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          Contents: [object()],
          IsTruncated: true,
          NextContinuationToken: 'next',
        })
        .mockResolvedValueOnce({ Contents: [object(key(2))] }),
    };
    const store = createAuditStorage(client, 'private', { delayMs: 0 });
    const pages = [];
    for await (const page of store.pages('photos/', 1)) pages.push(page);
    expect(pages).toHaveLength(2);
    expect(client.send.mock.calls[1][0].input.ContinuationToken).toBe('next');
    client.send.mockResolvedValue({ IsTruncated: true });
    await expect(async () => {
      for await (const page of store.pages('photos/', 1)) void page;
    }).rejects.toThrow('invalid_pagination');
  });
  it('only treats HEAD 404 as missing, never 403/503', async () => {
    const client = { send: vi.fn() };
    const store = createAuditStorage(client, 'private', { delayMs: 0 });
    client.send.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    expect(await store.head(key(1))).toBeNull();
    client.send.mockRejectedValue({ $metadata: { httpStatusCode: 503 } });
    await expect(store.head(key(1))).rejects.toBeDefined();
  });
  it('GET is conditional and hashes content instead of using ETag as a fingerprint', async () => {
    const client = {
      send: vi.fn().mockResolvedValue({ ...metadata, Body: Readable.from([body]) }),
    };
    const store = createAuditStorage(client, 'private', { delayMs: 0 });
    expect(await store.hash(key(1), metadata)).toBe(hash);
    expect(client.send.mock.calls[0][0].input.IfMatch).toBe(metadata.ETag);
  });
  it('cancellation interrupts a stalled GET response body', async () => {
    const stream = new Readable({ read() {} });
    const client = { send: vi.fn().mockResolvedValue({ ...metadata, Body: stream }) };
    const abort = new AbortController();
    const store = createAuditStorage(client, 'private', { delayMs: 0, signal: abort.signal });
    const pending = store.hash(key(1), metadata);
    const rejected = expect(pending).rejects.toThrow('read_aborted');
    await new Promise((resolve) => setImmediate(resolve));
    abort.abort();
    await rejected;
    expect(stream.destroyed).toBe(true);
  });
  it('help runs offline and app credentials never implicitly select a target', () => {
    const env = {
      ...process.env,
      PHOTO_AUDIT_MONGODB_URI: '',
      MONGODB_URI: 'mongodb://secret.invalid/private',
    };
    const call = (...args) =>
      spawnSync(process.execPath, ['scripts/photo-audit.mjs', ...args], { env, encoding: 'utf8' });
    expect(call('--help').status).toBe(0);
    const refused = call('--all', '--out', '/tmp/unused-photo-audit');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('Explicit audit target required');
    expect(refused.stderr).not.toContain('secret.invalid');
    for (const args of [
      ['--all', '--trip', String(trip)],
      ['--all', '--apply', '--inventory-only'],
      ['--all', '--grace-hours', '0'],
    ]) {
      expect(call(...args, '--out', '/tmp/unused-photo-audit').status).toBe(1);
    }
  });
});

// Opt-in uses the same isolated loopback replica set as upload tests. Never use app URI.
const uri = process.env.PHOTO_UPLOAD_TEST_MONGODB_URI;
describe.skipIf(!uri)('real MongoDB hash backfill', () => {
  it('runs inventory, dry-run duplicates, backfill and cache re-use against real queries', async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri))
      throw new Error('Loopback MongoDB required');
    const client = new mongo.MongoClient(uri);
    const { randomUUID } = await import('node:crypto');
    const db = client.db(`tb_photo_audit_${randomUUID().replaceAll('-', '')}`);
    try {
      const photos = [photo(1), photo(2), photo(3, otherTrip)];
      await db.collection('photos').insertMany(photos);
      await db.collection('trips').insertMany([{ _id: trip }, { _id: otherTrip }]);
      const objects = [
        ...photos.flatMap((p) => [object(p.key), object(p.thumbKey), object(publicKey(p.key))]),
        object(key(9)),
      ];
      const before = await db.collection('photos').find({}).toArray();
      const read = await run({ db, storage: storage(objects) });
      expect(read.summary.categories.referenced.count).toBe(9);
      expect(read.summary.categories.suspected_orphan.count).toBe(1);
      expect(read.summary.duplicateGroups).toBe(1);
      expect(await db.collection('photos').find({}).toArray()).toEqual(before);
      const written = await run({ db, storage: storage(objects), apply: true });
      expect(written.summary.backfilled).toBe(3);
      const resumed = await run({ db, storage: storage(objects), apply: true });
      expect(resumed.summary.cached).toBe(3);
      expect(resumed.store.hash).not.toHaveBeenCalled();
      expect(resumed.summary.duplicateGroups).toBe(1);
      const singleTrip = await run({ db, tripId: String(trip), storage: storage([]) });
      expect(singleTrip.summary.photos).toBe(2);
      expect((await db.listCollections().toArray()).map((c) => c.name).sort()).toEqual([
        'photos',
        'trips',
      ]);
    } finally {
      await db.dropDatabase();
      await client.close();
    }
  });
  it('CAS preserves existing fields, cannot resurrect a deleted photo, and is resumable', async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri))
      throw new Error('Loopback MongoDB required');
    const client = new mongo.MongoClient(uri);
    const { randomUUID } = await import('node:crypto');
    const db = client.db(`tb_photo_audit_${randomUUID().replaceAll('-', '')}`);
    try {
      const p = { ...photo(1), caption: 'keep', sourceHash: 'a'.repeat(64) };
      await db.collection('photos').insertOne(p);
      expect((await saveStoredHash(db, p, identity, hash, now)).matchedCount).toBe(1);
      const saved = await db.collection('photos').findOne({ _id: p._id });
      expect(saved.caption).toBe('keep');
      expect(saved.sourceHash).toBe(p.sourceHash);
      expect(saved.updatedAt).toEqual(p.updatedAt);
      expect(cachedHash(saved, identity)).toBe(true);
      expect((await saveStoredHash(db, p, identity, hash, now)).matchedCount).toBe(0);
      await db.collection('photos').deleteOne({ _id: p._id });
      expect((await saveStoredHash(db, saved, identity, hash, now)).matchedCount).toBe(0);
      expect(await db.collection('photos').countDocuments()).toBe(0);
    } finally {
      await db.dropDatabase();
      await client.close();
    }
  });
});
