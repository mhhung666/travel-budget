/**
 * 金額精度的單一來源（純函式，無 I/O）。
 *
 * 原本各處各自 `Math.round` 到整數、再把取整後的數字加總，同一筆錢就會在分類、
 * 每日花費、結算摘要之間對不起來（案例見
 * docs/archive/tests/AMOUNT_CONSISTENCY_ACCEPTANCE_2026-09-16.md）。規則：
 *
 *  - 資料層一律保留到「分」（兩位小數），不在中途取整；顯示交給
 *    `formatCurrency`（整數不補 .00，最多兩位小數）。
 *  - 要把一筆金額拆進多個桶（分攤成員、關聯行程日）時走 {@link allocateMoney}，
 *    拆出來的加總「剛好」等於原金額，尾差有人認領而不是消失。
 */

/** 轉成整數分；只吸收乘法造成的機器精度誤差，JS 與 MongoDB 使用相同 double 運算。 */
function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const cents = amount * 100;
  return Math.floor(cents + 0.5 + Math.abs(cents) * Number.EPSILON * 2);
}

/** 四捨五入到分。金額進入任何加總、比較或儲存前都先過這裡。 */
export function roundMoney(amount: number): number {
  return toCents(amount) / 100;
}

/**
 * 依權重把 `total` 拆成 `weights.length` 份，每份都是分的整數倍，且加總等於
 * `roundMoney(total)`。尾差以最大餘數法分給小數部分最大者（同餘數給索引較前者，
 * 結果穩定可測）。權重全為 0 或負時退回均分——金額仍要拆完，不能憑空消失。
 */
