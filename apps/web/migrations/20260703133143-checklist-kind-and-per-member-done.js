/**
 * 清單重新設計（REDESIGN 順位 6）：為 Checklist 加 `kind` 類型，並把每個項目的單一
 * `done: Boolean` 改為 per-member 的 `doneBy: ObjectId[]`（勾選者清單）。
 *
 * - 類型回填：無 `kind` 欄位 → `kind: 'todo'`（既有清單皆視為共享待辦）。
 * - 勾選回填（idempotent，用 aggregation pipeline 逐項 $map）：
 *     已有 doneBy 陣列 → 原樣保留；
 *     done === true    → doneBy: [createdBy]（用建立者代表「有人勾了」的共享語意）；
 *     done !== true    → doneBy: []。
 *   只在「還有項目帶著舊 done 欄位」的文件上跑，跑完 $unset 掉 items.done，故重跑無副作用。
 *
 * down 反向：doneBy 非空 → done: true、空 → false；$unset doneBy 與 kind。
 *
 * 無索引變更——kind / doneBy 皆未建索引（清單以 trip 查詢後在記憶體處理）。
 *
 * @typedef {import('mongodb').Db} Db
 */

/** @param {Db} db */
export const up = async (db) => {
  const col = db.collection('checklists');

  // 1) 類型回填（既有清單 = 共享待辦）。
  await col.updateMany({ kind: { $exists: false } }, { $set: { kind: 'todo' } });

  // 2) 逐項把 done → doneBy（只碰仍帶舊 done 欄位的文件；已遷移者不再匹配）。
  await col.updateMany({ 'items.done': { $exists: true } }, [
    {
      $set: {
        items: {
          $map: {
            input: '$items',
            as: 'it',
            in: {
              $mergeObjects: [
                '$$it',
                {
                  doneBy: {
                    $cond: [
                      { $isArray: '$$it.doneBy' },
                      '$$it.doneBy',
                      { $cond: [{ $eq: ['$$it.done', true] }, ['$createdBy'], []] },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
  ]);

  // 3) 移除各項目殘留的舊 done 欄位。
  await col.updateMany({ 'items.done': { $exists: true } }, { $unset: { 'items.$[].done': '' } });
};

/** @param {Db} db */
export const down = async (db) => {
  const col = db.collection('checklists');

  // 1) doneBy → done（非空即完成）。
  await col.updateMany({ 'items.doneBy': { $exists: true } }, [
    {
      $set: {
        items: {
          $map: {
            input: '$items',
            as: 'it',
            in: {
              $mergeObjects: [
                '$$it',
                { done: { $gt: [{ $size: { $ifNull: ['$$it.doneBy', []] } }, 0] } },
              ],
            },
          },
        },
      },
    },
  ]);

  // 2) 移除 doneBy 與 kind。
  await col.updateMany(
    { 'items.doneBy': { $exists: true } },
    { $unset: { 'items.$[].doneBy': '' } }
  );
  await col.updateMany({ kind: { $exists: true } }, { $unset: { kind: '' } });
};
