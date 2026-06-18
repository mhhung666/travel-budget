/**
 * 把舊的單一 `location` 欄位搬進 `destinationLocation`，並移除 `location`。
 *
 * 背景：旅行地點原本是單一 `location`，現拆成出發地 `departureLocation` 與目的地
 * `destinationLocation`。應用程式讀取端原本對舊資料做 `destinationLocation ?? location`
 * 的 fallback；此遷移把舊資料一次性正規化，讓 fallback 得以從程式碼移除。
 *
 * 出發地無法回填（舊資料本就無此資訊），故只處理目的地。
 *
 * 冪等：只挑「有 location 且尚無 destinationLocation」的文件搬移，重跑為 no-op。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  await db.collection('trips').updateMany(
    { location: { $exists: true }, destinationLocation: { $exists: false } },
    [{ $set: { destinationLocation: '$location' } }]
  );
  // 已搬移（或本來就沒目的地用途）的舊欄位一律清掉。
  await db.collection('trips').updateMany({ location: { $exists: true } }, { $unset: { location: '' } });
};

/**
 * 回滾：把 destinationLocation 還原回 location。
 * 注意這無法區分「原本就是 destinationLocation」與「由 location 搬來的」，
 * 故僅在 location 不存在時還原，盡量貼近遷移前狀態。
 *
 * @param {Db} db
 */
export const down = async (db) => {
  await db.collection('trips').updateMany(
    { destinationLocation: { $exists: true }, location: { $exists: false } },
    [{ $set: { location: '$destinationLocation' } }, { $unset: 'destinationLocation' }]
  );
};
