// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withLedgerV2, authorizeLedger } from '@/lib/ledger';
import { updateExpenseForActor, webExpenseRevision } from '@/lib/expenseMaintenance';
import { readWebPaymentContext } from '@/lib/paymentWrite';
import { Expense } from '@/models';
import { MUTATION_REQUESTS, readTripMutation } from '@/lib/tripEntry';

const secret = 'web-ledger-owned-regression-secret-32-characters';
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'web-ledger-owned-regression-secret-32-characters' }),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => undefined }));
vi.mock('@/lib/blobCleanup', () => ({ cleanupRetiredBlobs: async () => undefined }));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
const fields =
  'payer amount originalAmount currency exchangeRate description category date splits attachments tags itineraryDays';
describe.skipIf(!uri || !allowed)(
  'Web ledger update receipts and read-only settlement snapshots',
  () => {
    let db: mongo.Db,
      owned = false;
    const actor = new mongo.ObjectId(),
      peer = new mongo.ObjectId(),
      trip = new mongo.ObjectId(),
      expense = new mongo.ObjectId();
    const members = [actor, peer].map((user) => ({
      user,
      role: 'member',
      joinedAt: new Date('2026-01-01'),
    }));
    beforeAll(async () => {
      await mongoose.connect(uri!, {
        dbName: `tb_web_ledger_${randomUUID().replaceAll('-', '')}`,
        autoIndex: false,
        // The ownership check must run before Mongoose creates any model collections.
        autoCreate: false,
      });
      db = mongoose.connection.db!;
      expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
      expect(await db.listCollections().toArray()).toHaveLength(0);
      await db.createCollection('verification_owner');
      owned = true;
      for (const name of [
        'trips',
        'users',
        'expenses',
        'payments',
        MUTATION_REQUESTS,
        'activitylogs',
      ])
        await db.createCollection(name);
    });
    afterAll(async () => {
      try {
        if (owned) await db.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });
    beforeEach(async () => {
      for (const name of [
        'trips',
        'users',
        'expenses',
        'payments',
        MUTATION_REQUESTS,
        'activitylogs',
      ])
        await db.collection(name).deleteMany({});
      await db.collection('users').insertMany(
        [actor, peer].map((_id, i) => ({
          _id,
          displayName: ['Alice', 'Bob'][i],
          username: ['alice', 'bob'][i],
        }))
      );
      await db
        .collection('trips')
        .insertOne({ _id: trip, name: 'USD', hashCode: 'usdtest1', baseCurrency: 'USD', members });
      await Expense.create({
        _id: expense,
        trip,
        baseCurrency: 'USD',
        payer: actor,
        amount: 10,
        originalAmount: 10,
        currency: 'USD',
        exchangeRate: 1,
        description: 'Dinner',
        category: 'food',
        date: new Date('2026-10-08'),
        splits: [
          { user: actor, shareAmount: 5 },
          { user: peer, shareAmount: 5 },
        ],
      });
    });
    const revision = async () => {
      authorizeLedger({ baseCurrency: 'USD' });
      return webExpenseRevision(
        secret,
        trip.toString(),
        (await Expense.findById(expense).select(fields).lean())!,
        members
      );
    };
    const write = (body: Parameters<typeof updateExpenseForActor>[3]) =>
      updateExpenseForActor(actor.toString(), trip.toString(), expense.toString(), body);
    it('records RESOURCE_GONE when another writer deletes the expense before saving', async () =>
      withLedgerV2(async () => {
        const body = {
          client_request_id: randomUUID(),
          base_currency: 'USD',
          expected_revision: await revision(),
          description: 'Edited',
        };
        await Expense.deleteOne({ _id: expense });
        expect(await write(body)).toMatchObject({ success: false, code: 'RESOURCE_GONE' });
        expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
          status: 'rejected',
          code: 'RESOURCE_GONE',
          operation: 'expense.update',
        });
        expect(await write(body)).toMatchObject({ success: false, code: 'RESOURCE_GONE' });
        expect(await db.collection(MUTATION_REQUESTS).countDocuments({})).toBe(1);
      }));
    it.each([false, true])(
      'returns the stored committed update after deletion (attachments supplied=%s)',
      async (withAttachments) =>
        withLedgerV2(async () => {
          const body = {
            client_request_id: randomUUID(),
            base_currency: 'USD',
            expected_revision: await revision(),
            description: 'Edited',
            ...(withAttachments ? { attachments: [] } : {}),
          };
          const first = await write(body);
          expect(first.success).toBe(true);
          await Expense.deleteOne({ _id: expense });
          expect(await write(body)).toEqual(first);
          expect(await db.collection(MUTATION_REQUESTS).countDocuments({})).toBe(1);
          expect(await db.collection('activitylogs').countDocuments({})).toBe(1);
        })
    );
    it('uses the persisted BSON revision for consecutive edits after changing payer and splits', async () =>
      withLedgerV2(async () => {
        const first = await write({
          client_request_id: randomUUID(),
          base_currency: 'USD',
          expected_revision: await revision(),
          payer_id: peer.toString(),
          splits: [
            { user_id: actor.toString(), share_amount: 3 },
            { user_id: peer.toString(), share_amount: 7 },
          ],
        });
        expect(first.success).toBe(true);
        if (!first.success) throw new Error(first.error);
        expect(first.data.revision).toBe(await revision());
        expect(
          await write({
            client_request_id: randomUUID(),
            base_currency: 'USD',
            expected_revision: first.data.revision,
            description: 'Next edit',
          })
        ).toMatchObject({ success: true });
        expect(await db.collection(MUTATION_REQUESTS).countDocuments({})).toBe(2);
      }));
    it('does not increment the delivery fence while reading settlement or its revisions', async () => {
      await db.collection('trips').updateOne({ _id: trip }, { $set: { expenseDeliveryFence: 7 } });
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          withLedgerV2(() => readWebPaymentContext(db, actor.toString(), trip.toString(), secret))
        )
      );
      expect(new Set(results.map((r) => r.settlementRevision)).size).toBe(1);
      expect((await db.collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence).toBe(7);
      await db
        .collection('trips')
        .updateOne({ _id: trip }, { $pull: { members: { user: actor } } } as never);
      await expect(
        withLedgerV2(() => readWebPaymentContext(db, actor.toString(), trip.toString(), secret))
      ).rejects.toThrow('FORBIDDEN');
    });
  }
);
