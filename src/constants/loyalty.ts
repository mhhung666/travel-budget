/**
 * 航空／飯店會籍計畫的規則常數（docs/PLAN-LOYALTY.md）。
 *
 * 定位是「積分記帳」：積分／里數由使用者手動記（LoyaltyEntry），本檔只提供
 * 「對照門檻算進度」所需的等級表。規則各家年年變——**所有門檻集中在本檔**、
 * 每個 program 標 `verifiedAt` 查證日期，改規則＝改常數，不動 schema。
 *
 * 已開放：國泰（CX，積分制）、華航（CI，積分制）、長榮（BR，哩程＋航段制）、
 * 萬豪旅享家（MB，合格房晚制）。
 */

import type { CabinClass } from '@/types';

/** 已開放的 program；順序即 UI 顯示順序。 */
export const AIRLINE_LOYALTY_PROGRAMS = ['CX', 'CI', 'BR'] as const;
export const HOTEL_LOYALTY_PROGRAMS = ['MB'] as const;
export const LOYALTY_PROGRAMS = [...AIRLINE_LOYALTY_PROGRAMS, ...HOTEL_LOYALTY_PROGRAMS] as const;
export type LoyaltyProgram = (typeof LOYALTY_PROGRAMS)[number];
export type AirlineLoyaltyProgram = (typeof AIRLINE_LOYALTY_PROGRAMS)[number];
export type HotelLoyaltyProgram = (typeof HOTEL_LOYALTY_PROGRAMS)[number];

/** 積分／里數的來源類別（adjust＝更正/沖銷，數字可為負）。 */
export const LOYALTY_ENTRY_TYPES = [
  'flight',
  'stay',
  'card',
  'dining',
  'promo',
  'adjust',
  'other',
] as const;
export type LoyaltyEntryType = (typeof LOYALTY_ENTRY_TYPES)[number];

export interface PointsTier {
  /** tier key，i18n 於 `collections.loyalty.tiers.<program>.<key>` */
  key: string;
  /** 升等門檻（單一會籍年度內的積分） */
  threshold: number;
  /** 續會門檻；省略＝該級無獨立續會規則（UI 只顯示升等進度） */
  renewalThreshold?: number;
}

export interface MilesSegmentsTier {
  /** tier key，i18n 於 `collections.loyalty.tiers.<program>.<key>` */
  key: string;
  /** 哩程路徑門檻（本窗口卡籍哩程） */
  miles: number;
  /** 哩程路徑另需的最低自家國際航段數（長榮銀卡＝30,000 哩「＋4 段」；金／鑽無此附加） */
  minSegmentsWithMiles?: number;
  /** 航段路徑門檻：純自家國際航段數即可達標（不看哩程） */
  segments: number;
  /** 續卡哩程門檻（term2y 窗口用）；省略＝該級無獨立續卡規則 */
  renewalMiles?: number;
  /** 續卡航段門檻（term2y 窗口用）；省略＝該級無獨立續卡規則 */
  renewalSegments?: number;
}

export interface NightsTier {
  /** tier key，i18n 於 `collections.loyalty.tiers.<program>.<key>` */
  key: string;
  /** 每曆年 Elite Night Credit 門檻。 */
  nights: number;
  /** 除房晚外的年度合格消費門檻（USD）；目前僅萬豪大使級需要。 */
  qualifyingSpendUsd?: number;
}

/**
 * 規則形狀：積分制（CX、CI）。未來擴充：夜數制（飯店，`kind: 'nights'`）——
 * 屆時擴 union，進度計算依 kind 分流（見 lib/loyalty.ts）。
 */
