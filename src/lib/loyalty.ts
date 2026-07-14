import type { PointsProgramRules, PointsTier } from '@/constants/loyalty';
import type { LoyaltyEntryItem } from '@/types';

/**
 * 會籍升等／保級進度計算（docs/PLAN-LOYALTY.md §5）。
 * 與 badges.ts 同風格的純函式：無 IO、輸入輸出皆 plain object，方便單元測試。
 * 日期一律以 YYYY-MM-DD 字串比較（entries DTO 即此格式），避免時區歧義。
 *
 * 只實作積分制（CX；CI 同形狀）。哩程＋航段制（BR）、夜數制（飯店）待
 * ProgramRules union 擴充後依 kind 分流。
 */

export interface LoyaltyProgress {
  /** 會籍年度（曆年制＝asOf 當年） */
  windowYear: number;
  /** 本會籍年度累積積分 */
  windowPoints: number;
  /** 本年度積分已達的最高等級（與使用者自設 currentTier 無關） */
  achievedTier: PointsTier;
  /** 下一級；null＝已達最高級 */
  nextTier: PointsTier | null;
  /** 距下一級還差的積分；nextTier 為 null 時為 null */
  pointsToNext: number | null;
  /** 使用者自設等級的續會狀態；該級無獨立續會門檻（或未設定等級）時為 null */
  renewal: { required: number; met: boolean } | null;
  /** 超額積分結轉次年的估算；不符結轉資格（等級不足/無超額/無此規則）為 0 */
  carryOverEstimate: number;
  /** 自家航班積分占比（0–1）；本年度無正積分時為 null。CI 50% 條款用，CX UI 不顯示 */
  ownAirlineRatio: number | null;
  /** 可花里數餘額（全期間 award_miles 加總，不限會籍年度） */
  awardMilesBalance: number;
}

/**
 * @param entries 該 program 的全部 entries（不限年度；window 過濾在本函式內做）
 * @param currentTier 使用者自設的目前等級 key；未設定傳 null
 * @param asOf 進度基準日（YYYY-MM-DD），預設今天——會籍年度取其年份
 */
export function computeLoyaltyProgress(
  entries: Pick<LoyaltyEntryItem, 'date' | 'status_points' | 'award_miles' | 'own_airline'>[],
  rules: PointsProgramRules,
  currentTier: string | null,
  asOf: string = new Date().toISOString().slice(0, 10)
): LoyaltyProgress {
  const windowYear = Number(asOf.slice(0, 4));
  const yearPrefix = `${asOf.slice(0, 4)}-`;

  let windowPoints = 0;
  let ownAirlinePoints = 0;
  let positivePoints = 0;
  let awardMilesBalance = 0;
  for (const e of entries) {
    awardMilesBalance += e.award_miles;
    if (!e.date.startsWith(yearPrefix)) continue;
    windowPoints += e.status_points;
    if (e.status_points > 0) {
      positivePoints += e.status_points;
      if (e.own_airline) ownAirlinePoints += e.status_points;
    }
  }

  // tiers 由低到高；achieved＝門檻 ≤ windowPoints 的最高級
  const tiers = rules.tiers;
  let achievedTier = tiers[0];
  for (const tier of tiers) {
    if (windowPoints >= tier.threshold) achievedTier = tier;
  }
  const achievedIndex = tiers.indexOf(achievedTier);
  const nextTier = achievedIndex + 1 < tiers.length ? tiers[achievedIndex + 1] : null;

  const current = currentTier ? (tiers.find((t) => t.key === currentTier) ?? null) : null;
  const renewal =
    current?.renewalThreshold != null
      ? { required: current.renewalThreshold, met: windowPoints >= current.renewalThreshold }
      : null;

  // 結轉估算：本年度積分已達 minTierKey（含）以上時，超出「已達最高門檻」的部分 × ratio
  let carryOverEstimate = 0;
  if (rules.rollover) {
    const minIndex = tiers.findIndex((t) => t.key === rules.rollover!.minTierKey);
    const excess = windowPoints - achievedTier.threshold;
    if (minIndex !== -1 && achievedIndex >= minIndex && excess > 0) {
      carryOverEstimate = Math.floor(excess * rules.rollover.ratio);
    }
  }

  return {
    windowYear,
    windowPoints,
    achievedTier,
    nextTier,
    pointsToNext: nextTier ? nextTier.threshold - windowPoints : null,
    renewal,
    carryOverEstimate,
    ownAirlineRatio: positivePoints > 0 ? ownAirlinePoints / positivePoints : null,
    awardMilesBalance,
  };
}
