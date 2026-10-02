import { describe, expect, it } from 'vitest';
import { groupFlightRoutes } from '@/components/map/flights';
import type { AirportEntry } from '@/hooks/queries/useCatalogs';

const airports: AirportEntry[] = [
  {
    iata: 'TPE',
    name: 'Taiwan Taoyuan International Airport',
    city: 'Taipei',
    country: 'TW',
    lat: 25.08,
    lon: 121.23,
  },
  {
    iata: 'HKG',
    name: 'Hong Kong International Airport',
    city: 'Hong Kong',
    country: 'HK',
    lat: 22.31,
    lon: 113.91,
  },
  {
    iata: 'NRT',
    name: 'Narita International Airport',
    city: 'Tokyo',
    country: 'JP',
    lat: 35.77,
    lon: 140.39,
  },
];

describe('flight map route grouping', () => {
  it('merges outbound and return records into one airport pair', () => {
    const routes = groupFlightRoutes(
      [
        { date: '2026-01-02', from_airport: 'TPE', to_airport: 'HKG' },
        { date: '2026-01-05', from_airport: 'HKG', to_airport: 'TPE' },
        { date: '2026-03-01', from_airport: 'TPE', to_airport: 'HKG' },
      ],
      airports,
      null
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      key: 'HKG-TPE',
      from: { iata: 'HKG', name: 'Hong Kong' },
      to: { iata: 'TPE', name: 'Taipei' },
      count: 3,
    });
  });

  it('applies the year filter and skips routes without known airport coordinates', () => {
    const routes = groupFlightRoutes(
      [
        { date: '2025-12-20', from_airport: 'TPE', to_airport: 'NRT' },
        { date: '2026-01-10', from_airport: 'NRT', to_airport: 'TPE' },
        { date: '2026-02-10', from_airport: 'TPE', to_airport: 'XXX' },
      ],
      airports,
      2026
    );

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ key: 'NRT-TPE', count: 1 });
  });
});
