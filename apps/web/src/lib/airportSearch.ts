/** 機場選擇器搜尋需要的欄位（與 useAirports 目錄的 AirportEntry 相容）。 */
export interface SearchableAirport {
  iata: string;
  name: string;
  city: string | null;
}

/**
 * 依吻合程度排序後再截斷：代碼完全吻合 → 代碼前綴 → 城市／名稱開頭 → 城市／名稱包含。
 * 知道代碼的人預期第一筆就是答案；先截斷再排序的話，目錄前面的名稱吻合會把代碼吻合擠出清單
 * （例如 "tpe" 會命中 Montpellier）。同一順位維持目錄原順序（Array#sort 為穩定排序）。
 */
export function searchAirports<T extends SearchableAirport>(
  airports: readonly T[],
  query: string,
  limit: number
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const ranked: Array<{ airport: T; rank: number }> = [];
  for (const airport of airports) {
    const rank = matchRank(airport, q);
    if (rank !== null) ranked.push({ airport, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.airport);
}

function matchRank(airport: SearchableAirport, q: string): number | null {
  const iata = airport.iata.toLowerCase();
  if (iata === q) return 0;
  if (iata.startsWith(q)) return 1;
  const name = airport.name.toLowerCase();
  const city = (airport.city ?? '').toLowerCase();
  if (city.startsWith(q) || name.startsWith(q)) return 2;
  if (city.includes(q) || name.includes(q)) return 3;
  return null;
}
