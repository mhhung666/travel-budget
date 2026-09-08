import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { up } from '../migrations/20260905093000-core-query-indexes.js';
import { coreQueries, summarizeExplain } from './lib/mongo-explain.mjs';

// Fixed synthetic snapshot, never copied from the app. No dotenv or app-URI fallback.
const uri = process.env.MONGODB_INDEX_TEST_URI;
if (!uri || process.env.MONGODB_INDEX_TEST_ALLOW_WRITES !== '1') {
  throw new Error('Explicit disposable MONGODB_INDEX_TEST_URI and write opt-in required');
}
const client = new mongoose.mongo.MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 60000,
  writeConcern: { w: 'majority' },
});
const owned = [];
const oid = (n) => new mongoose.mongo.ObjectId(n.toString(16).padStart(24, '0'));
const epoch = Date.UTC(2026, 0, 1);
const counts = {
  expenses: 100000,
  payments: 20000,
  checklists: 20000,
  photos: 20000,
  users: 10000,
  itinerarydays: 1000,
};
function document(collection, i) {
  if (collection === 'users')
    return {
      _id: oid(i + 1),
      username: `user${i}`,
      email: `user${i}@example.invalid`,
      password: 'synthetic-hash',
      displayName: `Synthetic ${i}`,
    };
  return {
    _id: oid(i + 1),
    trip: oid((i % 100) + 1),
    date: new Date(epoch + i * 60000),
    createdAt: new Date(epoch + i * 60000),
    takenAt: new Date(epoch + i * 60000),
    dayNumber: i % 10,
    amount: i % 1000,
    description: 'Synthetic expense for index verification',
    payer: oid(1),
    createdBy: oid(1),
    from: oid(1),
    to: oid(2),
    splits: [{ user: oid(1), amount: i % 1000 }],
    note: 'synthetic',
  };
}
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const latency = (values) => ({
  samples: values.length,
  p50Ms: percentile(values, 0.5),
  p95Ms: percentile(values, 0.95),
});
async function prepare(label) {
  const db = client.db(`tb_core_bench_${randomUUID().replaceAll('-', '')}`);
  assert.equal((await db.listCollections().toArray()).length, 0);
  await db.createCollection('verification_owner');
  owned.push(db);
  for (const [collection, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1000) {
      await db
        .collection(collection)
        .insertMany(
          Array.from({ length: Math.min(1000, count - i) }, (_, j) => document(collection, i + j))
        );
    }
    if (collection === 'users') {
      await db.collection(collection).createIndex({ username: 1 }, { unique: true });
      await db.collection(collection).createIndex({ email: 1 }, { unique: true });
    } else if (collection === 'itinerarydays') {
      await db.collection(collection).createIndex({ trip: 1, dayNumber: 1 });
    } else {
      await db.collection(collection).createIndex({ trip: 1 });
      if (collection === 'photos')
        await db.collection(collection).createIndex({ trip: 1, takenAt: -1 });
    }
  }
  if (label === 'after') await up(db);
  return db;
}
function cursor(db, query) {
  let c = db
    .collection(query.collection)
    .find(query.filter, { projection: query.projection, maxTimeMS: 60000 });
  if (query.sort) c = c.sort(query.sort);
  if (query.collation) c = c.collation(query.collation);
  if (query.limit) c = c.limit(query.limit);
  return c;
}
const digest = (docs) =>
  createHash('sha256')
    .update(JSON.stringify(docs.sort((a, b) => String(a._id).localeCompare(String(b._id)))))
    .digest('hex');
