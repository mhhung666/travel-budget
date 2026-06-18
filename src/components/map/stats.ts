import type { TripRoute, HeatPoint } from './types';
import { haversineKm } from './arc';

/** 旅程數據儀表板的彙總數字。 */
export interface MapStats {
  /** 旅程數（有上圖的）。 */
  trips: number;
  /** 造訪過的國家數（依路線的出發/目的地國碼去重）。 */
  countries: number;
  /** 造訪過的城市/地點數（行程日地點，依座標去重）。 */
  cities: number;
  /** 總里程（公里）：各旅程出發→目的地的大圓距離累加。 */
  distanceKm: number;
}

/**
 * 由路線與熱點地點彙總出儀表板數字。國家數來自路線國碼（熱點去識別化時可能無國碼），
 * 城市數來自熱點地點（= 行程日地點，已依座標去重），里程由有完整起訖座標的路線累加。
 */
export function computeMapStats(routes: TripRoute[], heatPoints: HeatPoint[]): MapStats {
  const countrySet = new Set<string>();
  let distanceKm = 0;
  for (const r of routes) {
    if (r.departure?.countryCode) countrySet.add(r.departure.countryCode.toUpperCase());
    if (r.destination?.countryCode) countrySet.add(r.destination.countryCode.toUpperCase());
    if (r.departure && r.destination) {
      distanceKm += haversineKm(
        [r.departure.lat, r.departure.lon],
        [r.destination.lat, r.destination.lon]
      );
    }
  }
  return {
    trips: routes.length,
    countries: countrySet.size,
    cities: heatPoints.length,
    distanceKm: Math.round(distanceKm),
  };
}

/** 造訪過的國家代碼集合（大寫 alpha-2），供「國家點亮地圖」上色。 */
export function visitedCountrySet(routes: TripRoute[], heatPoints: HeatPoint[]): Set<string> {
  const set = new Set<string>();
  for (const r of routes) {
    if (r.departure?.countryCode) set.add(r.departure.countryCode.toUpperCase());
    if (r.destination?.countryCode) set.add(r.destination.countryCode.toUpperCase());
  }
  for (const p of heatPoints) {
    if (p.countryCode) set.add(p.countryCode.toUpperCase());
  }
  return set;
}
