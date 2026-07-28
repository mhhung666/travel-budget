/**
 * 相片自動關聯行程日的來源欄位回填。
 *
 * 新版相片會另外存：
 * - takenLocalDate / takenDateSource：拍攝地的日曆日期及來源
 * - itineraryDaySource：auto 或 manual
 *
 * 舊相片沒有可靠的原始當地日期，不能從 UTC takenAt 猜回去；因此不回填 takenLocalDate。
 * 舊資料中已有人選過 itineraryDay 的關聯視為 manual，避免之後旅程日期變更時被覆蓋。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  const col = db.collection('photos');
  await col.updateMany(
    {
      itineraryDay: { $type: 'objectId' },
      itineraryDaySource: { $exists: false },
    },
    { $set: { itineraryDaySource: 'manual' } }
  );
};

/** @param {Db} db */
export const down = async (db) => {
  const col = db.collection('photos');
  await col.updateMany(
    {},
    {
      $unset: {
        takenLocalDate: '',
        takenDateSource: '',
        itineraryDaySource: '',
      },
    }
  );
};