export interface PointsProgramRules {
  kind: 'points';
  /**
   * cumulative＝同一曆年用絕對門檻判級（CX 2027+）；
   * sequential＝只依目前卡級追蹤下一級，門檻於升等後重新起算（CI）。
   */
  qualification: 'cumulative' | 'sequential';
  /** 升等窗口：calendar＝曆年 1/1–12/31（CX 2027 新制）；rolling12m＝滾動 12 個月（CI） */
  window: 'calendar' | 'rolling12m';
  /**
   * 續會窗口：sameWindow＝續會門檻對照與升等相同窗口（CX 現行為，曆年制內結算）；
   * term2y＝續會看「卡籍效期日往前推 2 年」的固定區間（CI 兩年一算），需帳戶填
   * `tierExpiresAt` 才能算（見 lib/loyalty.ts）。
   */
  renewalWindow: 'sameWindow' | 'term2y';
  /** 由低到高排序 */
  tiers: PointsTier[];
  /**
   * 超額積分結轉：達 `minTierKey`（含）以上時，超出已達門檻的積分可全數結轉，
   * 但上限為該門檻 × `maxRatio`。
   */
  rollover?: { maxRatio: number; minTierKey: string };
  /** 積分需 ≥ 此比例來自自家航班（升等與續卡皆適用；CX 無此限制） */
  ownAirlineMinRatio?: number;
  /** 升等另需的自家合資格航段數；可指定生效日（CX 2027 新制）。 */
  ownAirlineMinSegments?: { count: number; effectiveFrom: string };
  /** 規則查證日期（UI 顯示「規則查證於…，以官方為準」） */
  verifiedAt: string;
}

/**
 * 哩程＋航段制（BR）：升等看「滾動 12 個月」內累積的卡籍哩程 **或** 自家國際線
 * 航段數（滿足其一即可）。續卡另有固定 2 年窗口（卡籍效期日往前推 2 年）＋不同
 * 門檻（見 tiers 的 renewalMiles/renewalSegments），續卡窗口計算需帳戶填
 * `tierExpiresAt`（見 lib/loyalty.ts）。
 */
export interface MilesSegmentsProgramRules {
  kind: 'milesAndSegments';
  /** 升等窗口：近 12 個月（asOf 往前推一年起） */
  window: 'rolling12m';
  /** 由低到高排序 */
  tiers: MilesSegmentsTier[];
  /** 規則查證日期（UI 顯示「規則查證於…，以官方為準」） */
  verifiedAt: string;
}

/** 飯店合格房晚制：曆年累積，可跨級，1/1 歸零且不結轉。 */
export interface NightsProgramRules {
  kind: 'nights';
  window: 'calendar';
  tiers: NightsTier[];
  /** 年度自選禮遇里程碑（萬豪 50／75 晚）。 */
  choiceBenefitNights?: number[];
  /** 終身會籍門檻；同時需要終身房晚與該級以上年資。 */
  lifetimeTiers?: Array<{ key: string; nights: number; years: number }>;
  verifiedAt: string;
}

export type ProgramRules = PointsProgramRules | MilesSegmentsProgramRules | NightsProgramRules;

/**
 * 國泰 2027 新制（2026-07-14 查證，動工於過渡期——2026 年積分同時計 2026 保級與
 * 2027 定級，本表直接採 2027 制門檻）。「鑽石行政卡」為新設最高級，英文名以
 * i18n 呈現、待官方定名後修 catalog 即可。
 */
