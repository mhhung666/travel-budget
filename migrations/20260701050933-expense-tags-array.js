/**
 * 為 Expense 新增自訂標籤欄位 `tags: string[]`（自由文字、可複選，與固定 7 類的
 * `category` 正交，見 ROADMAP.md #18）。
 *
 * 回填（idempotent，只動尚未有 tags 欄位的文件）：無 tags 欄位 → tags: []。
 * down 反向：$unset tags。
 *
 * 無索引變更——tags 只在前端做已載入清單的過濾，未建索引。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  const col = db.collection('expenses');
  await col.updateMany({ tags: { $exists: false } }, { $set: { tags: [] } });
};

/** @param {Db} db */
export const down = async (db) => {
  const col = db.collection('expenses');
  await col.updateMany({ tags: { $exists: true } }, { $unset: { tags: '' } });
};
