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

/** 轉成整數分；先 toPrecision 消掉 1.005 這類二進位表示誤差。 */
function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(Number((amount * 100).toPrecision(12)));
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

  const exact = effective.map((w) => (totalCents * w) / effectiveTotal);
  const cents = exact.map((value) => Math.floor(value));
  let remainder = totalCents - cents.reduce((sum, c) => sum + c, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
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

/**
 * `roundMoney` 的 MongoDB 聚合版本：把欄位收斂到分，和 JS 端逐分取整完全一致。
 *
 * 不能用 `$round: [expr, 2]`——MongoDB 的 $round 是銀行家捨入（四捨六入五成雙），
 * 30.125 會變成 30.12，而 JS 的 `roundMoney` 是四捨五入得到 30.13：同一筆舊資料
 * 在預算列／今日花費（走聚合）與結算／統計（走 JS）就差一分。
 *
 * 先 `$toDecimal` 再運算：MongoDB 轉 Decimal128 時取 15 位有效數字，等同 JS 端
 * `toPrecision` 消掉 1.005 這類二進位表示誤差的作用；`$floor(x * 100 + 0.5)` 則是
 * `Math.round` 的定義（含負數一律朝 +∞ 進位），兩邊才會逐筆逐分吻合。
 */
export function roundMoneyExpr(valueExpr: unknown): Record<string, unknown> {
  return {
    $toDouble: {
      $divide: [
        {
          $floor: {
            $add: [{ $multiply: [{ $toDecimal: { $ifNull: [valueExpr, 0] } }, 100] }, 0.5],
          },
        },
        100,
      ],
    },
  };
}
