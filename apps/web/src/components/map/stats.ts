import type { FlightSegment, HeatPoint, TripDestinationPoint } from './types';
import { haversineKm } from './arc';

/** 旅程數據儀表板的彙總數字。 */
export interface MapStats {
  /** 旅程數（有上圖的）。 */
  trips: number;
  /** 造訪過的國家數（只算已出發旅程的目的地與行程日地點，依國碼去重）。 */
  countries: number;
  /** 只出現在計畫中旅程、還沒去過的國家數。 */
  plannedCountries: number;
  /** 造訪過的城市/地點數（已出發旅程的目的地 + 行程日地點，依座標去重）。 */
  cities: number;
  /** 飛行里程（公里）：FlightRecord 航線距離乘上往返合計次數。 */
  distanceKm: number;
}

type CountrySource = { countryCode?: string; planned?: boolean };

/**
 * 由旅行目的地、行程地點與飛行航線彙總儀表板數字。
 * 計畫中（尚未出發）的地點不算足跡，只另計「計畫中國家」。
 */
export function computeMapStats(
  trips: number,
  destinations: TripDestinationPoint[],
  heatPoints: HeatPoint[],
  flightSegments: FlightSegment[] = []
): MapStats {
  const citySet = new Set<string>();
  let distanceKm = 0;
  for (const point of [...destinations, ...heatPoints]) {
    if (!point.planned) citySet.add(`${point.lat.toFixed(2)},${point.lon.toFixed(2)}`);
  }
  for (const segment of flightSegments) {
    distanceKm +=
      haversineKm([segment.from.lat, segment.from.lon], [segment.to.lat, segment.to.lon]) *
      segment.count;
  }
  const visited = visitedCountrySet(destinations, heatPoints);
  return {
    trips,
    countries: visited.size,
    plannedCountries: plannedCountrySet(destinations, heatPoints).size,
    cities: citySet.size,
    distanceKm: Math.round(distanceKm),
  };
}

function countryCodes(sources: CountrySource[], planned: boolean): Set<string> {
  const set = new Set<string>();
  for (const source of sources) {
    if (source.countryCode && !!source.planned === planned) {
      set.add(source.countryCode.toUpperCase());
    }
  }
  return set;
}

/** 造訪過的國家代碼集合（大寫 alpha-2），供「國家點亮地圖」上色。 */
export function visitedCountrySet(
  destinations: TripDestinationPoint[],
  heatPoints: HeatPoint[]
): Set<string> {
  return countryCodes([...destinations, ...heatPoints], false);
}

/** 只出現在計畫中旅程的國家（已造訪過的不重複列入），地圖以淡色標示。 */
export function plannedCountrySet(
  destinations: TripDestinationPoint[],
  heatPoints: HeatPoint[]
): Set<string> {
  const sources = [...destinations, ...heatPoints];
  const visited = countryCodes(sources, false);
  return new Set([...countryCodes(sources, true)].filter((code) => !visited.has(code)));
}
