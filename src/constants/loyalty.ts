/**
 * 航空／飯店會籍計畫的規則常數（docs/PLAN-LOYALTY.md）。
 *
 * 定位是「積分記帳」：積分／里數由使用者手動記（LoyaltyEntry），本檔只提供
 * 「對照門檻算進度」所需的等級表。規則各家年年變——**所有門檻集中在本檔**、
 * 每個 program 標 `verifiedAt` 查證日期，改規則＝改常數，不動 schema。
 *
 * 已開放：國泰（CX，積分制）、長榮（BR，哩程＋航段制）。華航（CI，積分制）與
 * 飯店會籍（夜數制）為未來擴充，屆時在 union 加 kind 即可。
 */

/** 已開放的 program（Phase 2+：'CI'、飯店計畫）。目前皆為航空計畫。 */
export const LOYALTY_PROGRAMS = ['CX', 'BR'] as const;
export type LoyaltyProgram = (typeof LOYALTY_PROGRAMS)[number];

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
}

/**
 * 規則形狀：積分制（CX、CI）。未來擴充：夜數制（飯店，`kind: 'nights'`）——
 * 屆時擴 union，進度計算依 kind 分流（見 lib/loyalty.ts）。
 */
export interface PointsProgramRules {
  kind: 'points';
  /** 會籍年度：CX 2027 新制為曆年（1/1–12/31） */
  membershipYear: 'calendar';
  /** 由低到高排序 */
  tiers: PointsTier[];
  /** 超額積分結轉：達 `minTierKey`（含）以上等級時，超出已達最高門檻的積分 × ratio 轉入次年 */
  rollover?: { ratio: number; minTierKey: string };
  /** 積分需 ≥ 此比例來自自家航班（CI 專用；CX 無此限制） */
  ownAirlineMinRatio?: number;
  /** 規則查證日期（UI 顯示「規則查證於…，以官方為準」） */
  verifiedAt: string;
}

/**
 * 哩程＋航段制（BR）：升等看「滾動 12 個月」內累積的卡籍哩程 **或** 自家國際線
 * 航段數（滿足其一即可）。續卡另有 24 個月窗口＋不同門檻，且各家年年變——本 MVP
 * 只算升等進度，續卡以文案提示（見 PLAN-LOYALTY.md §8）。
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

export type ProgramRules = PointsProgramRules | MilesSegmentsProgramRules;

/**
 * 國泰 2027 新制（2026-07-14 查證，動工於過渡期——2026 年積分同時計 2026 保級與
 * 2027 定級，本表直接採 2027 制門檻）。「鑽石行政卡」為新設最高級，英文名以
 * i18n 呈現、待官方定名後修 catalog 即可。
 */
export const PROGRAM_RULES: Record<LoyaltyProgram, ProgramRules> = {
  CX: {
    kind: 'points',
    membershipYear: 'calendar',
    tiers: [
      { key: 'green', threshold: 0 },
      { key: 'silver', threshold: 300 },
      { key: 'gold', threshold: 600, renewalThreshold: 300 },
      { key: 'diamond', threshold: 1200, renewalThreshold: 600 },
      { key: 'diamond_plus', threshold: 2400, renewalThreshold: 1200 },
    ],
    rollover: { ratio: 0.5, minTierKey: 'gold' },
    verifiedAt: '2026-07-14',
  },
  // 長榮 無限萬哩遊（Infinity MileageLands）升等門檻（2026-07 查證，近 12 個月，
  // 哩程或航段滿足其一即可）：銀＝30,000 哩＋4 段 或 26 段；金＝50,000 哩 或 50 段；
  // 鑽＝120,000 哩 或 100 段。航段限長榮／立榮實際搭乘之國際線。續卡門檻與 24 個月
  // 窗口不同，本 MVP 不精算（UI 以文案提示）。
  BR: {
    kind: 'milesAndSegments',
    window: 'rolling12m',
    tiers: [
      { key: 'green', miles: 0, segments: 0 },
      { key: 'silver', miles: 30000, minSegmentsWithMiles: 4, segments: 26 },
      { key: 'gold', miles: 50000, segments: 50 },
      { key: 'diamond', miles: 120000, segments: 100 },
    ],
    verifiedAt: '2026-07-14',
  },
};

/** program 的合法 tier key 集合（action 端驗證 current_tier 用）。 */
export function programTierKeys(program: LoyaltyProgram): string[] {
  return PROGRAM_RULES[program].tiers.map((t) => t.key);
}
