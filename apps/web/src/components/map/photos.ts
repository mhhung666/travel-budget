import type { MapPhoto } from '@/actions';

/**
 * 地圖上的一個相片釘點：拍攝位置相近（質心 50m 內）的相片集合。
 * EXIF GPS 幾乎不會兩張全同、且自帶 5–15m 誤差，所以分群用貪心距離分群而非座標網格——
 * 舊的 toFixed(4) 網格（~11m）除了格子太細，還有邊界問題：只差 1–2m 的兩張相片若跨在
 * 網格線兩側會被拆成兩顆釘。更遠釘點在低縮放的視覺重疊交由 marker cluster 處理
 * （見 TripMapCanvas 的 PhotoPinsLayer）。
 * 顯示地名／國旗取群內第一張有標籤的相片；photos 依拍攝時間新到舊排序供 gallery 檢視。
 */
export interface PhotoPin {
  /** 質心座標 key（小數五位）作為 render key。 */
  id: string;
  /** 群內相片座標的質心。 */
  lat: number;
  lon: number;
  name: string;
  countryCode?: string;
  photos: MapPhoto[];
}

/**
 * 側欄的一個相片地區。地圖需要街廓級釘點，但清單只需要讓使用者快速理解「在哪些地方
 * 拍過照」，所以側欄會把多顆釘點再彙整成較大的閱讀單位。
 */
export interface PhotoArea extends PhotoPin {
  /** 這個地區包含的精細地圖釘點數。 */
  spotCount: number;
}

/** 相片釘點合併半徑（公尺）：與既有釘點質心距離在此內的相片併入該釘。 */
export const PIN_MERGE_RADIUS_M = 50;

/** 無地名釘點歸入鄰近地區的半徑。這只影響側欄，完全不改變地圖上的精確釘點。 */
export const PHOTO_AREA_RADIUS_M = 10_000;

const M_PER_DEG_LAT = 111_320;

/** 等距圓柱近似的兩點距離（公尺）。百公尺尺度下誤差可忽略，不需完整 haversine。 */
function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * M_PER_DEG_LAT;
  const dLon = (bLon - aLon) * M_PER_DEG_LAT * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/** 拍攝時間新到舊；缺 taken_at 者（空字串）排到最後。 */
function byTakenAtDesc(a: MapPhoto, b: MapPhoto): number {
  const ta = a.taken_at ?? '';
  const tb = b.taken_at ?? '';
  return ta < tb ? 1 : ta > tb ? -1 : 0;
}

/** 分群過程中的工作群：質心用累加和算，避免每併一張就重掃全群。 */
interface WorkingGroup {
  sumLat: number;
  sumLon: number;
  photos: MapPhoto[];
}

function finishPin({ sumLat, sumLon, photos }: WorkingGroup): PhotoPin {
  const lat = sumLat / photos.length;
  const lon = sumLon / photos.length;
  photos.sort(byTakenAtDesc);
  // 地名／國旗以群內第一張非空者為準（純 EXIF／未關聯行程日的相片沒有標籤）。
  return {
    id: `${lat.toFixed(5)},${lon.toFixed(5)}`,
    lat,
    lon,
    name: photos.find((p) => p.name)?.name ?? '',
    countryCode: photos.find((p) => p.countryCode)?.countryCode,
    photos,
  };
}

/**
 * 把扁平的相片清單依拍攝位置分群成釘點：逐張找質心距離 ≤ PIN_MERGE_RADIUS_M 的最近
 * 既有群併入（並更新質心），否則自成新群。O(n × 群數)，相簿等級的量級足夠。
 * 貪心 + 質心錨定讓群不會沿著一長串相片無限鏈延（每張都得離「群心」50m 內）。
 * 各群內相片依拍攝時間新到舊排序；分群後依相片數量多到少排序，讓側欄與 marker 有穩定順序。
 * 沒有座標的相片（理論上不會出現在此，action 已濾掉）直接略過。
 */
export function groupPhotoPins(photos: MapPhoto[]): PhotoPin[] {
  const groups: WorkingGroup[] = [];
  for (const p of photos) {
    if (!p.location) continue;
    const { lat, lon } = p.location;
    let best: WorkingGroup | null = null;
    let bestDist = PIN_MERGE_RADIUS_M;
    for (const g of groups) {
      const n = g.photos.length;
      const d = distanceMeters(g.sumLat / n, g.sumLon / n, lat, lon);
      if (d <= bestDist) {
        best = g;
        bestDist = d;
      }
    }
    if (best) {
      best.sumLat += lat;
      best.sumLon += lon;
      best.photos.push(p);
    } else {
      groups.push({ sumLat: lat, sumLon: lon, photos: [p] });
    }
  }
  return groups.map(finishPin).sort((a, b) => b.photos.length - a.photos.length);
}

