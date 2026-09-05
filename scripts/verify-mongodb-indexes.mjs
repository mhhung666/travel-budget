import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { up, down } from '../migrations/20260905093000-core-query-indexes.js';
import { CANDIDATE_INDEXES } from './lib/mongo-explain.mjs';

// Deliberately no dotenv/app URI fallback. Only use a disposable MongoDB server.
const uri = process.env.MONGODB_INDEX_TEST_URI;
if (!uri || process.env.MONGODB_INDEX_TEST_ALLOW_WRITES !== '1') {
  process.stderr.write(
    'Set MONGODB_INDEX_TEST_URI and MONGODB_INDEX_TEST_ALLOW_WRITES=1 for an isolated disposable server.\n'
  );
  process.exit(1);
}

const client = new mongoose.mongo.MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 60000,
});
const results = [];
async function scenario(name, verify) {
  // Never use the URI database or accept a user-provided cleanup target.
  const databaseName = `tb_index_verify_${randomUUID().replaceAll('-', '')}`;
  const db = client.db(databaseName);
  let owned = false;
  try {
    assert.equal((await db.listCollections({}, { nameOnly: true }).toArray()).length, 0);
    await db.createCollection('verification_owner');
    owned = true;
    await verify(db);
    results.push({ name, passed: true });
  } finally {
    // Only the fresh random database created by this scenario is disposable.
    if (owned) {
      try {
        await db.dropDatabase();
      } catch {
        process.stderr.write(`Cleanup failed; isolated database retained: ${databaseName}\n`);
        throw new Error('Isolated database cleanup failed');
      }
    }
  }
}

async function indexes(db) {
  return Promise.all(
    CANDIDATE_INDEXES.map(async ({ collection, name }) =>
      (await db.collection(collection).listIndexes().toArray()).find((i) => i.name === name)
    )
  );
}

async function expectOneDuplicate(operations, field) {
  const outcomes = await Promise.allSettled(operations);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  const failures = outcomes.filter((r) => r.status === 'rejected');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason.code, 11000);
  assert.deepEqual(failures[0].reason.keyPattern, { [field]: 1 });
}

try {
  await client.connect();
  await scenario('owned up/retry/down/retry/up; data and old indexes retained', async (db) => {
    await db
      .collection('users')
      .insertOne({ username: 'Original', email: 'original@example.invalid' });
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    const original = await db.collection('users').find({}).toArray();
    await up(db);
    await up(db);
    assert.ok((await indexes(db)).every(Boolean));
    assert.equal(
      await db.collection('index_migration_ownership').countDocuments({ owned: true }),
      7
    );
    await down(db);
    await down(db);
    assert.ok((await indexes(db)).every((i) => !i));
    assert.deepEqual(
      (await db.collection('users').listIndexes().toArray()).map((i) => i.name).sort(),
      ['_id_', 'email_1', 'username_1']
    );
    assert.deepEqual(await db.collection('users').find({}).toArray(), original);
    await up(db);
    assert.ok((await indexes(db)).every(Boolean));
  });
  await scenario('pre-existing indexes survive rollback', async (db) => {
    for (const { collection, key, ...options } of CANDIDATE_INDEXES) {
      await db.collection(collection).createIndex(key, options);
    }
    await up(db);
    assert.equal(
      await db.collection('index_migration_ownership').countDocuments({ owned: false }),
      7
    );
    await down(db);
    assert.ok((await indexes(db)).every(Boolean));
    assert.equal(await db.collection('index_migration_ownership').countDocuments({}), 0);
  });
  for (const field of ['username', 'email']) {
    await scenario(`${field}: case-insensitive duplicate audit before DDL`, async (db) => {
      await db.collection('users').insertMany([
        { username: 'First', email: 'first@example.invalid', [field]: 'Duplicate' },
        { username: 'Second', email: 'second@example.invalid', [field]: 'DUPLICATE' },
      ]);
      await assert.rejects(up(db), /Resolve .* duplicates\/non-string/);
      assert.equal(await db.collection('index_migration_ownership').countDocuments({}), 0);
      assert.equal((await db.collection('users').listIndexes().toArray()).length, 1);
    });
    await scenario(`${field}: concurrent inserts and updates enforce CI uniqueness`, async (db) => {
      await up(db);
      const users = db.collection('users');
      await expectOneDuplicate(
        [
          users.insertOne({ username: 'First', email: 'first@example.invalid', [field]: 'Race' }),
          users.insertOne({ username: 'Second', email: 'second@example.invalid', [field]: 'RACE' }),
        ],
        field
      );
      const inserted = await users.insertMany([
        { username: 'Third', email: 'third@example.invalid' },
        { username: 'Fourth', email: 'fourth@example.invalid' },
      ]);
      await expectOneDuplicate(
        [
          users.updateOne({ _id: inserted.insertedIds[0] }, { $set: { [field]: 'Updated' } }),
          users.updateOne({ _id: inserted.insertedIds[1] }, { $set: { [field]: 'UPDATED' } }),
        ],
        field
      );
      assert.equal(await users.countDocuments({}), 3);
    });
  }
  process.stdout.write(`${JSON.stringify({ passed: true, results }, null, 2)}\n`);
} catch {
  // Driver errors may contain credentials, hosts, or duplicate values. Do not print them.
  process.stderr.write(
    `MongoDB index verification failed after ${results.length} completed scenarios; connection, permissions, assertions or cleanup failed.\n`
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
