/**
 * 分帳計算（純函式，無 I/O，可單元測試 — 比照 lib/settlement.ts / lib/budget.ts）。
 *
 * 四種分帳方式，輸入皆以「原幣」金額為基準，最後換算成 TWD 儲存於 Expense.splits[].shareAmount：
 *  - equal   均分：選取的成員平均分攤。
 *  - amount  指定金額：每人填原幣金額；留空者均分剩餘（沿用既有的便利行為）。
 *  - percent 百分比：每人填百分比；留空者均分剩餘百分比；share = 總額 × pct / 100。
 *  - shares  份數：每人填權重（預設 1）；share = 總額 × 權重 / 總權重。
 *
 * 平衡判定一律在原幣進行（避免匯率放大誤差）。amount/percent 因「留空均分剩餘」，
 * 只有在手動值「超額」時才會不平衡；equal/shares 永遠平衡。
 */

export type SplitMode = 'equal' | 'amount' | 'percent' | 'shares';

export interface SplitMemberInput {
  id: string;
  selected: boolean;
  /** 輸入框原始字串；含義依模式而定（金額／百分比／份數）。equal 模式忽略。 */
  value: string;
}

export interface SplitComputation {
  /** 每位成員分攤（原幣） */
  original: Record<string, number>;
  /** 每位成員分攤（TWD = 原幣 × 匯率） */
  twd: Record<string, number>;
  /** 已分配原幣總額（選取成員加總） */
  allocatedOriginal: number;
  /** 已分配 TWD 總額 */
  allocatedTWD: number;
  /** 是否與總額平衡（含容差）；未選任何人視為不平衡 */
  balanced: boolean;
  /** 不平衡方向，供提示文案使用 */
  imbalance: 'over' | 'under' | null;
}

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function computeSplits(
  mode: SplitMode,
  members: SplitMemberInput[],
  originalAmount: number,
  exchangeRate: number
): SplitComputation {
  const selected = members.filter((m) => m.selected);
  const original: Record<string, number> = {};
  for (const m of members) original[m.id] = 0;

  if (selected.length > 0 && originalAmount > 0) {
    if (mode === 'equal') {
      const per = originalAmount / selected.length;
      for (const m of selected) original[m.id] = per;
    } else if (mode === 'shares') {
      const weights = selected.map((m) => (m.value.trim() === '' ? 1 : Math.max(0, num(m.value))));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      if (totalWeight > 0) {
        selected.forEach((m, i) => {
          original[m.id] = (originalAmount * weights[i]) / totalWeight;
        });
      }
    } else {
      // amount / percent 共用「手動值 + 留空均分剩餘」邏輯，差別只在單位
      const isPercent = mode === 'percent';
      const totalUnits = isPercent ? 100 : originalAmount;

      const manual = selected.filter((m) => m.value.trim() !== '');
      const auto = selected.filter((m) => m.value.trim() === '');
      const manualSum = manual.reduce((a, m) => a + num(m.value), 0);
      const remaining = totalUnits - manualSum;
      const perAuto = auto.length > 0 ? Math.max(0, remaining) / auto.length : 0;

      const toOriginal = (units: number) => (isPercent ? (originalAmount * units) / 100 : units);
      for (const m of manual) original[m.id] = toOriginal(num(m.value));
      for (const m of auto) original[m.id] = toOriginal(perAuto);
    }
  }

  const allocatedOriginal = selected.reduce((a, m) => a + (original[m.id] || 0), 0);

  const twd: Record<string, number> = {};
  for (const m of members) twd[m.id] = (original[m.id] || 0) * exchangeRate;
  const allocatedTWD = selected.reduce((a, m) => a + (twd[m.id] || 0), 0);

  // 容差：金額級的浮點/手動取整誤差；至少 0.02 原幣或總額的 0.1%
  const tol = Math.max(0.02, originalAmount * 0.001);
  let balanced = false;
  let imbalance: 'over' | 'under' | null = null;
  if (selected.length > 0 && originalAmount > 0) {
    const diff = allocatedOriginal - originalAmount;
    if (Math.abs(diff) <= tol) balanced = true;
    else imbalance = diff > 0 ? 'over' : 'under';
  }

  return { original, twd, allocatedOriginal, allocatedTWD, balanced, imbalance };
}
