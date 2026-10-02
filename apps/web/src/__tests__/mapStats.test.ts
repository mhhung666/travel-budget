import { describe, expect, it } from 'vitest';
import { computeMapStats, visitedCountrySet } from '@/components/map/stats';
import type { FlightSegment, TripDestinationPoint } from '@/components/map/types';

const destinations: TripDestinationPoint[] = [
  {
    id: 'trip-1',
    tripName: 'Tokyo',
    startDate: '2026-04-01',
    endDate: '2026-04-05',
    name: 'Tokyo',
    lat: 35.68,
    lon: 139.69,
    countryCode: 'jp',
  },
];

const flights: FlightSegment[] = [
  {
    key: 'TPE-NRT',
    from: { iata: 'TPE', name: 'Taipei', lat: 25.08, lon: 121.23, country: 'TW' },
    to: { iata: 'NRT', name: 'Tokyo', lat: 35.77, lon: 140.39, country: 'JP' },
    count: 2,
  },
];

describe('map stats data boundaries', () => {
  it('counts destinations and itinerary places while deriving distance only from flights', () => {
    const stats = computeMapStats(
      3,
      destinations,
      [{ lat: 34.69, lon: 135.5, weight: 2, countryCode: 'JP' }],
      flights
    );

    expect(stats.trips).toBe(3);
    expect(stats.countries).toBe(1);
    expect(stats.cities).toBe(2);
    expect(stats.distanceKm).toBeGreaterThan(4000);
    expect(stats.distanceKm).toBeLessThan(5000);
  });

  it('does not invent distance when a trip has only a destination', () => {
    expect(computeMapStats(1, destinations, []).distanceKm).toBe(0);
    expect([...visitedCountrySet(destinations, [])]).toEqual(['JP']);
  });
});
