import {
  CX_SHORT_TYPE2_COUNTRIES,
  CX_SP_RANGES,
  CX_ZONE_MAX_MI,
  type CxEarnZone,
  type MilesSegmentsProgramRules,
  type MilesSegmentsTier,
  type PointsProgramRules,
  type PointsTier,
  type SpRange,
} from '@/constants/loyalty';
import type { CabinClass, LoyaltyEntryItem } from '@/types';

/**
 * 會籍升等／保級進度計算（docs/PLAN-LOYALTY.md §5）。
 * 與 badges.ts 同風格的純函式：無 IO、輸入輸出皆 plain object，方便單元測試。
 * 日期一律以 YYYY-MM-DD 字串比較（entries DTO 即此格式），避免時區歧義。
 *
 * 積分制（CX；CI 同形狀）＝computeLoyaltyProgress；哩程＋航段制（BR）＝
 * computeMilesSegmentsProgress。UI 依 rules.kind 分流呼叫。夜數制（飯店）待
 * ProgramRules union 再擴充。
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

export interface MilesSegmentsProgress {
  /** 滾動窗口起日（YYYY-MM-DD，asOf 往前推一年）。 */
  windowStart: string;
  /** 本窗口卡籍哩程總計。 */
  windowMiles: number;
  /** 本窗口自家國際線航段數（own_airline 的 flight entry 計數）。 */
  windowSegments: number;
  /** 本窗口哩程／航段對照達到的最高等級（與使用者自設 currentTier 無關）。 */
  achievedTier: MilesSegmentsTier;
  /** 下一級；null＝已達最高級。 */
  nextTier: MilesSegmentsTier | null;
  /** 距下一級的卡籍哩程（哩程路徑）；nextTier 為 null 時為 null。 */
  milesToNext: number | null;
  /** 距下一級的自家國際航段（航段路徑）；nextTier 為 null 時為 null。 */
  segmentsToNext: number | null;
  /** 可花里數餘額（全期間 award_miles 加總，不限窗口）。 */
  awardMilesBalance: number;
}

/** 某 tier 是否達標：航段路徑（純自家航段）或哩程路徑（哩程＋最低附加航段）滿足其一。 */
function milesSegmentsTierMet(tier: MilesSegmentsTier, miles: number, segments: number): boolean {
  const bySegments = tier.segments > 0 && segments >= tier.segments;
  const byMiles = miles >= tier.miles && segments >= (tier.minSegmentsWithMiles ?? 0);
  // green（門檻皆 0）恆達標
  return tier.miles === 0 && tier.segments === 0 ? true : bySegments || byMiles;
}

/**
 * 哩程＋航段制升等進度（BR，docs/PLAN-LOYALTY.md §5）。
 * 「航段」＝窗口內 `type === 'flight' && own_airline` 的 entry 數（自家國際線實際搭乘）。
 *
 * @param entries 該 program 的全部 entries（窗口過濾在本函式內做）
 * @param currentTier 使用者自設等級 key（此 MVP 未用於升等進度，保留簽名一致）
 * @param asOf 進度基準日（YYYY-MM-DD），預設今天——往前推一年為窗口起點
 */
export function computeMilesSegmentsProgress(
  entries: Pick<
    LoyaltyEntryItem,
    'date' | 'type' | 'qualifying_miles' | 'award_miles' | 'own_airline'
  >[],
  rules: MilesSegmentsProgramRules,
  _currentTier: string | null,
  asOf: string = new Date().toISOString().slice(0, 10)
): MilesSegmentsProgress {
  // 字串日期比較避免時區/曆法歧義（同 computeLoyaltyProgress 慣例）。
  // 起日採「同月日、年份 -1」：即使是 02-29 這種不存在的日期，字串比較仍正確。
  const [y, m, d] = asOf.split('-');
  const windowStart = `${Number(y) - 1}-${m}-${d}`;

  let windowMiles = 0;
  let windowSegments = 0;
  let awardMilesBalance = 0;
  for (const e of entries) {
    awardMilesBalance += e.award_miles;
    if (e.date < windowStart || e.date > asOf) continue;
    windowMiles += e.qualifying_miles;
    if (e.type === 'flight' && e.own_airline) windowSegments += 1;
  }

  // tiers 由低到高；achieved＝獨立檢查（金卡純哩程路徑可跳過銀卡）取最高達標者
  const tiers = rules.tiers;
  let achievedIndex = 0;
  tiers.forEach((tier, i) => {
    if (milesSegmentsTierMet(tier, windowMiles, windowSegments)) achievedIndex = i;
  });
  const achievedTier = tiers[achievedIndex];
  const nextTier = achievedIndex + 1 < tiers.length ? tiers[achievedIndex + 1] : null;

  return {
    windowStart,
    windowMiles,
    windowSegments,
    achievedTier,
    nextTier,
    milesToNext: nextTier ? Math.max(0, nextTier.miles - windowMiles) : null,
    segmentsToNext: nextTier ? Math.max(0, nextTier.segments - windowSegments) : null,
    awardMilesBalance,
  };
}

/** 大圓距離 km → statute mile（CX 距離區間以 mile 劃分）。 */
export const KM_TO_MI = 0.621371;

export interface CxSpEstimate extends SpRange {
  zone: CxEarnZone;
}

/**
 * CX 會籍積分預估（PLAN-LOYALTY §8 Phase 3）：距離區間 × 客艙查
 * constants/loyalty.ts 的官方賺取表，回 SP min–max 區間。里數＝SP × 100
 * （CX_AWARD_MILES_PER_SP），由呼叫端推導。精確值需訂位艙等字母——刻意不做，
 * 區間僅供參考、可改（UI 恆帶 disclaimer）。
 *
 * @param distanceMi 兩機場大圓距離（statute mile；haversineKm × KM_TO_MI）
 * @param fromCountry / toCountry 端點國家（ISO2，airports.json 的 country）——
 *   751–2,750 哩時任一端在 CX_SHORT_TYPE2_COUNTRIES 即算短途-類別2
 */
export function estimateCxStatusPoints(
  distanceMi: number,
  cabin: CabinClass,
  fromCountry: string,
  toCountry: string
): CxSpEstimate {
  let zone: CxEarnZone;
  if (distanceMi <= CX_ZONE_MAX_MI.ultraShort) {
    zone = 'ultraShort';
  } else if (distanceMi <= CX_ZONE_MAX_MI.short) {
    const type2 =
      CX_SHORT_TYPE2_COUNTRIES.includes(fromCountry) ||
      CX_SHORT_TYPE2_COUNTRIES.includes(toCountry);
    zone = type2 ? 'short2' : 'short1';
  } else if (distanceMi <= CX_ZONE_MAX_MI.medium) {
    zone = 'medium';
  } else if (distanceMi <= CX_ZONE_MAX_MI.long) {
    zone = 'long';
  } else {
    zone = 'ultraLong';
  }
  return { zone, ...CX_SP_RANGES[zone][cabin] };
}
