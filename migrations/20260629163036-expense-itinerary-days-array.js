/**
 * 將 Expense 的單一關聯行程日 `itineraryDay`（ObjectId|null）改為可複選的
 * `itineraryDays`（ObjectId[]）。
 *
 * 背景：支出原本只能關聯一個行程日，跨夜飯店等支出只會壓在某一天，每日花費比較圖
 * 因此失真。改為陣列後可同時關聯多天，聚合時把金額平均分攤（讀取端邏輯，不在此遷移）。
 *
 * 回填（idempotent，只動尚未有 itineraryDays 欄位的文件）：
 *   itineraryDay 有值 → itineraryDays: [itineraryDay]
 *   itineraryDay 為 null/不存在 → itineraryDays: []
 * 兩種情況都 $unset 舊的 itineraryDay 欄位，留下單一真實來源。
 *
 * down 反向：取陣列首元素回填回 itineraryDay（無則 null），$unset itineraryDays。
 *
 * 無索引變更——itineraryDay/itineraryDays 皆未建索引（只在 trip 上有索引）。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  const col = db.collection('expenses');
  // 已遷移的文件已有 itineraryDays 欄位，跳過（冪等）。
  await col.updateMany(
    { itineraryDays: { $exists: false }, itineraryDay: { $type: 'objectId' } },
    [{ $set: { itineraryDays: ['$itineraryDay'] } }, { $unset: 'itineraryDay' }]
  );
  await col.updateMany(
    { itineraryDays: { $exists: false } },
    { $set: { itineraryDays: [] }, $unset: { itineraryDay: '' } }
  );
};

/** @param {Db} db */
export const down = async (db) => {
  const col = db.collection('expenses');
  await col.updateMany({ itineraryDay: { $exists: false }, itineraryDays: { $exists: true } }, [
    { $set: { itineraryDay: { $arrayElemAt: ['$itineraryDays', 0] } } },
    { $unset: 'itineraryDays' },
  ]);
  // 空陣列時 $arrayElemAt 回傳 missing，上一步不會建立 itineraryDay；補成 null。
  await col.updateMany(
    { itineraryDay: { $exists: false } },
    { $set: { itineraryDay: null }, $unset: { itineraryDays: '' } }
  );
};