export const PROGRAM_RULES: Record<LoyaltyProgram, ProgramRules> = {
  CX: {
    kind: 'points',
    qualification: 'cumulative',
    window: 'calendar',
    renewalWindow: 'sameWindow',
    tiers: [
      { key: 'green', threshold: 0 },
      { key: 'silver', threshold: 300, renewalThreshold: 300 },
      { key: 'gold', threshold: 600, renewalThreshold: 600 },
      { key: 'diamond', threshold: 1200, renewalThreshold: 1200 },
      { key: 'diamond_plus', threshold: 2400, renewalThreshold: 2400 },
    ],
    rollover: { maxRatio: 0.5, minTierKey: 'gold' },
    ownAirlineMinSegments: { count: 2, effectiveFrom: '2027-01-01' },
    verifiedAt: '2026-07-14',
  },
  // 華航 動華會（Dynasty Flyer）新制（2025/11/27 生效，2026-07-16 查證）：官網
  // milesbringsmiles.china-airlines.com 被 Akamai 擋、以 jazztalk.tw／pokem.tw／
  // 官方社群三來源交叉確認。升等看「滾動 12 個月」會籍積分：金卡 360／翡翠卡
  // 720／晶鑽卡 1,400；續卡看「卡籍效期日往前推 2 年」固定區間：金卡 580／
  // 翡翠卡 1,150／晶鑽卡 2,240。升等與續卡皆須 ≥50% 積分來自華航／華信自營航班。
  CI: {
    kind: 'points',
    qualification: 'sequential',
    window: 'rolling12m',
    renewalWindow: 'term2y',
    tiers: [
      { key: 'member', threshold: 0 },
      { key: 'gold', threshold: 360, renewalThreshold: 580 },
      { key: 'emerald', threshold: 720, renewalThreshold: 1150 },
      { key: 'paragon', threshold: 1400, renewalThreshold: 2240 },
    ],
    ownAirlineMinRatio: 0.5,
    verifiedAt: '2026-07-16',
  },
  // 長榮 無限萬哩遊（Infinity MileageLands）升等門檻（2026-07-16 evaair.com 一手
  // 查證，近 12 個月，哩程或航段滿足其一即可）：銀＝30,000 哩＋4 段 或 26 段；
  // 金＝50,000 哩 或 50 段；鑽＝120,000 哩 或 100 段。續卡窗口＝卡籍效期（晉升
  // 生效日起 2 年至當月月底）：銀續卡 40,000 哩／42 段、金續卡 80,000 哩／80
  // 段、鑽續卡 200,000 哩／140 段（鑽升等門檻不變仍為 120,000）。航段限長榮／
  // 立榮實際搭乘之國際線；官方「達標日至新卡生效間的哩程保留」緩衝機制刻意不
  // 建模（以 UI disclaimer 涵蓋）。
  BR: {
    kind: 'milesAndSegments',
    window: 'rolling12m',
    tiers: [
      { key: 'green', miles: 0, segments: 0 },
      {
        key: 'silver',
        miles: 30000,
        minSegmentsWithMiles: 4,
        segments: 26,
        renewalMiles: 40000,
        renewalSegments: 42,
      },
      { key: 'gold', miles: 50000, segments: 50, renewalMiles: 80000, renewalSegments: 80 },
      {
        key: 'diamond',
        miles: 120000,
        segments: 100,
        renewalMiles: 200000,
        renewalSegments: 140,
      },
    ],
    verifiedAt: '2026-07-16',
  },
  // 萬豪旅享家 Marriott Bonvoy（2026-07-28 官方條款查證）：每曆年累積 Elite
  // Night Credits，達 10／25／50／75 晚依序為銀／金／白金／鈦金；大使需 100 晚
  // 且年度合格消費 US$23,000。房晚 1/1 歸零、不結轉；50／75 晚各有 Annual
  // Choice Benefit。City Express、Protea、Four Points Flex 與部分 Series by
  // Marriott 每晚僅 0.5 ENC，StudioRes 不累積，因此住宿帶入值只能作為可修改建議。
  MB: {
    kind: 'nights',
    window: 'calendar',
    tiers: [
      { key: 'member', nights: 0 },
      { key: 'silver', nights: 10 },
      { key: 'gold', nights: 25 },
      { key: 'platinum', nights: 50 },
      { key: 'titanium', nights: 75 },
      { key: 'ambassador', nights: 100, qualifyingSpendUsd: 23000 },
    ],
    choiceBenefitNights: [50, 75],
    lifetimeTiers: [
      { key: 'silver', nights: 250, years: 5 },
      { key: 'gold', nights: 400, years: 7 },
      { key: 'platinum', nights: 600, years: 10 },
    ],
    verifiedAt: '2026-07-28',
  },
};

/**
 * 等級 tag 的底色（會籍頁 tier badge 用；規則見 docs/TIER-COLORS.md）。
 * 取各家官方會員卡卡面主色的**近似值**（人工對照官網視覺取色，非官方色票）；
 * 銀／金／黑鑽等「材質級」跨航空共用同色，基礎級用該航空品牌綠／藍近似色。
 * 查無 key 時 UI fallback 回預設 secondary badge——新 program 未補色不會壞。
 */
export const TIER_BADGE_COLORS: Record<LoyaltyProgram, Record<string, string>> = {
  CX: {
    green: '#367D78',
    silver: '#8C8C8C',
    gold: '#8A7423',
    diamond: '#2C2C2A',
    diamond_plus: '#141414',
  },
  CI: {
    member: '#35477D',
    gold: '#8A7423',
    emerald: '#1E7A5A',
    paragon: '#2C2C2A',
  },
  BR: {
    green: '#16604B',
    silver: '#8C8C8C',
    gold: '#8A7423',
    diamond: '#2C2C2A',
  },
  MB: {
    member: '#4A4A4A',
    silver: '#8C8C8C',
    gold: '#8A7423',
    platinum: '#5F6F76',
    titanium: '#4D555B',
    ambassador: '#1F1F1F',
  },
};

