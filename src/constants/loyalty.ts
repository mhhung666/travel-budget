/**
 * 航空／飯店會籍計畫的規則常數（docs/PLAN-LOYALTY.md）。
 *
 * 定位是「積分記帳」：積分／里數由使用者手動記（LoyaltyEntry），本檔只提供
 * 「對照門檻算進度」所需的等級表。規則各家年年變——**所有門檻集中在本檔**、
 * 每個 program 標 `verifiedAt` 查證日期，改規則＝改常數，不動 schema。
 *
 * MVP 只開放國泰（CX）；華航（CI，積分制）／長榮（BR，哩程＋航段制）與
 * 飯店會籍（夜數制）為未來擴充，屆時在 union 加 kind 即可。
 */

/** 已開放的 program（Phase 2+：'CI'、'BR'、飯店計畫）。 */
export const LOYALTY_PROGRAMS = ['CX'] as const;
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

/**
 * 規則形狀：積分制（CX、CI）。未來擴充：哩程＋航段制（BR，`kind: 'milesAndSegments'`）、
 * 夜數制（飯店，`kind: 'nights'`）——屆時擴 union，computeLoyaltyProgress 依 kind 分流。
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

export type ProgramRules = PointsProgramRules;

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
};

/** program 的合法 tier key 集合（action 端驗證 current_tier 用）。 */
export function programTierKeys(program: LoyaltyProgram): string[] {
  return PROGRAM_RULES[program].tiers.map((t) => t.key);
}
