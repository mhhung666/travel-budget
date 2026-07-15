import { describe, it, expect, vi, beforeEach } from 'vitest';

// photo.actions 不需真實 DB：mock session、membership 與 Photo/ItineraryDay/User model。
// 刻意**不** mock @/lib/uploads——buildPhotoObjectKeys/isPhotoKeyForTrip/sanitizedPhotoKey
// 的真實規則正是這支 action 要驗的東西。
const getSession = vi.fn();
const getTripMembership = vi.fn();
const photoFind = vi.fn();
const photoFindOne = vi.fn();
const photoFindOneAndUpdate = vi.fn();
const photoCountDocuments = vi.fn();
const photoInsertMany = vi.fn();
const photoDeleteOne = vi.fn();
const itineraryDayExists = vi.fn();
const userFindById = vi.fn();
const headObject = vi.fn();
const deleteObjects = vi.fn();
const presignGetStable = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/storage', () => ({
  headObject: (...args: unknown[]) => headObject(...args),
  deleteObjects: (...args: unknown[]) => deleteObjects(...args),
  presignGetStable: (...args: unknown[]) => presignGetStable(...args),
}));

vi.mock('@/lib/auth', () => ({
  getSession: () => getSession(),
}));

vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));

vi.mock('@/models', () => ({
  Photo: {
    find: (...args: unknown[]) => photoFind(...args),
    findOne: (...args: unknown[]) => photoFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => photoFindOneAndUpdate(...args),
    countDocuments: (...args: unknown[]) => photoCountDocuments(...args),
    insertMany: (...args: unknown[]) => photoInsertMany(...args),
    deleteOne: (...args: unknown[]) => photoDeleteOne(...args),
  },
  ItineraryDay: {
    exists: (...args: unknown[]) => itineraryDayExists(...args),
  },
  User: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
}));

import { addTripPhotos, getTripPhotos, updatePhoto, deletePhoto } from '@/actions/photo.actions';
import {
  buildPhotoObjectKeys,
  sanitizedPhotoKey,
  MAX_PHOTO_BYTES,
  PHOTO_DISPLAY_CONTENT_TYPE,
  PHOTO_THUMB_CONTENT_TYPE,
} from '@/lib/uploads';
import { PHOTO_LIMIT_PER_TRIP, type PhotoItemInput } from '@/lib/validation';

const VIEWER = '507f191e810c19729de860ea';
const TRIP_ID = '507f1f77bcf86cd799439011';
const OTHER_TRIP_ID = '507f1f77bcf86cd799439099';
const PHOTO_ID = '507f1f77bcf86cd799439012';
const DAY_ID = '507f1f77bcf86cd799439013';

/** Mongoose 的 find(...).sort(...).lean() 鏈式呼叫。 */
function chainSortLean(returnValue: unknown) {
  return { sort: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

/** Mongoose 的 findOne(...).select(...).lean() 鏈式呼叫。 */
function chainSelectLean(returnValue: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(returnValue) }) };
}

/** Mongoose 的 findOneAndUpdate(...).lean() 鏈式呼叫（無 .select）。 */
function chainLean(returnValue: unknown) {
  return { lean: () => Promise.resolve(returnValue) };
}

/** 一組真實、成對的相片 key（用真的 buildPhotoObjectKeys，而非手刻字串）。 */
function validItem(tripId: string, overrides: Partial<PhotoItemInput> = {}): PhotoItemInput {
  const { key, thumbKey } = buildPhotoObjectKeys(tripId);
  return {
    key,
    thumb_key: thumbKey,
    width: 2560,
    height: 1440,
    ...overrides,
  };
}

/** headObject 的預設實作：依 key 副檔名回傳型別正確、大小合規的中繼資料。 */
function mockHeadObjectHappy() {
  headObject.mockImplementation((_bucket: string, key: string) => {
    if (key.endsWith('_t.webp')) {
      return Promise.resolve({ size: 200 * 1024, contentType: PHOTO_THUMB_CONTENT_TYPE });
    }
    return Promise.resolve({ size: 1024 * 1024, contentType: PHOTO_DISPLAY_CONTENT_TYPE });
  });
}

