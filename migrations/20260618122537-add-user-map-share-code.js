/**
 * 為 User 新增旅行地圖公開分享碼的索引：`users.mapShareCode`（唯一、sparse）。
 *
 * 背景：使用者可 opt-in 產生一組短 hash code 來公開分享自己的旅行地圖（去識別化、唯讀）。
 * 公開 API 以此碼反查使用者（見 /api/public/map/[code]），故需可由 mapShareCode 查詢且唯一。
 *
 * sparse：未分享的使用者沒有 mapShareCode 欄位，sparse 讓他們不佔唯一鍵
 * （否則多個 null 會互相衝突）。不需資料回填——此欄位純 opt-in。
 *
 * 冪等：`createIndex` 在索引已存在且定義相同時為 no-op。索引名稱對齊 Mongoose
 * autoIndex 預設命名（`mapShareCode_1`），避免重複建立。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  await db
    .collection('users')
    .createIndex({ mapShareCode: 1 }, { name: 'mapShareCode_1', unique: true, sparse: true });
};

/** @param {Db} db */
export const down = async (db) => {
  try {
    await db.collection('users').dropIndex('mapShareCode_1');
  } catch (err) {
    if (err?.codeName !== 'IndexNotFound') throw err;
  }
};
