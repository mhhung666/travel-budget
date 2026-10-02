import airportRows from '../../public/data/airports.json';

export interface AirportCatalogPoint {
  iata: string;
  lat: number;
  lon: number;
  countryCode?: string;
}

const airports = new Map(
  airportRows.map((airport) => [
    airport.iata,
    {
      iata: airport.iata,
      lat: airport.lat,
      lon: airport.lon,
      countryCode: airport.country || undefined,
    } satisfies AirportCatalogPoint,
  ])
);

/** Server-safe IATA lookup shared by annual statistics and other calculations. */
export function airportPoint(iata: string | null | undefined): AirportCatalogPoint | null {
  return iata ? (airports.get(iata.toUpperCase()) ?? null) : null;
}
