// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  beginPhotoUploadJob,
  expirePhotoUploadJobs,
  finalizePhotoUploadJob,
  photoUploadJobs,
  readPhotoUploadJob,
  PHOTO_UPLOAD_LEASE_MS,
} from '@/lib/photoUploadJobs';
import { runBlobCleanup } from '@/lib/blobCleanup';
import { deleteTripAtomically } from '@/lib/tripDeletion';
import type { BeginPhotoUploadInput } from '@/lib/photoUploadProtocol';

// Explicit opt-in, loopback only, isolated UUID database. Never use the application DB URI.
const uri = process.env.PHOTO_UPLOAD_TEST_MONGODB_URI;
const enabled = !!uri;
describe.skipIf(!enabled)('photo upload transactions (real MongoDB replica set)', () => {
  let client: mongo.MongoClient;
  let db: mongo.Db;
  const trip = new mongo.ObjectId();
  const actor = new mongo.ObjectId();
  const other = new mongo.ObjectId();
  const begin = (input: BeginPhotoUploadInput, user = actor, parent = trip) =>
    beginPhotoUploadJob(db, parent.toHexString(), user.toHexString(), input);
  const finish = (id: string, user = actor, parent = trip) =>
    finalizePhotoUploadJob(db, parent.toHexString(), user.toHexString(), id);
  const input = (hash = 'a'.repeat(64)): BeginPhotoUploadInput => ({
    uploadId: randomUUID(),
    sourceHash: hash,
    sourceSize: 100,
    displaySize: 20,
    thumbSize: 10,
    item: { key: 'ignored', thumb_key: 'ignored', width: 20, height: 10 },
  });
  beforeAll(async () => {
    const parsed = new URL(uri!);
    if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname))
      throw Error('Use an isolated loopback replica set');
    client = await new mongo.MongoClient(uri!).connect();
    db = client.db(`photo_upload_test_${randomUUID().replaceAll('-', '')}`);
    const migrationPath = '../../migrations/20261001090000-photo-upload-jobs.js';
    const migration = await import(migrationPath);
    await migration.up(db);
    await migration.up(db); // Deploy retry is safe.
    await db.collection('photos').createIndex({ key: 1 }, { unique: true });
    await db.collection('users').insertMany([
      { _id: actor, displayName: 'A' },
      { _id: other, displayName: 'B' },
    ]);
  });
  beforeEach(async () => {
    for (const collection of [
      'trips',
      'photos',
      'photouploadjobs',
      'blobcleanupjobs',
      'tripcleanupjobs',
      'itinerarydays',
    ])
      await db.collection(collection).deleteMany({});
    await db.collection('trips').insertOne({
      _id: trip,
      members: [
        { user: actor, role: 'admin' },
        { user: other, role: 'member' },
      ],
    });
  });
  afterAll(async () => {
    if (db) await db.dropDatabase();
    await client?.close();
  });

  it('allocates once and atomically returns the same committed photo on retries', async () => {
    const request = input();
    const [a, b] = await Promise.all([begin(request), begin(request)]);
    expect(a.status).toBe('pending');
    expect(b).toMatchObject({ status: 'pending' });
    expect(await photoUploadJobs(db).countDocuments()).toBe(1);
    const [saved, retried] = await Promise.all([
      finish(request.uploadId),
      finish(request.uploadId),
    ]);
    expect(saved).toEqual(retried);
    expect(saved.status).toBe('saved');
    expect(await db.collection('photos').countDocuments()).toBe(1);
    expect(await begin(request)).toEqual(saved);
  });
  it('serializes two members uploading identical bytes and retires only the losing keys', async () => {
    const first = input();
    const second = input();
    await Promise.all([begin(first), begin(second, other)]);
    const results = await Promise.all([finish(first.uploadId), finish(second.uploadId, other)]);
    expect(results.map((r) => r.status).sort()).toEqual(['duplicate', 'saved']);
    expect(await db.collection('photos').countDocuments()).toBe(1);
    const loser = await photoUploadJobs(db).findOne({ status: 'duplicate' });
    const jobs = await db.collection('blobcleanupjobs').find().toArray();
    expect(jobs).toHaveLength(3);
    expect(jobs.every((job) => job.availableAt.getTime() >= loser!.expiresAt.getTime())).toBe(true);
    const winner = await db.collection('photos').findOne();
    expect(jobs.some((job) => job._id === winner!.key)).toBe(false);
  });
  it('keeps legacy photos without a hash and enforces the partial unique index for new photos', async () => {
    await db.collection('photos').insertMany([
      { trip, key: 'legacy-a' },
      { trip, key: 'legacy-b' },
    ]);
    const request = input();
    await begin(request);
    await finish(request.uploadId);
    await expect(
      db.collection('photos').insertOne({ trip, key: 'other-key', sourceHash: request.sourceHash })
    ).rejects.toMatchObject({ code: 11000 });
  });
  it('does not deduplicate across trips', async () => {
    const parent = new mongo.ObjectId();
    await db.collection('trips').insertOne({ _id: parent, members: [{ user: actor }] });
    const a = input();
    const b = input();
    await begin(a);
    await begin(b, actor, parent);
    expect((await finish(a.uploadId)).status).toBe('saved');
    expect((await finish(b.uploadId, actor, parent)).status).toBe('saved');
    expect(await db.collection('photos').countDocuments()).toBe(2);
  });
  it('rejects another member reusing the operation ID, without changing the owner', async () => {
    const request = input();
    await begin(request);
    await expect(begin(request, other)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      readPhotoUploadJob(db, trip.toHexString(), other.toHexString(), request.uploadId)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await photoUploadJobs(db).findOne({ _id: request.uploadId }))?.user).toEqual(actor);
  });
  it('expires unreferenced uploads even after the original member has left', async () => {
    const request = input();
    await begin(request);
    await photoUploadJobs(db).updateOne(
      { _id: request.uploadId },
      { $set: { expiresAt: new Date(0) } }
    );
    await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [{ user: other }] } });
    expect(await expirePhotoUploadJobs(db)).toBe(1);
    expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(3);
    expect((await photoUploadJobs(db).findOne({ _id: request.uploadId }))?.status).toBe('expired');
  });
  it('never resurrects an expired operation or retires a renewed lease', async () => {
    const expired = input();
    await begin(expired);
    await photoUploadJobs(db).updateOne(
      { _id: expired.uploadId },
      { $set: { expiresAt: new Date(0) } }
    );
    expect((await begin(expired)).status).toBe('expired');
    expect((await finish(expired.uploadId)).status).toBe('expired');
    await expirePhotoUploadJobs(db);
    const fresh = input('b'.repeat(64));
    await begin(fresh);
    await begin(fresh);
    expect(await expirePhotoUploadJobs(db)).toBe(0);
    expect((await finish(fresh.uploadId)).status).toBe('saved');
  });
  it('cleanup and finalize agree on one outcome and never retire a saved photo', async () => {
    const request = input();
    await begin(request);
    const future = new Date(Date.now() + PHOTO_UPLOAD_LEASE_MS + 1000);
    await Promise.all([finish(request.uploadId), expirePhotoUploadJobs(db, { now: future })]);
    const job = await photoUploadJobs(db).findOne({ _id: request.uploadId });
    const count = await db.collection('photos').countDocuments();
    if (job?.status === 'saved') {
      expect(count).toBe(1);
      expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(0);
    } else {
      expect(job?.status).toBe('expired');
      expect(count).toBe(0);
      expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(3);
    }
  });
  it('retains failed deletion jobs and sweeps a late object a second time', async () => {
    const request = input();
    await begin(request);
    await photoUploadJobs(db).updateOne(
      { _id: request.uploadId },
      { $set: { expiresAt: new Date(0) } }
    );
    await expirePhotoUploadJobs(db);
    const now = new Date();
    expect(
      (
        await runBlobCleanup(
          db,
          async () => {
            throw Error('R2 offline');
          },
          { now }
        )
      ).status
    ).toBe('retry');
    expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(3);
    const first = new Date(now.getTime() + 6 * 60_000);
    expect((await runBlobCleanup(db, async () => {}, { now: first })).status).toBe('cleaned');
    expect(
      await db.collection('blobcleanupjobs').countDocuments({ completedAt: { $exists: true } })
    ).toBe(0);
    expect(
      (
        await runBlobCleanup(db, async () => {}, {
          now: new Date(first.getTime() + PHOTO_UPLOAD_LEASE_MS + 1000),
        })
      ).status
    ).toBe('cleaned');
    expect(
      await db.collection('blobcleanupjobs').countDocuments({ completedAt: { $exists: true } })
    ).toBe(3);
  });
  it('expiration preserves objects referenced by a legacy client', async () => {
    const request = input();
    const result = await begin(request);
    if (result.status !== 'pending') throw Error('Expected upload');
    await db
      .collection('photos')
      .insertOne({ trip, key: result.job.key, thumbKey: result.job.thumbKey });
    await photoUploadJobs(db).updateOne(
      { _id: request.uploadId },
      { $set: { expiresAt: new Date(0) } }
    );
    await expirePhotoUploadJobs(db);
    expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(0);
  });
  it('enforces the capacity limit during concurrent finalization and stops new allocations', async () => {
    await db
      .collection('photos')
      .insertMany(Array.from({ length: 299 }, (_, i) => ({ trip, key: `old-${i}` })));
    const a = input();
    const b = input('b'.repeat(64));
    await begin(a);
    await begin(b);
    const results = await Promise.all([finish(a.uploadId), finish(b.uploadId)]);
    expect(results.map((r) => r.status).sort()).toEqual(['full', 'saved']);
    expect(await db.collection('photos').countDocuments()).toBe(300);
    const count = await photoUploadJobs(db).countDocuments();
    expect((await begin(input('c'.repeat(64)))).status).toBe('full');
    expect(await photoUploadJobs(db).countDocuments()).toBe(count);
  });
  it('trip deletion removes jobs atomically and leaves prefix cleanup responsible for late PUTs', async () => {
    const request = input();
    await begin(request);
    await deleteTripAtomically(db, trip.toHexString(), actor.toHexString());
    expect(await photoUploadJobs(db).countDocuments()).toBe(0);
    expect(await db.collection('tripcleanupjobs').countDocuments()).toBe(1);
    await expect(finish(request.uploadId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