/** program 的合法 tier key 集合（action 端驗證 current_tier 用）。 */
export function programTierKeys(program: LoyaltyProgram): string[] {
  return PROGRAM_RULES[program].tiers.map((t) => t.key);
}

/**
 * 「自家航班」判定用的 IATA 航空代碼名單（子公司併計）：CI 條款含華信（AE）、
 * BR 條款含立榮（B7）。用於 FlightRecordDialog 開啟累積時，依所選航班的
 * IATA 代碼預先勾選 own_airline（使用者仍可改）。
 */
export const OWN_AIRLINE_CODES: Record<AirlineLoyaltyProgram, readonly string[]> = {
  CX: ['CX'],
  CI: ['CI', 'AE'],
  BR: ['BR', 'B7'],
};

// ---------------------------------------------------------------------------
// CX 積分預估表（PLAN-LOYALTY §8 Phase 3）：依官方 2025-08-20 生效的賺取表，
// 距離區間 × 客艙給 Status Points 的 min–max 區間（同艙等內依票價類別／訂位
// 艙等字母差異很大，FlightRecord 只存客艙 → 只能給區間，明示為預估）。
// 來源：官方全表 PDF（cathaypacific.com/content/dam/cx/membership/
// changes-to-status-points-and-am-earnings-on-flights-full-table_tw.pdf）。
// ---------------------------------------------------------------------------

/** CX 短途-類別2 的航點國家（ISO2；任一端點在列即算類別2，其餘 751–2,750 哩為類別1）。 */
export const CX_SHORT_TYPE2_COUNTRIES: readonly string[] = ['JP', 'ID', 'LK', 'NP', 'BD', 'IN'];

export const CX_EARN_ZONES = [
  'ultraShort',
  'short1',
  'short2',
  'medium',
  'long',
  'ultraLong',
] as const;
export type CxEarnZone = (typeof CX_EARN_ZONES)[number];

/** 距離區間上限（statute mile；超長途無上限）。 */
export const CX_ZONE_MAX_MI = { ultraShort: 750, short: 2750, medium: 5000, long: 7500 } as const;

export interface SpRange {
  min: number;
  max: number;
}

/**
 * 各距離區間 × 客艙的 SP 區間（min＝該艙最低訂位艙等 Light、max＝最高艙等 Flex）。
 * Asia Miles 恆等於 SP × 100（官方兩表逐格對過），預估里數用 CX_AWARD_MILES_PER_SP 推導。
 */
export const CX_SP_RANGES: Record<CxEarnZone, Record<CabinClass, SpRange>> = {
  ultraShort: {
    economy: { min: 3, max: 25 },
    premium_economy: { min: 15, max: 25 },
    business: { min: 25, max: 30 },
    first: { min: 35, max: 35 },
  },
  short1: {
    economy: { min: 6, max: 30 },
    premium_economy: { min: 20, max: 30 },
    business: { min: 35, max: 40 },
    first: { min: 45, max: 45 },
  },
  short2: {
    economy: { min: 8, max: 35 },
    premium_economy: { min: 25, max: 35 },
    business: { min: 45, max: 50 },
    first: { min: 60, max: 60 },
  },
  medium: {
    economy: { min: 15, max: 48 },
    premium_economy: { min: 45, max: 60 },
    business: { min: 75, max: 90 },
    first: { min: 110, max: 110 },
  },
  long: {
    economy: { min: 18, max: 70 },
    premium_economy: { min: 65, max: 80 },
    business: { min: 100, max: 130 },
    first: { min: 160, max: 160 },
  },
  ultraLong: {
    economy: { min: 25, max: 90 },
    premium_economy: { min: 85, max: 100 },
    business: { min: 120, max: 150 },
    first: { min: 180, max: 180 },
  },
};

/** Asia Miles ＝ Status Points × 100（官方 SP 表與 AM 表逐格恆等）。 */
export const CX_AWARD_MILES_PER_SP = 100;

/** 預估表查證日期（UI disclaimer 用；表為 2025-08-20 生效版）。 */
export const CX_EARN_VERIFIED_AT = '2026-07-15';
