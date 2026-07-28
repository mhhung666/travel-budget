import type { FlightSegment, HeatPoint, TripDestinationPoint } from './types';
import { haversineKm } from './arc';

/** 旅程數據儀表板的彙總數字。 */
export interface MapStats {
  /** 旅程數（有上圖的）。 */
  trips: number;
  /** 造訪過的國家數（依旅行目的地與行程日地點國碼去重）。 */
  countries: number;
  /** 造訪過的城市/地點數（旅行目的地 + 行程日地點，依座標去重）。 */
  cities: number;
  /** 飛行里程（公里）：FlightRecord 航線距離乘上往返合計次數。 */
  distanceKm: number;
}

/**
 * 由旅行目的地、行程地點與飛行航線彙總儀表板數字。
 */
export function computeMapStats(
  trips: number,
  destinations: TripDestinationPoint[],
  heatPoints: HeatPoint[],
  flightSegments: FlightSegment[] = []
): MapStats {
  const countrySet = new Set<string>();
  const citySet = new Set<string>();
  let distanceKm = 0;
  for (const destination of destinations) {
    if (destination.countryCode) countrySet.add(destination.countryCode.toUpperCase());
    citySet.add(`${destination.lat.toFixed(2)},${destination.lon.toFixed(2)}`);
  }
  for (const point of heatPoints) {
    if (point.countryCode) countrySet.add(point.countryCode.toUpperCase());
    citySet.add(`${point.lat.toFixed(2)},${point.lon.toFixed(2)}`);
  }
  for (const segment of flightSegments) {
    distanceKm +=
      haversineKm([segment.from.lat, segment.from.lon], [segment.to.lat, segment.to.lon]) *
      segment.count;
  }
  return {
    trips,
    countries: countrySet.size,
    cities: citySet.size,
    distanceKm: Math.round(distanceKm),
  };
}

/** 造訪過的國家代碼集合（大寫 alpha-2），供「國家點亮地圖」上色。 */
export function visitedCountrySet(
  destinations: TripDestinationPoint[],
  heatPoints: HeatPoint[]
): Set<string> {
  const set = new Set<string>();
  for (const destination of destinations) {
    if (destination.countryCode) set.add(destination.countryCode.toUpperCase());
  }
  for (const p of heatPoints) {
    if (p.countryCode) set.add(p.countryCode.toUpperCase());
  }
  return set;
}