/**
 * 把多顆釘點合併成一顆臨時釘點——cluster 在最大縮放被點擊時，直接開整組相片的
 * gallery 用（取代 spiderfy 散開成一堆單張卡片）。質心以相片數加權；
 * 名稱／國旗取相片數最多且有標籤的釘點。
 */
export function mergePhotoPins(pins: PhotoPin[]): PhotoPin {
  if (pins.length === 1) return pins[0];
  const photos = pins.flatMap((p) => p.photos).sort(byTakenAtDesc);
  let sumLat = 0;
  let sumLon = 0;
  for (const p of pins) {
    sumLat += p.lat * p.photos.length;
    sumLon += p.lon * p.photos.length;
  }
  const ranked = [...pins].sort((a, b) => b.photos.length - a.photos.length);
  return {
    id: ranked.map((p) => p.id).join('|'),
    lat: sumLat / photos.length,
    lon: sumLon / photos.length,
    name: ranked.find((p) => p.name)?.name ?? '',
    countryCode: ranked.find((p) => p.countryCode)?.countryCode,
    photos,
  };
}

interface WorkingArea {
  id: string;
  name: string;
  countryCode?: string;
  pins: PhotoPin[];
}

function areaCentroid(area: WorkingArea): { lat: number; lon: number } {
  let sumLat = 0;
  let sumLon = 0;
  let count = 0;
  for (const pin of area.pins) {
    sumLat += pin.lat * pin.photos.length;
    sumLon += pin.lon * pin.photos.length;
    count += pin.photos.length;
  }
  return { lat: sumLat / count, lon: sumLon / count };
}

function finishArea(area: WorkingArea): PhotoArea {
  const pin = mergePhotoPins(area.pins);
  return {
    ...pin,
    id: area.id,
    name: area.name,
    countryCode: area.countryCode ?? pin.countryCode,
    spotCount: area.pins.length,
  };
}

/**
 * 將精細相片釘點整理成適合側欄閱讀的地區：
 *
 * 1. 同國家、同地名的釘點直接合併（例如散落在曼谷各處但都標為「曼谷」）。
 * 2. 無地名釘點若離既有命名地區 10km 內，歸入最近的地區。
 * 3. 其餘無地名釘點彼此依 10km 質心距離分群，保留為未命名地區。
 *
 * 地圖仍使用原始 `PhotoPin[]`，因此這層彙整不會犧牲定位精度。
 */
export function groupPhotoAreas(pins: PhotoPin[]): PhotoArea[] {
  const namedByKey = new Map<string, WorkingArea>();
  const unnamedPins: PhotoPin[] = [];

  for (const pin of pins) {
    const name = pin.name.trim();
    if (!name) {
      unnamedPins.push(pin);
      continue;
    }
    const countryCode = pin.countryCode?.toUpperCase();
    const key = `${countryCode ?? ''}:${name.toLocaleLowerCase()}`;
    const existing = namedByKey.get(key);
    if (existing) {
      existing.pins.push(pin);
    } else {
      namedByKey.set(key, {
        id: `place:${key}`,
        name,
        countryCode,
        pins: [pin],
      });
    }
  }

  const areas = [...namedByKey.values()];
  for (const pin of unnamedPins) {
    let closest: WorkingArea | null = null;
    let closestDistance = PHOTO_AREA_RADIUS_M;
    for (const area of areas) {
      const centroid = areaCentroid(area);
      const distance = distanceMeters(centroid.lat, centroid.lon, pin.lat, pin.lon);
      if (distance <= closestDistance) {
        closest = area;
        closestDistance = distance;
      }
    }
    if (closest) {
      closest.pins.push(pin);
    } else {
      areas.push({
        id: `near:${pin.id}`,
        name: '',
        countryCode: pin.countryCode?.toUpperCase(),
        pins: [pin],
      });
    }
  }

  return areas
    .map(finishArea)
    .sort((a, b) => b.photos.length - a.photos.length || a.name.localeCompare(b.name));
}
