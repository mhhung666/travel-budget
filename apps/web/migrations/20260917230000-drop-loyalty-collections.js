/**
 * 移除已下線的會籍功能（/memberships）資料：drop loyaltyaccounts 與 loyaltyentries。
 *
 * 程式碼已於 v4.10.0 移除，兩個 collection 不再有任何讀寫；此遷移須在該版本部署完成後才跑。
 * 資料不可逆：執行前先以 mongoexport 備份兩個 collection。
 *
 * - up 冪等：collection 不存在就略過。
 * - down 不還原資料（drop 無法回復）；需要時以備份 mongoimport 手動匯回。
 *
 * @typedef {import('mongodb').Db} Db
 */

export const COLLECTIONS = ['loyaltyaccounts', 'loyaltyentries'];

/** @param {Db} db */
export async function up(db) {
  for (const name of COLLECTIONS) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
    if (exists) await db.collection(name).drop();
  }
}

export async function down() {
  // Irreversible: dropped loyalty data can only be restored from the pre-migration mongoexport backup.
}