export function allocateMoney(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const totalCents = toCents(total);
  const positive = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const totalWeight = positive.reduce((sum, w) => sum + w, 0);
  const effective = totalWeight > 0 ? positive : weights.map(() => 1);
  const effectiveTotal = totalWeight > 0 ? totalWeight : weights.length;

  // 把遠小於一分的運算雜訊收斂，避免 JS 與 MongoDB 加總演算法讓同餘數換人。
  const exact = effective.map(
    (w) => Math.floor(((totalCents * w) / effectiveTotal) * 1e9 + 0.5) / 1e9
  );
  const cents = exact.map((value) => Math.floor(value));
  let remainder = totalCents - cents.reduce((sum, c) => sum + c, 0);
  const order = exact
    .map((value, index) => ({ index, frac: Math.round((value - Math.floor(value)) * 1e9) / 1e9 }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; remainder > 0 && order.length > 0; i += 1, remainder -= 1) {
    cents[order[i % order.length].index] += 1;
  }
  return cents.map((c) => c / 100);
}

/**
 * 半分錢：判斷「這個金額還有沒有東西要處理」的門檻。
 *
 * 所有金額都已收斂到分，所以差額不是 0 就是至少 1 分。門檻必須落在兩者之間——
 * 用 0.01 會把「剛好應收一分」判成已結清，結算頁就會顯示欠款卻排不出轉帳方案。
 */
export const MONEY_EPSILON = 0.005;

/**
 * 分攤是否視為平衡的容差，前後端共用（前端以原幣、後端以 TWD 判定）。
 *
 * 固定一分，且比較前先 {@link roundMoney}，因此只吸收小數位與浮點誤差。
 * 不設「總額的百分之幾」這種相對容差：那會讓大額支出少分攤好幾塊錢也算平衡
 * （1,000 元只分攤 999.95 元曾因此寫入），結算後留下無人可還的餘額。
 * 容差內的尾差仍必須實際分配出去，見 {@link allocateMoney}。
 */
export const SPLIT_TOLERANCE = 0.01;

/** MongoDB 與 toCents 使用相同的 double 運算次序及誤差範圍。 */
export function roundMoneyExpr(valueExpr: unknown): Record<string, unknown> {
  return {
    $let: {
      vars: { cents: { $multiply: [{ $ifNull: [valueExpr, 0] }, 100] } },
      in: {
        $divide: [
          {
            $floor: {
              $add: [
                { $add: ['$$cents', 0.5] },
                { $multiply: [{ $multiply: [{ $abs: '$$cents' }, Number.EPSILON] }, 2] },
              ],
            },
          },
          100,
        ],
      },
    },
  };
}

/** 保留已平衡的分攤；舊資料取到分後若不平衡，依原始權重分配尾差。 */
export function normalizeShares(amount: number, shares: number[]): number[] {
  amount = roundMoney(amount);
  const rounded = shares.map(roundMoney);
  // 只修正分精度的尾差；缺少參與人或大額不平衡不能被讀取流程擅自重分。
  if (
    Math.abs(roundMoney(shares.reduce((sum, share) => sum + share, 0) - amount)) >
    roundMoney(shares.length * 0.005 + 0.01)
  )
    return rounded;
  if (rounded.reduce((sum, share) => sum + toCents(share), 0) === toCents(amount)) return rounded;
  return allocateMoney(amount, shares);
}

/** 舊分攤的聚合版本。排序以原始索引破同分，與 allocateMoney 的最大餘數法一致。 */
export function normalizedSplitsExpr(): Record<string, unknown> {
  return {
    $let: {
      vars: {
        splits: { $ifNull: ['$splits', []] },
        total: { $round: [{ $multiply: [roundMoneyExpr('$amount'), 100] }, 0] },
      },
      in: {
        $let: {
          vars: {
            rounded: {
              $map: { input: '$$splits', as: 's', in: roundMoneyExpr('$$s.shareAmount') },
            },
            weight: {
              $sum: {
                $map: {
                  input: '$$splits',
                  as: 's',
                  in: { $max: [0, { $ifNull: ['$$s.shareAmount', 0] }] },
                },
              },
            },
          },
          in: {
            $let: {
              vars: {
                parts: {
                  $map: {
                    input: { $range: [0, { $size: '$$splits' }] },
                    as: 'i',
                    in: {
                      $let: {
                        vars: { s: { $arrayElemAt: ['$$splits', '$$i'] } },
                        in: {
                          $let: {
                            vars: {
                              rawExact: {
                                $divide: [
                                  {
                                    $multiply: [
                                      '$$total',
                                      {
                                        $cond: [
                                          { $gt: ['$$weight', 0] },
                                          { $max: [0, { $ifNull: ['$$s.shareAmount', 0] }] },
                                          1,
                                        ],
                                      },
                                    ],
                                  },
                                  {
                                    $cond: [
                                      { $gt: ['$$weight', 0] },
                                      '$$weight',
                                      { $size: '$$splits' },
                                    ],
                                  },
                                ],
                              },
                            },
                            in: {
                              $let: {
                                vars: {
                                  exact: {
                                    $divide: [
                                      {
                                        $floor: { $add: [{ $multiply: ['$$rawExact', 1e9] }, 0.5] },
                                      },
                                      1e9,
                                    ],
                                  },
                                },
                                in: {
                                  i: '$$i',
                                  base: { $floor: '$$exact' },
                                  frac: {
                                    $round: [{ $subtract: ['$$exact', { $floor: '$$exact' }] }, 9],
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              in: {
                $let: {
                  vars: {
                    order: {
                      $map: {
                        input: { $sortArray: { input: '$$parts', sortBy: { frac: -1, i: 1 } } },
                        as: 'p',
                        in: '$$p.i',
                      },
                    },
                    remainder: { $subtract: ['$$total', { $sum: '$$parts.base' }] },
                    balanced: {
                      $or: [
                        {
                          $gt: [
                            {
                              $abs: roundMoneyExpr({
                                $subtract: [
                                  { $sum: '$$splits.shareAmount' },
                                  { $divide: ['$$total', 100] },
                                ],
                              }),
                            },
                            roundMoneyExpr({
                              $add: [{ $multiply: [{ $size: '$$splits' }, 0.005] }, 0.01],
                            }),
                          ],
                        },
                        {
                          $eq: [
                            {
                              $sum: {
                                $map: {
                                  input: '$$rounded',
                                  as: 'r',
                                  in: { $round: [{ $multiply: ['$$r', 100] }, 0] },
                                },
                              },
                            },
                            '$$total',
                          ],
                        },
                      ],
                    },
                  },
                  in: {
                    $map: {
                      input: '$$parts',
                      as: 'p',
                      in: {
                        $mergeObjects: [
                          { $arrayElemAt: ['$$splits', '$$p.i'] },
                          {
                            shareAmount: {
                              $cond: [
                                '$$balanced',
                                { $arrayElemAt: ['$$rounded', '$$p.i'] },
                                {
                                  $divide: [
                                    {
                                      $add: [
                                        '$$p.base',
                                        {
                                          $cond: [
                                            {
                                              $lt: [
                                                { $indexOfArray: ['$$order', '$$p.i'] },
                                                '$$remainder',
                                              ],
                                            },
                                            1,
                                            0,
                                          ],
                                        },
                                      ],
                                    },
                                    100,
                                  ],
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
