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
  /** 會籍年度（window: 'calendar' 才有值＝asOf 當年；rolling12m 為 null） */
  windowYear: number | null;
  /** 滾動窗口起日（window: 'rolling12m' 才有值，YYYY-MM-DD）；calendar 為 null */
  windowStart: string | null;
  /** 本升等窗口累積積分 */
  windowPoints: number;
  /** 本窗口積分已達的最高等級（與使用者自設 currentTier 無關） */
  achievedTier: PointsTier;
  /** 下一級；null＝已達最高級 */
  nextTier: PointsTier | null;
  /** 距下一級還差的積分；nextTier 為 null 時為 null */
  pointsToNext: number | null;
  /**
   * 使用者自設等級的續會狀態；該級無獨立續會門檻（或未設定等級）時為 null。
   * term2y 續會窗口還需 tierExpiresAt——未設定時亦為 null（見 rules.renewalWindow）。
   */
  renewal: { required: number; points: number; met: boolean } | null;
  /** 超額積分結轉次年的估算；不符結轉資格（等級不足/無超額/無此規則）為 0 */
  carryOverEstimate: number;
  /**
   * 自家航班積分占比（0–1）；只算升等窗口，本窗口無正積分時為 null。
   * CI 50% 條款用，CX UI 不顯示。續卡窗口占比刻意不另算——同一使用者的自家航班
   * 習慣通常穩定，升等窗口的占比已足夠當警示訊號，另算徒增複雜度（僅供參考）。
   */
  ownAirlineRatio: number | null;
  /** 可花里數餘額（全期間 award_miles 加總，不限窗口） */
  awardMilesBalance: number;
}

/** window: 'rolling12m' 的窗口起日──asOf 往前推一年（同月日，年份 -1）。 */
function rolling12mStart(asOf: string): string {
  const [y, m, d] = asOf.split('-');
  return `${Number(y) - 1}-${m}-${d}`;
}

/**
 * renewalWindow: 'term2y' 的續卡固定窗口：[卡籍效期日往前推 2 年, min(asOf, 卡籍效期日)]。
 * 字串年運算（同 rolling12m 技巧），即使月日組不出真實日期（如 02-29）字串比較仍正確。
 */
function term2yWindow(tierExpiresAt: string, asOf: string): { start: string; end: string } {
  const [y, m, d] = tierExpiresAt.split('-');
  return {
    start: `${Number(y) - 2}-${m}-${d}`,
    end: asOf < tierExpiresAt ? asOf : tierExpiresAt,
  };
}

/**
 * @param entries 該 program 的全部 entries（不限窗口；window 過濾在本函式內做）
 * @param currentTier 使用者自設的目前等級 key；未設定傳 null
 * @param tierExpiresAt 卡籍效期（YYYY-MM-DD）；renewalWindow: 'term2y' 續會窗口的計算基準，
 *   未設定時該規則的續會結果為 null
 * @param asOf 進度基準日（YYYY-MM-DD），預設今天
 */
