import { describe, it, expect } from 'vitest';
import { groupPhotoPins } from '@/components/map/photos';
import type { MapPhoto } from '@/actions';

function photo(over: Partial<MapPhoto>): MapPhoto {
  return {
    key: 'receipts/t/a.jpg',
    contentType: 'image/jpeg',
    tripId: 't1',
    tripHashCode: 'abc123',
    description: '',
    date: '2026-01-01T00:00:00.000Z',
    lat: 35.6812,
    lon: 139.7671,
    name: 'Tokyo',
    countryCode: 'JP',
    ...over,
  };
}

describe('groupPhotoPins', () => {
  it('groups photos within ~1km (rounded to 2dp) into one pin', () => {
    const pins = groupPhotoPins([
      photo({ key: 'a', lat: 35.6812, lon: 139.7671 }),
      photo({ key: 'b', lat: 35.6819, lon: 139.7669 }), // same 2dp bucket
      photo({ key: 'c', lat: 34.6937, lon: 135.5023, name: 'Osaka', countryCode: 'JP' }),
    ]);
    expect(pins).toHaveLength(2);
    const tokyo = pins.find((p) => p.name === 'Tokyo');
    expect(tokyo?.photos).toHaveLength(2);
  });

  it('sorts pins by photo count desc and photos within a pin by date desc', () => {
    const pins = groupPhotoPins([
      photo({ key: 'osaka', lat: 34.69, lon: 135.5, name: 'Osaka' }),
      photo({ key: 't1', date: '2026-01-01T00:00:00.000Z' }),
      photo({ key: 't2', date: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(pins[0].name).toBe('Tokyo'); // 2 photos ranks first
    expect(pins[0].photos.map((p) => p.key)).toEqual(['t2', 't1']); // newest first
  });

  it('falls back to a non-empty name within the group when the first is blank', () => {
    const pins = groupPhotoPins([
      photo({ key: 'x', name: '' }),
      photo({ key: 'y', name: 'Tokyo' }),
    ]);
    expect(pins[0].name).toBe('Tokyo');
  });

  it('returns an empty array for no photos', () => {
    expect(groupPhotoPins([])).toEqual([]);
  });
});
