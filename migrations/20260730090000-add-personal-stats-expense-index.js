/**
 * 個人統計明細的日期游標分頁索引。
 *
 * splits.user 是 multikey 欄位；date 與 _id 是 scalar，因此可合法組成複合索引。
 * 同一顆索引可反向掃描支援 dateAsc，無須再建一份升冪索引。
 *
 * @typedef {import('mongodb').Db} Db
 */

const INDEX_NAME = 'splits.user_1_date_-1__id_-1';

/** @param {Db} db */
export const up = async (db) => {
  await db
    .collection('expenses')
    .createIndex({ 'splits.user': 1, date: -1, _id: -1 }, { name: INDEX_NAME });
};

/** @param {Db} db */
export const down = async (db) => {
  try {
    await db.collection('expenses').dropIndex(INDEX_NAME);
  } catch (error) {
    if (error?.codeName !== 'IndexNotFound') throw error;
  }
};
