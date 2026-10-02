import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { computeMapStats, plannedCountrySet, visitedCountrySet } from '@/components/map/stats';
import type { TripDestinationPoint } from '@/components/map/types';
import { isPlannedTrip } from '@/lib/tripStatus';
import type { TripWithMembers } from '@/types';

const read = <T,>(data: T) => ({
  data,
  error: null,
  isError: false,
  isPending: false,
  isFetching: false,
  isPaused: false,
  status: 'success',
  fetchStatus: 'idle',
  refetch: vi.fn(),
});

vi.mock('@/hooks/queries', () => ({
  useVisitedPlaces: () =>
    read([{ lat: 35.68, lon: 139.69, name: 'Tokyo', countryCode: 'JP', weight: 2, planned: true }]),
  useMapPhotos: () => read([]),
  useCollections: () => read({ flights: [], stays: [], countries: [] }),
  useAirports: () => read([]),
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="map-canvas" /> }));
vi.mock('@/components/map/MapShareDialog', () => ({ default: () => null }));
vi.mock('@/components/map/PhotoPinDialog', () => ({ default: () => null }));
vi.mock('@/components/collections/DeferredDialogs', () => ({
  FlightRecordDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">flight-form</div> : null,
}));

const NOW = new Date(2026, 8, 17, 12);

afterEach(cleanup);

describe('isPlannedTrip', () => {
  it('treats trips as footprints from their departure day onwards', () => {
    expect(isPlannedTrip('2026-09-18', '2026-09-20', NOW)).toBe(true);
    expect(isPlannedTrip(null, null, NOW)).toBe(true);
    expect(isPlannedTrip('2026-09-17', '2026-09-20', NOW)).toBe(false);
    expect(isPlannedTrip('2026-03-01', '2026-03-05', NOW)).toBe(false);
    expect(isPlannedTrip(null, '2026-03-05', NOW)).toBe(false);
  });
});

describe('map stats with planned trips', () => {
  const point = (countryCode: string, planned: boolean, lat: number): TripDestinationPoint => ({
    id: `${countryCode}-${lat}`,
    tripName: countryCode,
    startDate: null,
    endDate: null,
    name: countryCode,
    lat,
    lon: 120,
    countryCode,
    planned,
  });

  it('counts only departed trips as visited and lists planned-only countries separately', () => {
    const destinations = [point('JP', false, 35), point('JP', true, 34), point('KR', true, 37)];
    const heat = [{ lat: 1, lon: 103, weight: 1, countryCode: 'SG', planned: true }];

    const stats = computeMapStats(3, destinations, heat);
    expect(stats.countries).toBe(1);
    expect(stats.cities).toBe(1);
    expect(stats.plannedCountries).toBe(2);
    expect([...visitedCountrySet(destinations, heat)]).toEqual(['JP']);
    expect([...plannedCountrySet(destinations, heat)].sort()).toEqual(['KR', 'SG']);
  });

  it('keeps the public map (no planned flag) counting everything as visited', () => {
    const stats = computeMapStats(1, [], [{ lat: 35, lon: 139, weight: 1, countryCode: 'JP' }]);
    expect(stats.countries).toBe(1);
    expect(stats.plannedCountries).toBe(0);
  });
});

describe('TripMapView planned footprint and flight entry', () => {
  const trips = [
    {
      id: 'trip-1',
      name: 'Tokyo',
      start_date: '2099-01-01',
      end_date: '2099-01-05',
      destination_location: { name: 'Tokyo', lat: 35.68, lon: 139.69, country_code: 'JP' },
    },
  ] as unknown as TripWithMembers[];

  it('does not count a trip that has not started, and marks its country as planned', async () => {
    const user = userEvent.setup();
    const { default: TripMapView } = await import('@/components/map/TripMapView');
    render(<TripMapView trips={trips} loading={false} error="" />);

    expect(screen.getByText('statPlannedCountries')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'modeCountries' }));
    expect(screen.getByText('countryPlanned')).toBeInTheDocument();
  });

  it('opens the flight form straight from the empty flight list', async () => {
    const user = userEvent.setup();
    const { default: TripMapView } = await import('@/components/map/TripMapView');
    render(<TripMapView trips={trips} loading={false} error="" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'flights.addFlight' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('flight-form');
  });
});
