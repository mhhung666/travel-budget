import { randomUUID } from 'node:crypto';
import type { mongo } from 'mongoose';

/** 尚未接入 Expense schema/action；啟用時必須與 Expense 同一次 insert 保存。 */
export interface ExpenseDeliveryState {
  status: 'pending' | 'leased' | 'done' | 'dead';
  attempts: number;
  availableAt: Date;
  token: string | null;
  updatedAt?: Date;
  recordFence?: number;
  recordsPersistedAt?: Date;
  recordRecipientIds?: string[];
  lastError?: 'delivery_failed' | 'worker_error' | 'lease_expired';
}

export interface ExpenseDeliveryRecord {
  _id: mongo.ObjectId;
  expenseDelivery?: ExpenseDeliveryState;
}

export const EXPENSE_DELIVERY_MAX_ATTEMPTS = 5;
export const EXPENSE_DELIVERY_LEASE_MS = 60_000;
export const EXPENSE_DELIVERY_INDEX = {
  key: { 'expenseDelivery.status': 1, 'expenseDelivery.availableAt': 1 } as const,
  name: 'expense_delivery_ready',
};

/** 無獨立 enqueue 寫入，避免支出已存但工作未存的雙寫窗口。舊支出不補建工作。 */
export function initialExpenseDeliveryState(): ExpenseDeliveryState {
  return { status: 'pending', attempts: 0, availableAt: new Date(0), token: null };
}

/**
 * 原生 driver 操作內嵌工作欄位；不連線、不建索引、不自動啟動 worker。
 * 呼叫端必須提供 expenses collection，所有到期判定使用 MongoDB $$NOW。
 * lease 只保護 DB 狀態，不能阻止已失去 lease 的程序完成外部 HTTP 請求。
 */
export function createExpenseDeliveryQueue(collection: mongo.Collection<ExpenseDeliveryRecord>) {
  const activeLease = (_id: mongo.ObjectId, token: string) => ({
    _id,
    'expenseDelivery.status': 'leased' as const,
    'expenseDelivery.token': token,
    $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
  });

  return {
    /** 每次只認領一筆；重領到期工作也算一次嘗試。 */
    async claim() {
      return collection.findOneAndUpdate(
        {
          'expenseDelivery.status': { $in: ['pending', 'leased'] },
          'expenseDelivery.attempts': { $lt: EXPENSE_DELIVERY_MAX_ATTEMPTS },
          $expr: { $lte: ['$expenseDelivery.availableAt', '$$NOW'] },
        },
        [
          {
            $set: {
              'expenseDelivery.status': 'leased',
              'expenseDelivery.token': randomUUID(),
              'expenseDelivery.attempts': { $add: ['$expenseDelivery.attempts', 1] },
              'expenseDelivery.availableAt': { $add: ['$$NOW', EXPENSE_DELIVERY_LEASE_MS] },
              'expenseDelivery.updatedAt': '$$NOW',
            },
          },
        ],
        {
          returnDocument: 'after',
          includeResultMetadata: false,
          sort: { 'expenseDelivery.availableAt': 1, _id: 1 },
          projection: { _id: 1, expenseDelivery: 1 },
        }
      );
    },

    async renew(_id: mongo.ObjectId, token: string): Promise<boolean> {
      const result = await collection.updateOne(activeLease(_id, token), [
        {
          $set: {
            'expenseDelivery.availableAt': { $add: ['$$NOW', EXPENSE_DELIVERY_LEASE_MS] },
            'expenseDelivery.updatedAt': '$$NOW',
          },
        },
      ]);
      return result.matchedCount === 1;
    },

    async complete(_id: mongo.ObjectId, token: string): Promise<boolean> {
      const result = await collection.updateOne(activeLease(_id, token), [
        {
          $set: {
            'expenseDelivery.status': 'done',
            'expenseDelivery.token': null,
            'expenseDelivery.updatedAt': '$$NOW',
            'expenseDelivery.lastError': '$$REMOVE',
          },
        },
      ]);
      return result.matchedCount === 1;
    },

    /** 保存固定錯誤分類，不保存 provider 原始錯誤／endpoint／金鑰。 */
    async fail(
      _id: mongo.ObjectId,
      token: string,
      code: 'delivery_failed' | 'worker_error'
    ): Promise<boolean> {
      if (code !== 'delivery_failed' && code !== 'worker_error')
        throw new Error('Invalid delivery failure code');
      const result = await collection.updateOne(activeLease(_id, token), [
        {
          $set: {
            'expenseDelivery.status': {
              $cond: [
                { $gte: ['$expenseDelivery.attempts', EXPENSE_DELIVERY_MAX_ATTEMPTS] },
                'dead',
                'pending',
              ],
            },
            // 30s, 60s, 120s, 240s；第五次失敗封存，不再重試。
            'expenseDelivery.availableAt': {
              $add: [
                '$$NOW',
                {
                  $multiply: [
                    30_000,
                    { $pow: [2, { $subtract: ['$expenseDelivery.attempts', 1] }] },
                  ],
                },
              ],
            },
            'expenseDelivery.token': null,
            'expenseDelivery.updatedAt': '$$NOW',
            'expenseDelivery.lastError': code,
          },
        },
      ]);
      return result.matchedCount === 1;
    },

    /** 最後一次嘗試中斷時，也能封存；一次最多處理一筆，worker 自行控制批次上限。 */
    async reapExpired() {
      return collection.findOneAndUpdate(
        {
          'expenseDelivery.status': 'leased',
          'expenseDelivery.attempts': { $gte: EXPENSE_DELIVERY_MAX_ATTEMPTS },
          $expr: { $lte: ['$expenseDelivery.availableAt', '$$NOW'] },
        },
        [
          {
            $set: {
              'expenseDelivery.status': 'dead',
              'expenseDelivery.token': null,
              'expenseDelivery.updatedAt': '$$NOW',
              'expenseDelivery.lastError': 'lease_expired',
            },
          },
        ],
        {
          returnDocument: 'after',
          includeResultMetadata: false,
          sort: { 'expenseDelivery.availableAt': 1, _id: 1 },
          projection: { _id: 1, expenseDelivery: 1 },
        }
      );
    },
  };
}
