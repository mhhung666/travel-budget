import { beforeEach, describe, expect, it, vi } from 'vitest';

const dayFind = vi.fn();
const photoFind = vi.fn();
const photoBulkWrite = vi.fn();

vi.mock('@/models', () => ({
  ItineraryDay: { find: (...args: unknown[]) => dayFind(...args) },
  Photo: {
    find: (...args: unknown[]) => photoFind(...args),
    bulkWrite: (...args: unknown[]) => photoBulkWrite(...args),
  },
}));

import {
  autoItineraryFields,
  buildItineraryDayDateMap,
  rebindAutoPhotosToItinerary,
  type PhotoItineraryDay,
} from '@/lib/photoItinerary';

const TRIP_ID = '507f1f77bcf86cd799439011';
const id = (value: string) => ({ toString: () => value });
const DAY_1 = id('507f1f77bcf86cd799439012');
const DAY_2 = id('507f1f77bcf86cd799439013');
const PHOTO_1 = id('507f1f77bcf86cd799439014');

const chainSortSelectLean = (value: unknown) => ({
  sort: () => ({ select: () => ({ lean: () => Promise.resolve(value) }) }),
});
const chainSelectLean = (value: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(value) }),
});

const days: PhotoItineraryDay[] = [
  { _id: DAY_1, dayNumber: 1, location: { lat: 48.85, lon: 2.35 } },
  { _id: DAY_2, dayNumber: 2, location: { lat: 50.85, lon: 4.35 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  dayFind.mockReturnValue(chainSortSelectLean(days));
  photoFind.mockReturnValue(chainSelectLean([]));
  photoBulkWrite.mockResolvedValue({});
});

describe('buildItineraryDayDateMap', () => {
  it('以旅程開始日對應 Day，且排除超過結束日的天數', () => {
    const map = buildItineraryDayDateMap('2026-06-20', '2026-06-20', days);
    expect(map.get('2026-06-20')?._id).toBe(DAY_1);
    expect(map.has('2026-06-21')).toBe(false);
  });

  it('上傳時保留 auto 狀態，讓目前未匹配的照片之後可以補綁', () => {
    const map = buildItineraryDayDateMap('2026-06-20', '2026-06-22', days);
    expect(autoItineraryFields('2026-06-21', map)).toEqual({
      itineraryDay: DAY_2,
      itineraryDaySource: 'auto',
      borrowedLocation: { lat: 50.85, lon: 4.35, source: 'itinerary' },
    });
    expect(autoItineraryFields('2026-06-22', map)).toEqual({
      itineraryDay: null,
      itineraryDaySource: 'auto',
      borrowedLocation: null,
    });
  });
});

describe('rebindAutoPhotosToItinerary', () => {
  it('只查 auto 照片，日期改動後重綁並移動借來的座標', async () => {
    photoFind.mockReturnValue(
      chainSelectLean([
        {
          _id: PHOTO_1,
          takenLocalDate: '2026-06-21',
          location: { source: 'itinerary' },
        },
      ])
    );

    await rebindAutoPhotosToItinerary(TRIP_ID, '2026-06-20', '2026-06-22');

    expect(photoFind).toHaveBeenCalledWith({
      trip: TRIP_ID,
      itineraryDaySource: 'auto',
    });
    expect(photoBulkWrite).toHaveBeenCalledWith(
      [
        {
          updateOne: {
            filter: {
              _id: PHOTO_1,
              trip: TRIP_ID,
              itineraryDaySource: 'auto',
            },
            update: {
              $set: {
                itineraryDay: DAY_2,
                itineraryDaySource: 'auto',
                location: { lat: 50.85, lon: 4.35, source: 'itinerary' },
              },
            },
          },
        },
      ],
      { ordered: false }
    );
  });

  it('原本未匹配且沒有座標的照片，在新增相符 Day 後會借用當日座標', async () => {
    photoFind.mockReturnValue(
      chainSelectLean([
        {
          _id: PHOTO_1,
          takenLocalDate: '2026-06-20',
          location: null,
        },
      ])
    );

    await rebindAutoPhotosToItinerary(TRIP_ID, '2026-06-20', '2026-06-22');

    expect(photoBulkWrite.mock.calls[0][0][0].updateOne.update.$set).toEqual({
      itineraryDay: DAY_1,
      itineraryDaySource: 'auto',
      location: { lat: 48.85, lon: 2.35, source: 'itinerary' },
    });
  });
});
