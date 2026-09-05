import { describe, expect, it } from 'vitest';
import { up, down } from '../../migrations/20260905093000-core-query-indexes.js';
import { CANDIDATE_INDEXES } from '../../scripts/lib/mongo-explain.mjs';
import { User, Expense, Payment, Checklist, Photo } from '../models';

function database({
  preexisting = false,
  duplicate = false,
  invalid = 0,
  failCreate = false,
} = {}) {
  const indexes = new Map();
  const ledger = new Map();
  const created = [];
  const dropped = [];
  for (const index of CANDIDATE_INDEXES) {
    if (!indexes.has(index.collection))
      indexes.set(index.collection, [{ name: '_id_', key: { _id: 1 } }]);
    if (preexisting) {
      const { collection, ...definition } = index;
      indexes.get(collection).push(definition);
    }
  }
  const db = {
    collection(name) {
      if (name === 'index_migration_ownership')
        return {
          updateOne: async ({ _id }, update) => {
            if (!ledger.has(_id)) ledger.set(_id, update.$setOnInsert);
          },
          findOne: async ({ _id }) => ledger.get(_id),
          deleteOne: async ({ _id }) => ledger.delete(_id),
        };
      return {
        listIndexes: () => ({ toArray: async () => indexes.get(name) ?? [] }),
        countDocuments: async () => invalid,
        aggregate: () => ({ toArray: async () => (duplicate ? [{ count: 2 }] : []) }),
        createIndex: async (key, options) => {
          if (failCreate) {
            failCreate = false;
            throw new Error('build interrupted');
          }
          indexes.get(name).push({ key, ...options });
          created.push(options.name);
        },
        dropIndex: async (indexName) => {
          dropped.push(indexName);
          indexes.set(
            name,
            indexes.get(name).filter((i) => i.name !== indexName)
          );
        },
      };
    },
  };
  return { db, indexes, ledger, created, dropped };
}

describe('core query index migration', () => {
  it('creates once, retries safely and only drops owned indexes', async () => {
    const state = database();
    await up(state.db);
    await up(state.db);
    expect(state.created).toHaveLength(7);
    await down(state.db);
    await down(state.db);
    expect(state.dropped).toHaveLength(7);
    expect([...state.indexes.values()].every((i) => i.length === 1 && i[0].name === '_id_')).toBe(
      true
    );
    expect(state.ledger.size).toBe(0);
  });
  it('leaves pre-existing test/autoIndex indexes intact on rollback', async () => {
    const state = database({ preexisting: true });
    await up(state.db);
    await down(state.db);
    expect(state.created).toHaveLength(0);
    expect(state.dropped).toHaveLength(0);
  });
  it.each([{ duplicate: true }, { invalid: 1 }])(
    'refuses dirty account data before any write (%j)',
    async (options) => {
      const state = database(options);
      await expect(up(state.db)).rejects.toThrow('Resolve username');
      expect(state.created).toHaveLength(0);
      expect(state.ledger.size).toBe(0);
    }
  );
  it('preflights conflicting index definitions before any writes', async () => {
    const state = database({ preexisting: true });
    state.indexes.get('users').find((i) => i.name === 'email_ci_unique').collation = {
      locale: 'en',
      strength: 1,
    };
    await expect(up(state.db)).rejects.toThrow('Incompatible existing index');
    expect(state.ledger.size).toBe(0);
  });
  it('recovers intent after an interrupted create', async () => {
    const state = database({ failCreate: true });
    await expect(up(state.db)).rejects.toThrow('build interrupted');
    await up(state.db);
    await down(state.db);
    expect(state.dropped).toHaveLength(7);
  });
  it('refuses to delete an owned index whose definition changed externally', async () => {
    const state = database();
    await up(state.db);
    state.indexes.get('users').find((i) => i.name === 'email_ci_unique').unique = false;
    await expect(down(state.db)).rejects.toThrow('Incompatible existing index');
    expect(state.dropped).toHaveLength(0);
  });
  it('schemas match all validated candidate names and definitions', () => {
    const models = {
      users: User,
      expenses: Expense,
      payments: Payment,
      checklists: Checklist,
      photos: Photo,
    };
    for (const { collection, key, name, unique, collation } of CANDIDATE_INDEXES) {
      const index = models[collection].schema
        .indexes()
        .find(
          ([k, options]) =>
            JSON.stringify(k) === JSON.stringify(key) &&
            (options.name ?? Object.entries(k).flat().join('_')) === name
        );
      expect(index).toBeDefined();
      expect(Boolean(index[1].unique)).toBe(Boolean(unique));
      expect(index[1].collation).toEqual(collation);
    }
  });
});
