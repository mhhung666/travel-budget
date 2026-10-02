import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { up } from '../../migrations/20260905093000-core-query-indexes.js';

export const CORE_MIGRATION = '20260905093000-core-query-indexes.js';
const PREFIX = '20260905093000-core-query-indexes:';

// Adopt only existing indexes. The migration receives no DDL or business-write methods.
// This lock serializes this helper only; migrate-mongo lockTtl=0 does not honor it.
export async function adoptCoreIndexes(db, { apply = false } = {}) {
  const records = new Map();
  const restricted = {
    collection(name) {
      const collection = db.collection(name);
      return {
        listIndexes: () => collection.listIndexes(),
        countDocuments: (...args) => collection.countDocuments(...args),
        aggregate: (...args) => collection.aggregate(...args),
        async updateOne(filter, update) {
          assert.equal(name, 'index_migration_ownership');
          assert.ok(filter._id.startsWith(PREFIX));
          assert.equal(update.$setOnInsert.owned, false, 'Missing index: adoption refuses DDL');
          const previous = await collection.findOne(filter);
          assert.ok(!previous || previous.owned === false, 'Conflicting ownership');
          records.set(filter._id, { filter, update });
        },
        createIndex() {
          throw new Error('Adoption refuses DDL');
        },
      };
    },
  };
  const token = randomUUID();
  const lock = db.collection('changelog_lock');
  let locked = false;
  try {
    if (apply) {
      assert.equal(await lock.countDocuments({}), 0, 'Existing migration lock');
      await lock.insertOne({ _id: 'core-index-adoption', token, createdAt: new Date() });
      locked = true;
    }
    await up(restricted);
    assert.equal(records.size, 7);
    const history = db.collection('changelog');
    const entries = await history.find({ fileName: CORE_MIGRATION }).toArray();
    assert.ok(entries.length <= 1, 'Duplicate migration records');
    if (apply) {
      for (const { filter, update } of records.values()) {
        await db
          .collection('index_migration_ownership')
          .updateOne(filter, update, { upsert: true });
      }
      if (!entries.length) {
        const appliedAt = new Date();
        await history.insertOne({
          fileName: CORE_MIGRATION,
          appliedAt,
          migrationBlock: appliedAt.getTime(),
        });
      }
    }
    const recorded = await history.findOne({ fileName: CORE_MIGRATION });
    return {
      migration: CORE_MIGRATION,
      compatibleIndexes: records.size,
      applied: apply,
      recorded: Boolean(recorded),
      appliedAt: recorded?.appliedAt ?? null,
    };
  } finally {
    if (locked) {
      const result = await lock.deleteOne({ _id: 'core-index-adoption', token });
      assert.equal(result.deletedCount, 1, 'Lock ownership lost');
    }
  }
}
