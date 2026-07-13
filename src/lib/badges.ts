import { ALLIANCE_BY_IATA, ALLIANCE_COUNT } from '@/constants/alliances';
import { HOTEL_BRANDS } from '@/constants/hotelBrands';

/**
 * 里程碑徽章（Collections，ROADMAP #19 P3）的純計算層——與 [collections.ts] 同樣
 * 「可單測、無 I/O」。登入成就頁與公開分享卡共用：前者以 getCollections 的紀錄清單、
 * 後者以公開路由回傳的**彙總數字**（BadgeCounts）為輸入，徽章判定完全由數字推導，
 * 因此公開 payload 不需要（也不得）攜帶任何逐筆紀錄。
 */

/** 徽章的計數指標（也是進度條的分子來源）。 */
export type BadgeMetric =
  | 'flights'
  | 'airlines'
  | 'alliances'
  | 'stays'
  | 'brands'
  | 'luxuryBrands'
  | 'countries';

export interface BadgeDef {
  /** 穩定識別碼（i18n key 與公開分享卡沿用，勿改既有值）。 */
  id: string;
  metric: BadgeMetric;
  /** 達標門檻（達到即解鎖）。 */
  target: number;
}

/**
 * 徽章清單（顯示順序＝此順序）。新增門檻直接加項即可；`id` 一經釋出即凍結。
 */
export const BADGES: readonly BadgeDef[] = [
  { id: 'flights-1', metric: 'flights', target: 1 },
  { id: 'flights-10', metric: 'flights', target: 10 },
  { id: 'flights-50', metric: 'flights', target: 50 },
  { id: 'flights-100', metric: 'flights', target: 100 },
  { id: 'airlines-5', metric: 'airlines', target: 5 },
  { id: 'airlines-15', metric: 'airlines', target: 15 },
  { id: 'alliances-3', metric: 'alliances', target: ALLIANCE_COUNT },
  { id: 'stays-10', metric: 'stays', target: 10 },
  { id: 'stays-50', metric: 'stays', target: 50 },
  { id: 'brands-5', metric: 'brands', target: 5 },
  { id: 'brands-15', metric: 'brands', target: 15 },
  { id: 'luxury-5', metric: 'luxuryBrands', target: 5 },
  { id: 'countries-5', metric: 'countries', target: 5 },
  { id: 'countries-10', metric: 'countries', target: 10 },
  { id: 'countries-30', metric: 'countries', target: 30 },
];

/** 徽章判定的輸入：全部是彙總數字（公開分享卡的完整 payload 形狀）。 */
export interface BadgeCounts {
  /** 航班總數。 */
  flights: number;
  /** 搭過的航空公司數（去重）。 */
  airlines: number;
  /** 集到的聯盟數（0–3）。 */
  alliances: number;
  /** 住宿總數。 */
  stays: number;
  /** 住過的品牌數（去重、不含獨立旅宿 null）。 */
  brands: number;
  /** 其中 luxury tier 的品牌數。 */
  luxuryBrands: number;
  /** 造訪國家數。 */
  countries: number;
}

const LUXURY_BRAND_IDS = new Set(HOTEL_BRANDS.filter((b) => b.tier === 'luxury').map((b) => b.id));

/**
 * 由逐筆紀錄彙總出徽章輸入。聯盟/奢華判定各自查表（alliances.json / hotelBrands.ts），
 * 未知航空代碼不計聯盟、null 品牌不計品牌——與成就頁統計磚同口徑。
 */
export function computeBadgeCounts(
  flights: { airline: string }[],
  stays: { brand: string | null }[],
  countryCount: number
): BadgeCounts {
  const airlines = new Set<string>();
  const alliances = new Set<string>();
  for (const f of flights) {
    airlines.add(f.airline);
    const alliance = ALLIANCE_BY_IATA.get(f.airline);
    if (alliance) alliances.add(alliance);
  }

  const brands = new Set<string>();
  let luxuryBrands = 0;
  for (const s of stays) {
    if (!s.brand || brands.has(s.brand)) continue;
    brands.add(s.brand);
    if (LUXURY_BRAND_IDS.has(s.brand)) luxuryBrands += 1;
  }

  return {
    flights: flights.length,
    airlines: airlines.size,
    alliances: alliances.size,
    stays: stays.length,
    brands: brands.size,
    luxuryBrands,
    countries: countryCount,
  };
}

export interface BadgeStatus extends BadgeDef {
  /** 目前的指標值（進度條分子；可能超過 target）。 */
  value: number;
  achieved: boolean;
}

/** 把彙總數字對上徽章門檻（順序同 BADGES）。 */
export function computeBadges(counts: BadgeCounts): BadgeStatus[] {
  return BADGES.map((def) => ({
    ...def,
    value: counts[def.metric],
    achieved: counts[def.metric] >= def.target,
  }));
}
