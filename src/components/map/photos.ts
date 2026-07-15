import type { MapPhoto } from '@/actions';

/**
 * 地圖上的一個相片釘點：同一座標（四捨五入到小數四位，~11m）的相片集合。
 * EXIF GPS 精度到街廓，所以分群 bucket 從舊的 ~1km 收緊到 ~11m——否則整條街的相片會被
 * 併成同一顆釘子而看不出差異。座標更近的重疊由 marker cluster 在前端處理（見 TripMapCanvas）。
 * 顯示地名／國旗取自該群第一張有標籤的相片；photos 依拍攝時間新到舊排序供 gallery 檢視。
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
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * 把扁平的相片清單依座標分群成釘點。座標以第一張相片為準（同群座標僅差在小數五位以後）；
 * 各群內相片依拍攝時間新到舊排序。分群後依相片數量多到少排序，讓側欄與 marker 有穩定順序。
 * 沒有座標的相片（理論上不會出現在此，action 已濾掉）直接略過。
 */
export function groupPhotoPins(photos: MapPhoto[]): PhotoPin[] {
  const byCoord = new Map<string, PhotoPin>();
  for (const p of photos) {
    if (!p.location) continue;
    const { lat, lon } = p.location;
    const key = roundKey(lat, lon);
    const existing = byCoord.get(key);
    if (existing) {
      existing.photos.push(p);
    } else {
      byCoord.set(key, {
        id: key,
        lat,
        lon,
        name: p.name,
        countryCode: p.countryCode,
        photos: [p],
      });
    }
  }

  const pins = [...byCoord.values()];
  for (const pin of pins) {
    // 拍攝時間新到舊；缺 taken_at 者（空字串）排到最後。
    pin.photos.sort((a, b) => {
      const ta = a.taken_at ?? '';
      const tb = b.taken_at ?? '';
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    // 地名以群內第一張非空者為準（純 EXIF／未關聯行程日的相片沒有標籤）。
    if (!pin.name) {
      const named = pin.photos.find((p) => p.name);
      if (named) pin.name = named.name;
    }
  }
  return pins.sort((a, b) => b.photos.length - a.photos.length);
}
