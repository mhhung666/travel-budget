import allianceData from './alliances.json';

/**
 * 三大航空聯盟成員（IATA → alliance）。**單一來源：[alliances.json](./alliances.json)**——
 * 同一份 JSON 由 scripts/generate-catalogs.mjs 讀取疊進 public/data/airlines.json（前端目錄），
 * 此檔提供伺服端／不便 fetch 目錄時的同步查表（徽章計算、公開分享卡）。
 * 人工維護：聯盟異動極少（一年 0–2 家），異動改 JSON 後需 `pnpm generate:catalogs` 重產目錄。
 */

export type Alliance = 'star' | 'oneworld' | 'skyteam';

export const ALLIANCE_IDS = Object.keys(allianceData) as Alliance[];

/** 聯盟總數（成就「集滿三大聯盟」的分母）。 */
export const ALLIANCE_COUNT = ALLIANCE_IDS.length;

/** IATA 代碼 → 所屬聯盟。 */
export const ALLIANCE_BY_IATA: ReadonlyMap<string, Alliance> = new Map(
  ALLIANCE_IDS.flatMap((alliance) =>
    allianceData[alliance].map((iata) => [iata, alliance] as const)
  )
);
