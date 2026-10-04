import { createHash } from 'node:crypto';
import type { mongo } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import {
  readExpenseCreateReceipt,
  readExpenseCreateResult,
  receiptSearch,
  withExpenseCreateRequest,
} from '@/lib/expenseCreateRequest';
import { createExpenseSchema } from '@/lib/validation';
import { findStoredReceipt } from '@/test/receiptStore';
import type { Expense } from '@/types';

const TRIP = '507f1f77bcf86cd799439011';
const ACTOR = '507f191e810c19729de860ea';
const OTHER = '507f191e810c19729de860eb';
const LOWER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const UPPER = LOWER.toUpperCase();
// Two different mixed spellings of the same UUID (the first is the one the reviewer used).
const MIXED = 'F47ac10B-58cc-4372-A567-0E02b2c3D479';
const MIXED_2 = 'f47AC10b-58CC-4372-a567-0e02B2C3d479';
const SPELLINGS = [LOWER, UPPER, MIXED, MIXED_2];

const payload = (key: string, overrides: Record<string, unknown> = {}) => ({
  client_request_id: key,
  payer_id: ACTOR,
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  description: 'Dinner',
  category: 'food',
  date: '2026-09-12',
  splits: [
    { user_id: ACTOR, share_amount: 60 },
    { user_id: OTHER, share_amount: 40 },
  ],
  ...overrides,
});
const parsed = (key: string, overrides?: Record<string, unknown>) =>
  createExpenseSchema.parse(payload(key, overrides));
const request = (key: string, overrides?: Record<string, unknown>) => ({
  tripId: TRIP,
  actorId: ACTOR,
  input: parsed(key, overrides),
});
const accepted = (id: string) => ({ id, description: 'Dinner' }) as Expense;

// Constants computed with the identity of the code before key lookup became case-insensitive:
// `_id` is `trip:actor:key` with the key as sent, the fingerprint is the SHA-256 of the
// schema-parsed input. They must never change: receipts written by earlier versions have them.
const GOLDEN = {
  [LOWER]: {
    id: `${TRIP}:${ACTOR}:${LOWER}`,
    json: `{"client_request_id":"${LOWER}","payer_id":"${ACTOR}","original_amount":100,"currency":"TWD","exchange_rate":1,"description":"Dinner","category":"food","date":"2026-09-12","splits":[{"user_id":"${ACTOR}","share_amount":60},{"user_id":"${OTHER}","share_amount":40}]}`,
    fingerprint: '2e1111b142cb3dea9dce158d7eaf56068fa2b83240d36ad84918b43d09ef7aa3',
  },
  [UPPER]: {
    id: `${TRIP}:${ACTOR}:${UPPER}`,
    json: `{"client_request_id":"${UPPER}","payer_id":"${ACTOR}","original_amount":100,"currency":"TWD","exchange_rate":1,"description":"Dinner","category":"food","date":"2026-09-12","splits":[{"user_id":"${ACTOR}","share_amount":60},{"user_id":"${OTHER}","share_amount":40}]}`,
    fingerprint: '26123c65afc3735e46d5e7c98f0653ed35a80665a65607659c30539329be9303',
  },
};

/** A receipt as an earlier version stored it, built without any of the code under test. */
const earlierReceipt = (key: string, data: Expense, overrides?: Record<string, unknown>) => ({
  _id: `${TRIP}:${ACTOR}:${key}`,
  trip: TRIP,
  fingerprint: createHash('sha256')
    .update(JSON.stringify(parsed(key, overrides)))
    .digest('hex'),
  data,
});

function fakeDb(...existing: { _id: string }[]) {
  const store = new Map<string, { _id: string; fingerprint: string; data: Expense }>(
    existing.map((receipt) => [receipt._id, receipt as never])
  );
  const collection = {
    findOne: vi.fn(
      async (
        filter: Parameters<typeof findStoredReceipt>[1],
        options?: Parameters<typeof findStoredReceipt>[2]
      ) => findStoredReceipt(store, filter, options)
    ),
    insertOne: vi.fn(async (doc: { _id: string; fingerprint: string; data: Expense }) => {
      store.set(doc._id, doc);
    }),
  };
  return { store, collection, db: { collection: () => collection } as unknown as mongo.Db };
}
const session = {} as mongo.ClientSession;

// A UUID made of letters wherever the format allows one: about a billion spellings.
const LETTERS = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
/** Deterministic letter cases of LETTERS. */
function randomSpellings(count: number) {
  let state = 0x2545f491;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  return Array.from({ length: count }, () =>
    [...LETTERS].map((char) => (next() & 0x10000 ? char.toUpperCase() : char)).join('')
  );
}

