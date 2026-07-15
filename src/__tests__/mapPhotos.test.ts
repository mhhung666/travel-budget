import { describe, it, expect } from 'vitest';
import { groupPhotoPins } from '@/components/map/photos';
import type { MapPhoto } from '@/actions';

function photo(over: Partial<MapPhoto>): MapPhoto {
  return {
    id: 'p1',
    trip_id: 't1',
    tripHashCode: 'abc123',
    url: 'https://r2.example/photos/t1/p.jpg',
    thumb_url: 'https://r2.example/photos/t1/p_t.webp',
    content_type: 'image/jpeg',
    size: 1_000_000,
    width: 2560,
    height: 1440,
    taken_at: '2026-01-01T00:00:00.000Z',
    location: { lat: 35.6812, lon: 139.7671, source: 'exif' },
    place: null,
    exif: {},
    itinerary_day_id: null,
    caption: '',
    uploaded_by_id: 'u1',
    uploaded_by_name: 'Alice',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    name: 'Tokyo',
    countryCode: 'JP',
    ...over,
  };
}

describe('groupPhotoPins', () => {
  it('merges photos at essentially the same spot (~11m, rounded to 4dp)', () => {
    const pins = groupPhotoPins([
      photo({ id: 'a', location: { lat: 35.6812, lon: 139.7671, source: 'exif' } }),
      // differs only past the 4th decimal → same bucket
      photo({ id: 'b', location: { lat: 35.68123, lon: 139.76714, source: 'exif' } }),
      photo({
        id: 'c',
        location: { lat: 34.6937, lon: 135.5023, source: 'exif' },
        name: 'Osaka',
      }),
    ]);
    expect(pins).toHaveLength(2);
    const tokyo = pins.find((p) => p.name === 'Tokyo');
    expect(tokyo?.photos).toHaveLength(2);
  });

  it('keeps nearby-but-distinct spots on the same street as separate pins', () => {
    // ~145m apart: 3rd decimal differs → different 4dp bucket. The old ~1km bucket
    // would have wrongly merged these; the whole point of Phase 3 is not to.
    const pins = groupPhotoPins([
      photo({ id: 'a', location: { lat: 35.6812, lon: 139.7671, source: 'exif' } }),
      photo({ id: 'b', location: { lat: 35.6825, lon: 139.7671, source: 'exif' } }),
    ]);
    expect(pins).toHaveLength(2);
  });

  it('sorts pins by photo count desc and photos within a pin by taken_at desc', () => {
    const pins = groupPhotoPins([
      photo({ id: 'osaka', location: { lat: 34.69, lon: 135.5, source: 'exif' }, name: 'Osaka' }),
      photo({ id: 't1', taken_at: '2026-01-01T00:00:00.000Z' }),
      photo({ id: 't2', taken_at: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(pins[0].name).toBe('Tokyo'); // 2 photos ranks first
    expect(pins[0].photos.map((p) => p.id)).toEqual(['t2', 't1']); // newest first
  });

  it('falls back to a non-empty label within the group when the first is blank', () => {
    const pins = groupPhotoPins([photo({ id: 'x', name: '' }), photo({ id: 'y', name: 'Tokyo' })]);
    expect(pins[0].name).toBe('Tokyo');
  });

  it('skips photos without a location and returns empty for none', () => {
    expect(groupPhotoPins([])).toEqual([]);
    expect(groupPhotoPins([photo({ id: 'z', location: null })])).toEqual([]);
  });
});