export function computeLoyaltyProgress(
  entries: Pick<LoyaltyEntryItem, 'date' | 'status_points' | 'award_miles' | 'own_airline'>[],
  rules: PointsProgramRules,
  currentTier: string | null,
  tierExpiresAt: string | null,
  asOf: string = new Date().toISOString().slice(0, 10)
): LoyaltyProgress {
  const isCalendar = rules.window === 'calendar';
  const windowYear = isCalendar ? Number(asOf.slice(0, 4)) : null;
  const windowStart = isCalendar ? null : rolling12mStart(asOf);
  const inWindow = (date: string) =>
    isCalendar ? date.startsWith(`${asOf.slice(0, 4)}-`) : date >= windowStart! && date <= asOf;

  let windowPoints = 0;
  let ownAirlinePoints = 0;
  let positivePoints = 0;
  let awardMilesBalance = 0;
  for (const e of entries) {
    awardMilesBalance += e.award_miles;
    if (!inWindow(e.date)) continue;
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
  let renewal: LoyaltyProgress['renewal'] = null;
  if (current?.renewalThreshold != null) {
    if (rules.renewalWindow === 'sameWindow') {
      renewal = {
        required: current.renewalThreshold,
        points: windowPoints,
        met: windowPoints >= current.renewalThreshold,
      };
    } else if (tierExpiresAt) {
      const { start: renewalStart, end: renewalEnd } = term2yWindow(tierExpiresAt, asOf);
      let renewalPoints = 0;
      for (const e of entries) {
        if (e.date >= renewalStart && e.date <= renewalEnd) renewalPoints += e.status_points;
      }
      renewal = {
        required: current.renewalThreshold,
        points: renewalPoints,
        met: renewalPoints >= current.renewalThreshold,
      };
    }
  }

  // 結轉估算：本窗口積分已達 minTierKey（含）以上時，超出「已達最高門檻」的部分 × ratio
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
    windowStart,
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
  /**
   * 續卡進度（term2y 固定 2 年窗口＝卡籍效期往前推 2 年）：需 `tierExpiresAt` 且
   * `currentTier` 對到的 tier 有 `renewalMiles`/`renewalSegments`，否則為 null
   * （即該級無續卡規則，或使用者尚未設定卡籍效期）。哩程或航段擇一達標即算 met。
   */
  renewal: {
    requiredMiles: number;
    requiredSegments: number;
    miles: number;
    segments: number;
    met: boolean;
  } | null;
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
 * @param currentTier 使用者自設等級 key；用於對照 tier 的續卡門檻
 * @param tierExpiresAt 卡籍效期（YYYY-MM-DD）；續卡固定 2 年窗口的計算基準，
 *   未設定時 renewal 恆為 null
 * @param asOf 進度基準日（YYYY-MM-DD），預設今天——往前推一年為升等窗口起點
 */
export function computeMilesSegmentsProgress(
  entries: Pick<
    LoyaltyEntryItem,
    'date' | 'type' | 'qualifying_miles' | 'award_miles' | 'own_airline'
  >[],
  rules: MilesSegmentsProgramRules,
  currentTier: string | null,
  tierExpiresAt: string | null,
  asOf: string = new Date().toISOString().slice(0, 10)
): MilesSegmentsProgress {
  // 字串日期比較避免時區/曆法歧義（同 computeLoyaltyProgress 慣例）。
  // 起日採「同月日、年份 -1」：即使是 02-29 這種不存在的日期，字串比較仍正確。
  const windowStart = rolling12mStart(asOf);

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

  // 續卡（term2y 固定窗口）：需卡籍效期＋currentTier 對到有 renewalMiles/renewalSegments 的 tier
  const currentTierRule = currentTier ? (tiers.find((t) => t.key === currentTier) ?? null) : null;
  let renewal: MilesSegmentsProgress['renewal'] = null;
  if (
    tierExpiresAt &&
    currentTierRule?.renewalMiles != null &&
    currentTierRule.renewalSegments != null
  ) {
    const { start: renewalStart, end: renewalEnd } = term2yWindow(tierExpiresAt, asOf);
    let renewalMiles = 0;
    let renewalSegments = 0;
    for (const e of entries) {
      if (e.date < renewalStart || e.date > renewalEnd) continue;
      renewalMiles += e.qualifying_miles;
      if (e.type === 'flight' && e.own_airline) renewalSegments += 1;
    }
    renewal = {
      requiredMiles: currentTierRule.renewalMiles,
      requiredSegments: currentTierRule.renewalSegments,
      miles: renewalMiles,
      segments: renewalSegments,
      met:
        renewalMiles >= currentTierRule.renewalMiles ||
        renewalSegments >= currentTierRule.renewalSegments,
    };
  }

  return {
    windowStart,
    windowMiles,
    windowSegments,
    achievedTier,
    nextTier,
    milesToNext: nextTier ? Math.max(0, nextTier.miles - windowMiles) : null,
    segmentsToNext: nextTier ? Math.max(0, nextTier.segments - windowSegments) : null,
    renewal,
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
