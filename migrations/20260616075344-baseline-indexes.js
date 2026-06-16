/**
 * Baseline：建立目前所有 Mongoose 模型定義的索引。
 *
 * 為什麼需要它？應用程式平時靠 Mongoose `autoIndex`（連線時自動建索引）維持索引，
 * 但那不可重現、也不適合在關閉 autoIndex 的正式環境使用。此遷移把現況索引明文化，
 * 作為「schema 變更可重現」的基準點。`createIndex` 具冪等性——索引已存在且定義相同時為 no-op，
 * 因此在已運行的環境執行 `up` 是安全的。
 *
 * 索引名稱刻意對齊 Mongoose 預設命名（如 `members.user_1`），避免與 autoIndex 建立的索引重複。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  // User：username / email 皆唯一
  await db.collection('users').createIndexes([
    { key: { username: 1 }, name: 'username_1', unique: true },
    { key: { email: 1 }, name: 'email_1', unique: true },
  ]);

  // Trip：hashCode 唯一；members.user 多鍵索引（查「使用者參與哪些旅程」）
  await db.collection('trips').createIndexes([
    { key: { hashCode: 1 }, name: 'hashCode_1', unique: true },
    { key: { 'members.user': 1 }, name: 'members.user_1' },
  ]);

  // Expense：以 trip 過濾
  await db.collection('expenses').createIndexes([{ key: { trip: 1 }, name: 'trip_1' }]);

  // ItineraryDay：(trip, dayNumber) 複合唯一
  await db
    .collection('itinerarydays')
    .createIndexes([{ key: { trip: 1, dayNumber: 1 }, name: 'trip_1_dayNumber_1', unique: true }]);
};

/** @param {Db} db */
export const down = async (db) => {
  // 逐一移除本遷移建立的索引；不存在時忽略（IndexNotFound）。
  const drop = async (collection, indexName) => {
    try {
      await db.collection(collection).dropIndex(indexName);
    } catch (err) {
      if (err?.codeName !== 'IndexNotFound') throw err;
    }
  };

  await drop('users', 'username_1');
  await drop('users', 'email_1');
  await drop('trips', 'hashCode_1');
  await drop('trips', 'members.user_1');
  await drop('expenses', 'trip_1');
  await drop('itinerarydays', 'trip_1_dayNumber_1');
};
