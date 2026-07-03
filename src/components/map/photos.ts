import type { MapPhoto } from '@/actions';

/**
 * 地圖上的一個相片釘點：同一座標（四捨五入到小數兩位，~1km，與熱點分群一致）的相片集合。
 * 顯示地名/國旗取自該群第一張相片；photos 依日期新到舊排序供 gallery 檢視。
 */
export interface PhotoPin {
  /** `${lat},${lon}`（四捨五入後）作為 render key。 */
  id: string;
  lat: number;
  lon: number;
  name: string;
  countryCode?: string;
  photos: MapPhoto[];
}

function roundKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * 把扁平的相片清單依座標分群成釘點。座標以第一張相片為準（同群座標僅差在小數三位以後）；
 * 各群內相片依日期新到舊排序。分群後依相片數量多到少排序，讓側欄與 marker 有穩定順序。
 */
export function groupPhotoPins(photos: MapPhoto[]): PhotoPin[] {
  const byCoord = new Map<string, PhotoPin>();
  for (const p of photos) {
    const key = roundKey(p.lat, p.lon);
    const existing = byCoord.get(key);
    if (existing) {
      existing.photos.push(p);
    } else {
      byCoord.set(key, {
        id: key,
        lat: p.lat,
        lon: p.lon,
        name: p.name,
        countryCode: p.countryCode,
        photos: [p],
      });
    }
  }

  const pins = [...byCoord.values()];
  for (const pin of pins) {
    pin.photos.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    // 地名以群內第一張非空者為準（去識別化/舊資料可能缺名）。
    if (!pin.name) {
      const named = pin.photos.find((p) => p.name);
      if (named) pin.name = named.name;
    }
  }
  return pins.sort((a, b) => b.photos.length - a.photos.length);
}
