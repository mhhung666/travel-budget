import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MapStatsBar from '@/components/map/MapStatsBar';

afterEach(cleanup);

const stats = { trips: 2, countries: 0, plannedCountries: 1, cities: 0, distanceKm: 0 };

describe('map stats labels', () => {
  it('names each scope on the private map, where planned trips are excluded from places', () => {
    render(<MapStatsBar stats={stats} compact distinguishPlanned />);
    expect(screen.getByText('statTripsCreated')).toBeInTheDocument();
    expect(screen.getByText('statCountriesVisited')).toBeInTheDocument();
    expect(screen.getByText('statCitiesVisited')).toBeInTheDocument();
    expect(screen.queryByText('statCountries')).not.toBeInTheDocument();
  });

  it('keeps the plain labels on the public map, which does not separate planned trips', () => {
    render(<MapStatsBar stats={stats} showDistance={false} />);
    expect(screen.getByText('statTrips')).toBeInTheDocument();
    expect(screen.getByText('statCountries')).toBeInTheDocument();
    expect(screen.getByText('statCities')).toBeInTheDocument();
    expect(screen.queryByText('statCountriesVisited')).not.toBeInTheDocument();
  });
});