const result = {
  kind: 'isolated synthetic; not production latency',
  seedCounts: counts,
  readRounds: 5,
  writeRounds: 30,
  batchSize: 50,
  writeConcern: 'majority',
  queries: [],
  writes: {},
  indexBytes: {},
};
try {
  await client.connect();
  const before = await prepare('before');
  const after = await prepare('after');
  for (const query of coreQueries({
    trip: oid(1),
    since: new Date(epoch + 99900 * 60000),
    username: 'USER9999',
    email: 'USER9999@example.invalid',
  })) {
    assert.equal(
      digest(await cursor(before, query).toArray()),
      digest(await cursor(after, query).toArray()),
      `${query.name}: result changed`
    );
    const row = { name: query.name, before: {}, after: {} };
    for (const [label, db] of [
      ['before', before],
      ['after', after],
    ]) {
      row[label].plan = summarizeExplain(await cursor(db, query).explain('executionStats'));
      await cursor(db, query).toArray(); // warm-up, excluded
    }
    const samples = { before: [], after: [] };
    for (let round = 0; round < 5; round++) {
      for (const [label, db] of round % 2
        ? [
            ['after', after],
            ['before', before],
          ]
        : [
            ['before', before],
            ['after', after],
          ]) {
        const start = performance.now();
        await cursor(db, query).toArray();
        samples[label].push(performance.now() - start);
      }
    }
    for (const label of ['before', 'after']) row[label].latency = latency(samples[label]);
    if (['expenses.list', 'payments.list', 'checklists.list', 'photos.list'].includes(query.name))
      assert.equal(row.after.plan.blockingSort, false);
    if (query.name === 'expenses.digest')
      assert.ok(row.after.plan.totalDocsExamined < row.before.plan.totalDocsExamined);
    result.queries.push(row);
  }
  for (const collection of ['expenses', 'payments', 'checklists', 'photos', 'users']) {
    const samples = { before: { insert: [], update: [] }, after: { insert: [], update: [] } };
    for (let round = -1; round < 30; round++) {
      // separate warm-up batch
      const offset = counts[collection] + (round + 1) * 50;
      for (const [label, db] of round % 2
        ? [
            ['after', after],
            ['before', before],
          ]
        : [
            ['before', before],
            ['after', after],
          ]) {
        const batch = Array.from({ length: 50 }, (_, j) => document(collection, offset + j));
        let start = performance.now();
        await db.collection(collection).insertMany(batch);
        if (round >= 0) samples[label].insert.push(performance.now() - start);
        start = performance.now();
        await db.collection(collection).bulkWrite(
          batch.map((doc) => ({
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set:
                  collection === 'users'
                    ? { email: `updated${doc._id}@example.invalid` }
                    : {
                        createdAt: new Date(epoch),
                        date: new Date(epoch),
                        takenAt: new Date(epoch),
                      },
              },
            },
          }))
        );
        if (round >= 0) samples[label].update.push(performance.now() - start);
      }
    }
    result.writes[collection] = Object.fromEntries(
      Object.entries(samples).map(([label, operations]) => [
        label,
        Object.fromEntries(Object.entries(operations).map(([op, values]) => [op, latency(values)])),
      ])
    );
    assert.equal(
      digest(await before.collection(collection).find().toArray()),
      digest(await after.collection(collection).find().toArray()),
      'Final snapshot mismatch'
    );
    result.indexBytes[collection] = {};
    for (const [label, db] of [
      ['before', before],
      ['after', after],
    ]) {
      const stats = await db.command({ collStats: collection });
      result.indexBytes[collection][label] = stats.totalIndexSize;
    }
  }
} catch (error) {
  console.error(JSON.stringify({ failed: true, type: error.name, code: error.code ?? null }));
  process.exitCode = 1;
} finally {
  try {
    for (const db of owned) {
      try {
        await db.dropDatabase();
      } catch {
        console.error(`Cleanup failed for owned isolated database: ${db.databaseName}`);
        process.exitCode = 1;
      }
    }
  } catch {
    process.exitCode = 1;
    console.error('Isolated benchmark database cleanup failed');
  } finally {
    await client.close();
  }
}
if (!process.exitCode)
  console.log(JSON.stringify({ ...result, passed: true, cleaned: true }, null, 2));
