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
const photoDeleteMany = vi.fn();
const itineraryDayFindOne = vi.fn();
const userFindById = vi.fn();
const tripFindById = vi.fn();
const ensureSanitizedPhotoCopies = vi.fn();
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
    deleteMany: (...args: unknown[]) => photoDeleteMany(...args),
  },
  ItineraryDay: {
    findOne: (...args: unknown[]) => itineraryDayFindOne(...args),
  },
  User: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
  Trip: {
    findById: (...args: unknown[]) => tripFindById(...args),
  },
}));

// 相簿分享的消毒副本產生：addTripPhotos 只在 trip 已分享時觸發它。這裡整支 mock 掉，
// 讓「已分享 → 補產」的行為可獨立斷言，且不牽動未 mock 的 storage 讀寫。
vi.mock('@/lib/photoSanitize', () => ({
  ensureSanitizedPhotoCopies: (...args: unknown[]) => ensureSanitizedPhotoCopies(...args),
}));

import { addTripPhotos, getTripPhotos, updatePhoto, deletePhotos } from '@/actions/photo.actions';
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
  // 預設：相簿未分享（albumShareCode 為 null）→ addTripPhotos 不觸發消毒副本補產。
  tripFindById.mockReturnValue(chainSelectLean({ albumShareCode: null }));
  ensureSanitizedPhotoCopies.mockResolvedValue(undefined);
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
    // 相簿未分享 → 不補產消毒副本
    expect(ensureSanitizedPhotoCopies).not.toHaveBeenCalled();
  });

  it('相簿已分享時，插入後補產消毒副本 _p.jpg', async () => {
    tripFindById.mockReturnValue(chainSelectLean({ albumShareCode: 'abc123' }));
    mockHeadObjectHappy();
    const item = validItem(TRIP_ID);
    photoInsertMany.mockResolvedValue([
      { toObject: () => leanPhoto({ key: item.key, thumbKey: item.thumb_key }) },
    ]);

    const result = await addTripPhotos(TRIP_ID, { items: [item] });

    expect(result.success).toBe(true);
    expect(ensureSanitizedPhotoCopies).toHaveBeenCalledWith(TRIP_ID);
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

describe('deletePhotos', () => {
  const PHOTO_ID_2 = '507f1f77bcf86cd799439014';

  it('collects all three blob keys (display + thumb + sanitized copy) of every photo in one batch', async () => {
    const a = { key: `photos/${TRIP_ID}/abc.jpg`, thumbKey: `photos/${TRIP_ID}/abc_t.webp` };
    const b = { key: `photos/${TRIP_ID}/def.jpg`, thumbKey: `photos/${TRIP_ID}/def_t.webp` };
    photoFind.mockReturnValue(chainSelectLean([a, b]));
    photoDeleteMany.mockResolvedValue({ deletedCount: 2 });
    deleteObjects.mockResolvedValue(undefined);

    const result = await deletePhotos(TRIP_ID, { photo_ids: [PHOTO_ID, PHOTO_ID_2] });

    expect(result).toEqual({ success: true, data: { deleted: 2 } });
    // 一次 deleteObjects 收掉全部——批次刪除不該退化成逐張呼叫
    expect(deleteObjects).toHaveBeenCalledTimes(1);
    expect(deleteObjects).toHaveBeenCalledWith('receipts', [
      a.key,
      a.thumbKey,
      sanitizedPhotoKey(a.key),
      b.key,
      b.thumbKey,
      sanitizedPhotoKey(b.key),
    ]);
  });

  it('scopes the delete to this trip (a foreign photoId cannot be deleted)', async () => {
    photoFind.mockReturnValue(
      chainSelectLean([
        { key: `photos/${TRIP_ID}/abc.jpg`, thumbKey: `photos/${TRIP_ID}/abc_t.webp` },
      ])
    );
    photoDeleteMany.mockResolvedValue({ deletedCount: 1 });
    deleteObjects.mockResolvedValue(undefined);

    await deletePhotos(TRIP_ID, { photo_ids: [PHOTO_ID] });

    expect(photoDeleteMany).toHaveBeenCalledWith({ _id: { $in: [PHOTO_ID] }, trip: TRIP_ID });
  });

  it('still returns success when the blob cleanup fails (best-effort, never blocks the user)', async () => {
    photoFind.mockReturnValue(
      chainSelectLean([
        { key: `photos/${TRIP_ID}/abc.jpg`, thumbKey: `photos/${TRIP_ID}/abc_t.webp` },
      ])
    );
    photoDeleteMany.mockResolvedValue({ deletedCount: 1 });
    deleteObjects.mockRejectedValue(new Error('R2 unavailable'));

    const result = await deletePhotos(TRIP_ID, { photo_ids: [PHOTO_ID] });

    expect(result.success).toBe(true);
  });

  it('returns NOT_FOUND when no id belongs to this trip', async () => {
    photoFind.mockReturnValue(chainSelectLean([]));

    const result = await deletePhotos(TRIP_ID, { photo_ids: [PHOTO_ID] });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(photoDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects an empty id list', async () => {
    const result = await deletePhotos(TRIP_ID, { photo_ids: [] });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(photoDeleteMany).not.toHaveBeenCalled();
  });
});

describe('updatePhoto', () => {
  /** ItineraryDay.findOne(...).select('location').lean() 的回傳。 */
  const mockDay = (location: unknown) =>
    itineraryDayFindOne.mockReturnValue(chainSelectLean({ location }));
  /** 這張相片現有的 location（updatePhoto 為了套用退回規則會先讀）。 */
  const mockCurrentLocation = (location: unknown) =>
    photoFindOne.mockReturnValue(chainSelectLean({ location }));

  /** 取出送進 findOneAndUpdate 的 $set。 */
  const setArg = () => photoFindOneAndUpdate.mock.calls[0][1].$set;

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
    itineraryDayFindOne.mockReturnValue(chainSelectLean(null));

    const result = await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(itineraryDayFindOne).toHaveBeenCalledWith({ _id: DAY_ID, trip: TRIP_ID });
    expect(photoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('borrows the day coordinates for a photo with no GPS, marked source "itinerary"', async () => {
    mockDay({ lat: 35.6, lon: 139.7, name: 'Tokyo' });
    mockCurrentLocation(null);
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    const result = await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(result.success).toBe(true);
    expect(setArg()).toEqual({
      itineraryDay: DAY_ID,
      location: { lat: 35.6, lon: 139.7, source: 'itinerary' },
    });
  });

  it('never overwrites the photo own GPS with the day coordinates (exif is more precise)', async () => {
    mockDay({ lat: 35.6, lon: 139.7 });
    mockCurrentLocation({ lat: 35.71, lon: 139.79, source: 'exif' });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(setArg()).toEqual({ itineraryDay: DAY_ID });
  });

  it('never overwrites a manually-pinned location with the day coordinates', async () => {
    mockDay({ lat: 35.6, lon: 139.7 });
    mockCurrentLocation({ lat: 35.71, lon: 139.79, source: 'manual' });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(setArg()).toEqual({ itineraryDay: DAY_ID });
  });

  it('re-borrows from the new day when the current coordinates came from the previous one', async () => {
    mockDay({ lat: 48.85, lon: 2.35 });
    mockCurrentLocation({ lat: 35.6, lon: 139.7, source: 'itinerary' });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(setArg()).toEqual({
      itineraryDay: DAY_ID,
      location: { lat: 48.85, lon: 2.35, source: 'itinerary' },
    });
  });

  it('drops borrowed coordinates when the photo is unlinked from its day', async () => {
    mockCurrentLocation({ lat: 35.6, lon: 139.7, source: 'itinerary' });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: null });

    // 借來的座標沒了來源就該消失，否則地圖上會留下無法解釋的釘子
    expect(setArg()).toEqual({ itineraryDay: null, location: null });
    expect(itineraryDayFindOne).not.toHaveBeenCalled();
  });

  it('keeps the exif GPS when the photo is unlinked from its day', async () => {
    mockCurrentLocation({ lat: 35.71, lon: 139.79, source: 'exif' });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: null });

    expect(setArg()).toEqual({ itineraryDay: null });
  });

  it('drops borrowed coordinates when the new day has no location set', async () => {
    mockDay(null);
    mockCurrentLocation({ lat: 35.6, lon: 139.7, source: 'itinerary' });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(setArg()).toEqual({ itineraryDay: DAY_ID, location: null });
  });

  it('leaves location untouched for a GPS-less photo linked to a day with no location', async () => {
    mockDay(null);
    mockCurrentLocation(null);
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(setArg()).toEqual({ itineraryDay: DAY_ID });
  });

  it('lets an explicit manual pin win over the day fallback in the same call', async () => {
    mockDay({ lat: 35.6, lon: 139.7 });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    await updatePhoto(TRIP_ID, PHOTO_ID, {
      itinerary_day_id: DAY_ID,
      location: { lat: 1.29, lon: 103.85 },
    });

    expect(setArg()).toEqual({
      itineraryDay: DAY_ID,
      location: { lat: 1.29, lon: 103.85, source: 'manual' },
    });
    // 明確給了 location 就不必回頭讀現有座標
    expect(photoFindOne).not.toHaveBeenCalled();
  });

  it('borrows the day coordinates when the same call clears the manual pin', async () => {
    mockDay({ lat: 35.6, lon: 139.7 });
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto()));

    // location: null＝把手動釘清掉。清完這張就沒座標了，正好可以借當天的——
    // 這與「明確拉了新釘」（manual 優先）是兩回事。
    await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID, location: null });

    expect(setArg()).toEqual({
      itineraryDay: DAY_ID,
      location: { lat: 35.6, lon: 139.7, source: 'itinerary' },
    });
    expect(photoFindOne).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the photo does not belong to this trip', async () => {
    mockDay({ lat: 35.6, lon: 139.7 });
    mockCurrentLocation(null);
    photoFindOne.mockReturnValue(chainSelectLean(null));

    const result = await updatePhoto(TRIP_ID, PHOTO_ID, { itinerary_day_id: DAY_ID });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(photoFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('updates the caption without touching location or the day link', async () => {
    photoFindOneAndUpdate.mockReturnValue(chainLean(leanPhoto({ caption: 'Shibuya at night' })));

    const result = await updatePhoto(TRIP_ID, PHOTO_ID, { caption: 'Shibuya at night' });

    expect(result.success).toBe(true);
    expect(setArg()).toEqual({ caption: 'Shibuya at night' });
  });
});
