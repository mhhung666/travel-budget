import type { AirportEntry } from '@/hooks/queries/useCatalogs';
import type { FlightRecordItem } from '@/types';
import type { AirportPoint, FlightSegment } from './types';

type FlightRouteRecord = Pick<FlightRecordItem, 'date' | 'from_airport' | 'to_airport'>;

/**
 * 將有方向的飛行紀錄彙整為無方向的機場配對。
 *
 * 飛行地圖是終身足跡總覽，預設不強調單次去／回程；把 TPE→HKG 與 HKG→TPE
 * 合併成 TPE⇄HKG，可避免兩條完全重疊的線與方向圖示造成視覺雜訊。
 */
export function groupFlightRoutes(
  flights: FlightRouteRecord[],
  airports: AirportEntry[],
  selectedYear: number | null
): FlightSegment[] {
  const byIata = new Map(airports.map((airport) => [airport.iata.toUpperCase(), airport]));
  const toPoint = (iata: string): AirportPoint | null => {
    const airport = byIata.get(iata);
    return airport
      ? {
          iata,
          name: airport.city ?? airport.name,
          lat: airport.lat,
          lon: airport.lon,
          country: airport.country,
        }
      : null;
  };

  const routes = new Map<string, FlightSegment>();
  for (const flight of flights) {
    if (!flight.from_airport || !flight.to_airport) continue;
    if (selectedYear !== null && flight.date.slice(0, 4) !== String(selectedYear)) continue;

    const endpoints = [flight.from_airport.toUpperCase(), flight.to_airport.toUpperCase()].sort();
    const [fromIata, toIata] = endpoints;
    if (fromIata === toIata) continue;

    const key = `${fromIata}-${toIata}`;
    const current = routes.get(key);
    if (current) {
      current.count += 1;
      continue;
    }

    const from = toPoint(fromIata);
    const to = toPoint(toIata);
    if (!from || !to) continue;
    routes.set(key, { key, from, to, count: 1 });
  }

  return [...routes.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
