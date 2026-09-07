import type { mongo } from 'mongoose';
import { dbConnect } from './mongodb';
import { getEnv, getWebPushConfig } from './env';
import { createExpenseDeliveryWorker } from './expenseDeliveryWorker';
import { createExpenseEventStore } from './expenseEventStore';
import { EXPENSE_DELIVERY_INDEX } from './expenseDeliveryQueue';
import { logger } from './logger';

const ready = new WeakMap<mongo.Db, Promise<void>>();

/** Validate before accepting new outbox writes. No automatic migration or fallback after insertion. */
export async function assertExpenseDeliveryReady(db: mongo.Db) {
  let check = ready.get(db);
  if (!check) {
    check = (async () => {
      const hello = await db.admin().command({ hello: 1 }, { timeoutMS: 2_000 });
      if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Transactions unavailable');
      await createExpenseEventStore(db);
      for (const definition of [
        { collection: 'expenses', ...EXPENSE_DELIVERY_INDEX },
        {
          collection: 'pushsubscriptions',
          name: 'expense_push_candidates',
          key: { user: 1, _id: 1 },
        },
      ]) {
        const indexes = await db
          .collection(definition.collection)
          .listIndexes({ timeoutMS: 2_000 })
          .toArray();
        const index = indexes.find((i) => i.name === definition.name);
        if (
          !index ||
          JSON.stringify(index.key) !== JSON.stringify(definition.key) ||
          index.unique ||
          index.sparse ||
          index.hidden ||
          index.partialFilterExpression ||
          index.expireAfterSeconds !== undefined ||
          (index.collation && index.collation.locale !== 'simple')
        )
          throw new Error('Expense delivery query index unavailable');
      }
    })();
    ready.set(db, check);
    check.catch(() => ready.delete(db));
  }
  await check;
}

export function expenseBackgroundEnabled() {
  return getEnv().EXPENSE_BACKGROUND_DELIVERY === 'on';
}

export async function prepareExpenseBackgroundWrite() {
  if (!expenseBackgroundEnabled()) return false;
  if (!getEnv().CRON_SECRET) throw new Error('Expense delivery recovery authentication missing');
  const connection = await dbConnect();
  const db = connection.connection.db;
  if (!db) throw new Error('Database unavailable');
  await assertExpenseDeliveryReady(db);
  return true;
}

/** Can also drain existing jobs after the new-write flag is turned off. */
export async function runExpenseBackgroundDelivery() {
  const connection = await dbConnect();
  const db = connection.connection.db;
  if (!db) throw new Error('Database unavailable');
  await assertExpenseDeliveryReady(db);
  const vapidDetails = getWebPushConfig();
  const worker = await createExpenseDeliveryWorker(db, {
    config: vapidDetails ? { vapidDetails, appUrl: getEnv().APP_URL ?? null } : null,
  });
  const result = await worker();
  logger.info('Expense delivery batch', { status: result.status });
  return result;
}