/** 一份 lean Photo doc（toTripPhotoDto 輸入形狀）。 */
function leanPhoto(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => PHOTO_ID },
    trip: { toString: () => TRIP_ID },
    key: `photos/${TRIP_ID}/abc.jpg`,
    thumbKey: `photos/${TRIP_ID}/abc_t.webp`,
    contentType: PHOTO_DISPLAY_CONTENT_TYPE,
    size: 1024,
    width: 2560,
    height: 1440,
    takenAt: null,
    location: null,
    place: null,
    exif: {},
    itineraryDay: null,
    caption: '',
    uploadedBy: { toString: () => VIEWER },
    uploadedByName: 'Alice',
    createdAt: new Date('2026-06-17T10:00:00.000Z'),
    updatedAt: new Date('2026-06-17T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: VIEWER });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
  photoCountDocuments.mockResolvedValue(0);
  presignGetStable.mockResolvedValue('https://signed.example/photo');
  userFindById.mockReturnValue(chainSelectLean({ displayName: 'Alice' }));
});

describe('addTripPhotos', () => {
  it('verifies both objects via headObject, inserts, and returns success', async () => {
    mockHeadObjectHappy();
    const items = [validItem(TRIP_ID), validItem(TRIP_ID)];
    photoInsertMany.mockResolvedValue(
      items.map((item) => ({
        toObject: () =>
          leanPhoto({ key: item.key, thumbKey: item.thumb_key, uploadedByName: 'Alice' }),
      }))
    );

    const result = await addTripPhotos(TRIP_ID, { items });

    expect(result.success).toBe(true);
    expect(photoInsertMany).toHaveBeenCalledTimes(1);
    // 兩張相片各打了一次顯示檔＋一次縮圖的 headObject
    expect(headObject).toHaveBeenCalledTimes(4);
  });

  it('records exif-sourced location and leaves place null (Phase 1 未做反查地名)', async () => {
    mockHeadObjectHappy();
    const item = validItem(TRIP_ID, { location: { lat: 35.6, lon: 139.7 } });
    photoInsertMany.mockResolvedValue([
      { toObject: () => leanPhoto({ key: item.key, thumbKey: item.thumb_key }) },
    ]);

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(true);
    expect(photoInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        location: { lat: 35.6, lon: 139.7, source: 'exif' },
        place: null,
      }),
    ]);
  });

  it('rejects a key belonging to another trip, without inserting', async () => {
    mockHeadObjectHappy();
    const item = validItem(OTHER_TRIP_ID); // photos/<別團id>/...

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('rejects a receipt-prefixed key (receipts never enter the album)', async () => {
    mockHeadObjectHappy();
    const item: PhotoItemInput = {
      key: `receipts/${TRIP_ID}/x.jpg`,
      thumb_key: `receipts/${TRIP_ID}/x_t.webp`,
    };

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('rejects when key/thumb_key uuids are not a matching pair (no arbitrary mixing)', async () => {
    mockHeadObjectHappy();
    const a = buildPhotoObjectKeys(TRIP_ID);
    const b = buildPhotoObjectKeys(TRIP_ID);
    // A 的顯示檔配 B 的縮圖——兩者都屬本團、型別/大小都合規，唯獨 uuid 不成對
    const item: PhotoItemInput = { key: a.key, thumb_key: b.thumbKey };

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    // uuid 配對檢查先於 headObject，不該打任何一次
    expect(headObject).not.toHaveBeenCalled();
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('rejects when headObject returns null (client got a signature but never PUT)', async () => {
    const item = validItem(TRIP_ID);
    headObject.mockResolvedValue(null);

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('rejects when the display object content-type does not match (client swapped files)', async () => {
    const item = validItem(TRIP_ID);
    headObject.mockImplementation((_bucket: string, key: string) => {
      if (key === item.thumb_key) {
        return Promise.resolve({ size: 200, contentType: PHOTO_THUMB_CONTENT_TYPE });
      }
      // 顯示檔本該是 image/jpeg，卻回了 webp
      return Promise.resolve({ size: 1024, contentType: 'image/webp' });
    });

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('rejects when the thumb object content-type does not match (client swapped files)', async () => {
    const item = validItem(TRIP_ID);
    headObject.mockImplementation((_bucket: string, key: string) => {
      if (key === item.key) {
        return Promise.resolve({ size: 1024, contentType: PHOTO_DISPLAY_CONTENT_TYPE });
      }
      // 縮圖本該是 image/webp，卻回了 jpeg
      return Promise.resolve({ size: 200, contentType: 'image/jpeg' });
    });

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('rejects when the reported size exceeds MAX_PHOTO_BYTES (client lied about size too)', async () => {
    const item = validItem(TRIP_ID);
    headObject.mockImplementation((_bucket: string, key: string) => {
      if (key === item.thumb_key) {
        return Promise.resolve({ size: 200, contentType: PHOTO_THUMB_CONTENT_TYPE });
      }
      return Promise.resolve({
        size: MAX_PHOTO_BYTES + 1,
        contentType: PHOTO_DISPLAY_CONTENT_TYPE,
      });
    });

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('returns CONFLICT when the upload would exceed PHOTO_LIMIT_PER_TRIP', async () => {
    mockHeadObjectHappy();
    photoCountDocuments.mockResolvedValue(PHOTO_LIMIT_PER_TRIP - 1);
    const items = [validItem(TRIP_ID), validItem(TRIP_ID)]; // 299 + 2 > 300

    const result = await addTripPhotos(TRIP_ID, { items });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('CONFLICT');
    // 上限先擋，根本不必打 headObject
    expect(headObject).not.toHaveBeenCalled();
    expect(photoInsertMany).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for a non-member without touching the DB', async () => {
    getTripMembership.mockResolvedValue(null);
    const item = validItem(TRIP_ID);

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(photoCountDocuments).not.toHaveBeenCalled();
    expect(headObject).not.toHaveBeenCalled();
    expect(photoInsertMany).not.toHaveBeenCalled();
  });
});

describe('getTripPhotos', () => {
  it('returns NOT_FOUND when the user is not a member', async () => {
    getTripMembership.mockResolvedValue(null);

    const result = await getTripPhotos(TRIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(photoFind).not.toHaveBeenCalled();
  });

  it('signs URLs with presignGetStable, not presignGet (SW CacheFirst 靠它才能命中)', async () => {
    photoFind.mockReturnValue(chainSortLean([leanPhoto()]));

    const result = await getTripPhotos(TRIP_ID);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data).toHaveLength(1);
    expect(presignGetStable).toHaveBeenCalledWith('receipts', `photos/${TRIP_ID}/abc.jpg`);
    expect(presignGetStable).toHaveBeenCalledWith('receipts', `photos/${TRIP_ID}/abc_t.webp`);
  });
});

describe('deletePhoto', () => {
  it('collects all three blob keys (display + thumb + sanitized copy) for best-effort deletion', async () => {
    const key = `photos/${TRIP_ID}/abc.jpg`;
    const thumbKey = `photos/${TRIP_ID}/abc_t.webp`;
    photoFindOne.mockReturnValue(chainSelectLean({ key, thumbKey }));
    photoDeleteOne.mockResolvedValue({ deletedCount: 1 });
    deleteObjects.mockResolvedValue(undefined);

    const result = await deletePhoto(TRIP_ID, PHOTO_ID);

    expect(result.success).toBe(true);
    expect(deleteObjects).toHaveBeenCalledWith('receipts', [key, thumbKey, sanitizedPhotoKey(key)]);
  });

  it('still returns success when the blob cleanup fails (best-effort, never blocks the user)', async () => {
    const key = `photos/${TRIP_ID}/abc.jpg`;
    const thumbKey = `photos/${TRIP_ID}/abc_t.webp`;
    photoFindOne.mockReturnValue(chainSelectLean({ key, thumbKey }));
    photoDeleteOne.mockResolvedValue({ deletedCount: 1 });
    deleteObjects.mockRejectedValue(new Error('R2 unavailable'));

    const result = await deletePhoto(TRIP_ID, PHOTO_ID);

    expect(result.success).toBe(true);
  });

  it('returns NOT_FOUND for a photoId that does not belong to this trip', async () => {
    photoFindOne.mockReturnValue(chainSelectLean(null));

    const result = await deletePhoto(TRIP_ID, PHOTO_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(photoDeleteOne).not.toHaveBeenCalled();
  });
});

describe('updatePhoto', () => {
  it('marks a manually-pinned location as source "manual" (not disguised as exif precision)', async () => {
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    const result = await updatePhoto(TRIP_ID, PHOTO_ID, { location: { lat: 35.6, lon: 139.7 } });

    expect(result.success).toBe(true);
    expect(photoFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: PHOTO_ID, trip: TRIP_ID },
      { $set: { location: { lat: 35.6, lon: 139.7, source: 'manual' } } },
      { new: true }
    );
  });

  it('returns NOT_FOUND when itinerary_day_id points to a day from another trip', async () => {
    itineraryDayExists.mockResolvedValue(null);

    const result = await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(itineraryDayExists).toHaveBeenCalledWith({ _id: DAY_ID, trip: TRIP_ID });
    expect(photoFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
