import { describe, it, expect } from 'vitest';
import { groupPhotoAreas, groupPhotoPins, mergePhotoPins } from '@/components/map/photos';
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
    taken_local_date: '2026-01-01',
    taken_date_source: 'exif',
    location: { lat: 35.6812, lon: 139.7671, source: 'exif' },
    place: null,
    exif: {},
    itinerary_day_id: null,
    itinerary_day_source: null,
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

// 緯度 1 度 ≈ 111.32km → 0.0001 度 ≈ 11.1m。下面的距離註解都以此換算。
describe('groupPhotoPins', () => {
  it('merges photos within ~50m of each other (EXIF GPS never matches exactly)', () => {
    const pins = groupPhotoPins([
      photo({ id: 'a', location: { lat: 35.6812, lon: 139.7671, source: 'exif' } }),
      // ~33m 北邊：舊 4dp 網格會拆成兩顆釘，距離分群要合併
      photo({ id: 'b', location: { lat: 35.6815, lon: 139.7671, source: 'exif' } }),
      photo({
        id: 'c',
        location: { lat: 34.6937, lon: 135.5023, source: 'exif' },
        name: 'Osaka',
      }),
    ]);
    expect(pins).toHaveLength(2);
    const tokyo = pins.find((p) => p.name === 'Tokyo');
    expect(tokyo?.photos.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('merges photos straddling the old 4dp grid boundary (~2m apart)', () => {
    // 35.68115 vs 35.68125：toFixed(4) 分屬 35.6812／35.6813（rounding half-up），
    // 實際只差 ~11m；再取更近的一對（差 ~2m 但跨網格線）驗證邊界問題已消失。
    const pins = groupPhotoPins([
      photo({ id: 'a', location: { lat: 35.681249, lon: 139.7671, source: 'exif' } }),
      photo({ id: 'b', location: { lat: 35.681251, lon: 139.7671, source: 'exif' } }),
    ]);
    expect(pins).toHaveLength(1);
    expect(pins[0].photos).toHaveLength(2);
  });

  it('keeps spots farther than 50m apart as separate pins', () => {
    // ~145m apart：同一條街的不同地點，不該併成一顆釘。
    const pins = groupPhotoPins([
      photo({ id: 'a', location: { lat: 35.6812, lon: 139.7671, source: 'exif' } }),
      photo({ id: 'b', location: { lat: 35.6825, lon: 139.7671, source: 'exif' } }),
    ]);
    expect(pins).toHaveLength(2);
  });

  it('anchors merging to the group centroid so chains cannot stretch forever', () => {
    // a=0m、b=+44m：質心 22m。c=+89m 離質心 67m > 50m → 自成新群，
    // 即使 c 離 b 只有 44m（純鏈式分群會把三張全併）。
    const pins = groupPhotoPins([
      photo({ id: 'a', location: { lat: 35.6812, lon: 139.7671, source: 'exif' } }),
      photo({ id: 'b', location: { lat: 35.6816, lon: 139.7671, source: 'exif' } }),
      photo({ id: 'c', location: { lat: 35.682, lon: 139.7671, source: 'exif' } }),
    ]);
    expect(pins).toHaveLength(2);
  });

  it('places the pin at the centroid of its photos', () => {
    const pins = groupPhotoPins([
      photo({ id: 'a', location: { lat: 35.6812, lon: 139.7671, source: 'exif' } }),
      photo({ id: 'b', location: { lat: 35.6814, lon: 139.7673, source: 'exif' } }),
    ]);
    expect(pins).toHaveLength(1);
    expect(pins[0].lat).toBeCloseTo(35.6813, 6);
    expect(pins[0].lon).toBeCloseTo(139.7672, 6);
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

describe('mergePhotoPins', () => {
  it('returns the pin as-is when there is only one', () => {
    const [pin] = groupPhotoPins([photo({ id: 'a' })]);
    expect(mergePhotoPins([pin])).toBe(pin);
  });

  it('combines photos newest-first and takes name/flag from the largest labeled pin', () => {
    const pins = groupPhotoPins([
      photo({
        id: 'solo',
        location: { lat: 35.69, lon: 139.7671, source: 'exif' },
        taken_at: '2026-05-01T00:00:00.000Z',
        name: '',
        countryCode: undefined,
      }),
      photo({ id: 't1', taken_at: '2026-01-01T00:00:00.000Z' }),
      photo({ id: 't2', taken_at: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(pins).toHaveLength(2);
    const merged = mergePhotoPins(pins);
    expect(merged.photos.map((p) => p.id)).toEqual(['solo', 't2', 't1']);
    expect(merged.name).toBe('Tokyo');
    expect(merged.countryCode).toBe('JP');
    // 質心以相片數加權：(35.6812×2 + 35.69×1) / 3
    expect(merged.lat).toBeCloseTo((35.6812 * 2 + 35.69) / 3, 6);
  });
});

describe('groupPhotoAreas', () => {
  it('combines same-named spots into one sidebar area without changing photo count', () => {
    const pins = groupPhotoPins([
      photo({ id: 'tokyo-1' }),
      photo({
        id: 'tokyo-2',
        location: { lat: 35.69, lon: 139.78, source: 'exif' },
      }),
      photo({
        id: 'airport',
        location: { lat: 35.8, lon: 140, source: 'exif' },
        name: 'Airport',
      }),
    ]);

    const areas = groupPhotoAreas(pins);
    expect(areas).toHaveLength(2);
    expect(areas.find((area) => area.name === 'Tokyo')).toMatchObject({
      spotCount: 2,
    });
    expect(areas.find((area) => area.name === 'Tokyo')?.photos).toHaveLength(2);
  });

  it('keeps same-named places in different countries separate', () => {
    const pins = groupPhotoPins([
      photo({ id: 'a', name: 'Springfield', countryCode: 'US' }),
      photo({
        id: 'b',
        name: 'Springfield',
        countryCode: 'CA',
        location: { lat: 45, lon: -75, source: 'exif' },
      }),
    ]);

    expect(groupPhotoAreas(pins)).toHaveLength(2);
  });

  it('attaches an unnamed nearby GPS spot to the nearest named area', () => {
    const pins = groupPhotoPins([
      photo({ id: 'named' }),
      photo({
        id: 'nearby',
        name: '',
        countryCode: undefined,
        location: { lat: 35.7, lon: 139.77, source: 'exif' },
      }),
    ]);

    const areas = groupPhotoAreas(pins);
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ name: 'Tokyo', spotCount: 2 });
    expect(areas[0].photos).toHaveLength(2);
  });

  it('keeps a far-away unnamed GPS spot as its own area', () => {
    const pins = groupPhotoPins([
      photo({ id: 'named' }),
      photo({
        id: 'far',
        name: '',
        countryCode: undefined,
        location: { lat: 34.69, lon: 135.5, source: 'exif' },
      }),
    ]);

    const areas = groupPhotoAreas(pins);
    expect(areas).toHaveLength(2);
    expect(areas.find((area) => area.name === '')).toMatchObject({ spotCount: 1 });
  });
});