describe('expense create receipts', () => {
  it.each([LOWER, UPPER])('writes the identity of earlier versions for the key %s', async (key) => {
    const golden = GOLDEN[key as keyof typeof GOLDEN];
    // The schema must keep producing the exact string the fingerprint was computed from.
    expect(JSON.stringify(parsed(key))).toBe(golden.json);
    const { db, store } = fakeDb();
    const created = vi.fn(async () => ({ data: accepted('e1') }));

    expect(await withExpenseCreateRequest(db, session, request(key), created)).toMatchObject({
      replayed: false,
    });

    expect([...store.keys()]).toEqual([golden.id]);
    expect(store.get(golden.id)?.fingerprint).toBe(golden.fingerprint);
  });

  // Receipts of earlier versions keep the case they were sent: every spelling stored must answer
  // every spelling retried, including two different mixed ones.
  it.each(SPELLINGS.flatMap((stored) => SPELLINGS.map((retried) => [stored, retried])))(
    'replays a receipt stored as %s for a retry sent as %s',
    async (stored, retried) => {
      const { db, collection } = fakeDb(earlierReceipt(stored, accepted('e1')));
      const created = vi.fn(async () => ({ data: accepted('e2') }));

      expect(await withExpenseCreateRequest(db, session, request(retried), created)).toEqual({
        replayed: true,
        data: accepted('e1'),
      });
      expect(created).not.toHaveBeenCalled();
      expect(collection.insertOne).not.toHaveBeenCalled();
      expect(await readExpenseCreateResult(db, request(retried))).toEqual(accepted('e1'));
    }
  );

  it('still replays what an interim version stored after lowercasing an uppercase key', async () => {
    // That version lowercased the key in the id and in the hashed input of an uppercase request.
    const lowered = {
      _id: `${TRIP}:${ACTOR}:${LOWER}`,
      trip: TRIP,
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ ...parsed(UPPER), client_request_id: LOWER }))
        .digest('hex'),
      data: accepted('e1'),
    };
    const { db } = fakeDb(lowered);
    expect(await readExpenseCreateResult(db, request(UPPER))).toEqual(accepted('e1'));
    expect(await readExpenseCreateResult(db, request(LOWER))).toEqual(accepted('e1'));
    expect(await readExpenseCreateResult(db, request(MIXED))).toEqual(accepted('e1'));
    await expect(
      readExpenseCreateResult(db, request(UPPER, { description: 'Different' }))
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it.each(SPELLINGS.flatMap((stored) => SPELLINGS.map((retried) => [stored, retried])))(
    'answers CONFLICT for other content when stored as %s and retried as %s',
    async (stored, retried) => {
      const { db } = fakeDb(earlierReceipt(stored, accepted('e1')));
      await expect(
        readExpenseCreateResult(db, request(retried, { description: 'Different' }))
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        readExpenseCreateResult(db, request(retried, { original_amount: 101 }))
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
  );

  it('prefers the receipt stored for exactly the spelling that was sent', async () => {
    const lower = earlierReceipt(LOWER, accepted('lower'));
    const upper = earlierReceipt(UPPER, accepted('upper'));
    for (const order of [
      [lower, upper],
      [upper, lower],
    ]) {
      const { db } = fakeDb(...order);
      expect(await readExpenseCreateResult(db, request(UPPER))).toEqual(accepted('upper'));
      expect(await readExpenseCreateResult(db, request(LOWER))).toEqual(accepted('lower'));
      // No receipt has this exact spelling: the smallest id answers, whatever order they were
      // stored in, so every retry of the key gets the same answer.
      expect(await readExpenseCreateResult(db, request(MIXED))).toEqual(accepted('upper'));
    }
  });

  it.each(SPELLINGS)(
    'answers a retry in any other case once a new receipt was stored for %s',
    async (first) => {
      const { db, store, collection } = fakeDb();
      await withExpenseCreateRequest(db, session, request(first), async () => ({
        data: accepted('e1'),
      }));
      // New receipts keep the spelling that was sent.
      expect([...store.keys()]).toEqual([`${TRIP}:${ACTOR}:${first}`]);

      for (const retried of SPELLINGS) {
        const created = vi.fn(async () => ({ data: accepted('e2') }));
        expect(await withExpenseCreateRequest(db, session, request(retried), created)).toEqual({
          replayed: true,
          data: accepted('e1'),
        });
        expect(created).not.toHaveBeenCalled();
        expect(
          await readExpenseCreateReceipt(db, {
            tripId: TRIP,
            actorId: ACTOR,
            clientRequestId: retried,
          })
        ).toEqual(accepted('e1'));
        await expect(
          readExpenseCreateResult(db, request(retried, { description: 'Different' }))
        ).rejects.toMatchObject({ code: 'CONFLICT' });
      }
      expect(collection.insertOne).toHaveBeenCalledTimes(1);
    }
  );

  it('maps any two letter cases of a key to one receipt', async () => {
    const spellings = randomSpellings(40);
    // The sample must really be many different spellings of the one key.
    expect(new Set(spellings).size).toBe(40);
    expect(new Set(spellings.map((spelling) => spelling.toLowerCase()))).toEqual(
      new Set([LETTERS])
    );

    for (const [index, stored] of spellings.entries()) {
      const retried = spellings[(index + 1) % spellings.length];
      const { db, store } = fakeDb();
      await withExpenseCreateRequest(db, session, request(stored), async () => ({
        data: accepted(`e${index}`),
      }));
      const created = vi.fn(async () => ({ data: accepted('again') }));

      expect(await withExpenseCreateRequest(db, session, request(retried), created)).toEqual({
        replayed: true,
        data: accepted(`e${index}`),
      });
      expect(created).not.toHaveBeenCalled();
      expect(store.size).toBe(1);
      await expect(
        readExpenseCreateResult(db, request(retried, { description: 'Different' }))
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
  });

  it('never matches another trip or another member, whatever the case', async () => {
    const { db } = fakeDb(earlierReceipt(MIXED, accepted('e1')));
    for (const key of SPELLINGS) {
      expect(
        await readExpenseCreateResult(db, { ...request(key), actorId: OTHER })
      ).toBeUndefined();
      expect(
        await readExpenseCreateResult(db, { ...request(key), tripId: '507f1f77bcf86cd799439099' })
      ).toBeUndefined();
    }
  });

  it('does nothing for a request without a key', async () => {
    const { db, collection } = fakeDb();
    const input = createExpenseSchema.parse({ ...payload(LOWER), client_request_id: undefined });
    expect(
      await readExpenseCreateResult(db, { tripId: TRIP, actorId: ACTOR, input })
    ).toBeUndefined();
    await withExpenseCreateRequest(
      db,
      session,
      { tripId: TRIP, actorId: ACTOR, input },
      async () => ({
        data: accepted('e1'),
      })
    );
    expect(collection.findOne).not.toHaveBeenCalled();
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  describe('lookup of another spelling', () => {
    it('is bounded to this actor’s receipts in this trip, so the scan stays small', async () => {
      const { db, collection } = fakeDb(earlierReceipt(MIXED, accepted('e1')));
      await readExpenseCreateResult(db, request(LOWER));

      // The exact spelling first, then the range of `trip:actor:` ids filtered by the key.
      expect(collection.findOne.mock.calls.map(([filter]) => filter)).toEqual([
        { _id: `${TRIP}:${ACTOR}:${LOWER}` },
        {
          _id: {
            $gte: `${TRIP}:${ACTOR}:`,
            $lt: `${TRIP}:${ACTOR};`,
            $regex: `^${TRIP}:${ACTOR}:${LOWER}$`,
            $options: 'i',
          },
        },
      ]);
      expect(receiptSearch({ tripId: TRIP, actorId: ACTOR }, LOWER)).toEqual(
        collection.findOne.mock.calls[1][0]
      );
    });

    it('leaves out receipts of other members and trips even when the key matches', async () => {
      const { db } = fakeDb(
        { ...earlierReceipt(UPPER, accepted('mine')) },
        { ...earlierReceipt(UPPER, accepted('theirs')), _id: `${TRIP}:${OTHER}:${UPPER}` },
        { ...earlierReceipt(UPPER, accepted('elsewhere')), _id: `${OTHER}:${ACTOR}:${UPPER}` }
      );
      expect(await readExpenseCreateResult(db, request(MIXED))).toEqual(accepted('mine'));
    });

    it('needs no search when the exact spelling is stored', async () => {
      const { db, collection } = fakeDb(earlierReceipt(MIXED, accepted('e1')));
      await readExpenseCreateResult(db, request(MIXED));
      expect(collection.findOne).toHaveBeenCalledTimes(1);
    });

    it('reads the key as text, never as a pattern', async () => {
      const { db } = fakeDb(earlierReceipt(LOWER, accepted('e1')));
      for (const clientRequestId of [
        '.*',
        `${LOWER.slice(0, -1)}.`,
        `${LOWER}|x`,
        '(',
        '[a-f]',
        '\\',
        '$^',
      ]) {
        expect(
          await readExpenseCreateReceipt(db, { tripId: TRIP, actorId: ACTOR, clientRequestId })
        ).toBeUndefined();
      }
    });
  });

  describe('result lookup', () => {
    it.each(SPELLINGS.flatMap((stored) => SPELLINGS.map((written) => [stored, written])))(
      'finds a receipt stored as %s with the key written as %s',
      async (stored, written) => {
        const { db } = fakeDb(earlierReceipt(stored, accepted('e1')));
        expect(
          await readExpenseCreateReceipt(db, {
            tripId: TRIP,
            actorId: ACTOR,
            clientRequestId: written,
          })
        ).toEqual(accepted('e1'));
      }
    );

    it('finds nothing for another member, another trip or an unknown key', async () => {
      const { db } = fakeDb(earlierReceipt(UPPER, accepted('e1')));
      const lookup = (overrides: Record<string, string>) =>
        readExpenseCreateReceipt(db, {
          tripId: TRIP,
          actorId: ACTOR,
          clientRequestId: LOWER,
          ...overrides,
        });
      expect(await lookup({ actorId: OTHER })).toBeUndefined();
      expect(await lookup({ tripId: '507f1f77bcf86cd799439099' })).toBeUndefined();
      expect(
        await lookup({ clientRequestId: '00000000-0000-4000-8000-000000000000' })
      ).toBeUndefined();
    });
  });
});
