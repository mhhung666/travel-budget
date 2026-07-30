/**
 * 將舊版全團預算保存為 legacyBudget。
 *
 * 不將團體預算複製或平均分配給成員，因為兩者都會改變原始語意。新版由每位正式成員
 * 自行設定 members[].budget；legacyBudget 只在設定畫面作為參考。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  await db.collection('trips').updateMany({ budget: { $exists: true } }, [
    {
      $set: {
        legacyBudget: '$budget',
      },
    },
    {
      $unset: 'budget',
    },
  ]);
};

/** @param {Db} db */
export const down = async (db) => {
  await db.collection('trips').updateMany({ legacyBudget: { $exists: true } }, [
    {
      $set: {
        budget: '$legacyBudget',
      },
    },
    {
      $unset: 'legacyBudget',
    },
  ]);
};
