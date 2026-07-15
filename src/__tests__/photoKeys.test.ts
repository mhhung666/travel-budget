import { describe, it, expect } from 'vitest';
import {
  buildPhotoObjectKeys,
  sanitizedPhotoKey,
  photoKeyPrefix,
  isPhotoKeyForTrip,
  validateUpload,
  PHOTO_CONTENT_TYPES,
  PHOTO_DISPLAY_CONTENT_TYPE,
  PHOTO_THUMB_CONTENT_TYPE,
  MAX_PHOTO_BYTES,
} from '@/lib/uploads';
import { stableSigningWindow, STABLE_GET_WINDOW_SECONDS } from '@/lib/storage';
import { chunk } from '@/lib/photoUpload';
import { addPhotosSchema, PHOTO_BATCH_MAX } from '@/lib/validation';

const TRIP = '507f1f77bcf86cd799439011';
const OTHER_TRIP = '507f1f77bcf86cd799439012';

describe('buildPhotoObjectKeys', () => {
  it('顯示檔與縮圖共用同一個 uuid（_t／_p 的推導規則靠這個成立）', () => {
    const { key, thumbKey } = buildPhotoObjectKeys(TRIP);
    const uuid = key.slice(photoKeyPrefix(TRIP).length, -'.jpg'.length);
    expect(thumbKey).toBe(`${photoKeyPrefix(TRIP)}${uuid}_t.webp`);
  });

  it('副檔名與各自的 content type 相符', () => {
    const { key, thumbKey } = buildPhotoObjectKeys(TRIP);
    expect(key.endsWith('.jpg')).toBe(true);
    expect(thumbKey.endsWith('_t.webp')).toBe(true);
  });

  it('落在本 trip 的命名空間下', () => {
    const { key, thumbKey } = buildPhotoObjectKeys(TRIP);
    expect(isPhotoKeyForTrip(TRIP, key)).toBe(true);
    expect(isPhotoKeyForTrip(TRIP, thumbKey)).toBe(true);
  });

  it('每次呼叫都是不同的 uuid（key 不可猜）', () => {
    expect(buildPhotoObjectKeys(TRIP).key).not.toBe(buildPhotoObjectKeys(TRIP).key);
  });
});

describe('isPhotoKeyForTrip', () => {
  it('擋掉別團的 key', () => {
    const { key } = buildPhotoObjectKeys(OTHER_TRIP);
    expect(isPhotoKeyForTrip(TRIP, key)).toBe(false);
  });

  it('擋掉收據的 key——收據永遠不進相簿（前綴是唯一的隔離）', () => {
    expect(isPhotoKeyForTrip(TRIP, `receipts/${TRIP}/abc.jpg`)).toBe(false);
  });

  it('空 tripId 一律不成立（別讓空字串比對出前綴）', () => {
    expect(isPhotoKeyForTrip('', `photos//abc.jpg`)).toBe(false);
  });
});

describe('sanitizedPhotoKey', () => {
  it('顯示檔 → 消毒副本（Phase 4 公開分享只可簽這顆，絕不可簽 .jpg）', () => {
    expect(sanitizedPhotoKey(`photos/${TRIP}/abc-123.jpg`)).toBe(`photos/${TRIP}/abc-123_p.jpg`);
  });

  it('消毒副本仍落在本 trip 的命名空間下', () => {
    const { key } = buildPhotoObjectKeys(TRIP);
    expect(isPhotoKeyForTrip(TRIP, sanitizedPhotoKey(key))).toBe(true);
  });

  it('不會誤把縮圖當成顯示檔改名', () => {
    const { thumbKey } = buildPhotoObjectKeys(TRIP);
    expect(sanitizedPhotoKey(thumbKey)).toBe(thumbKey);
  });
});

describe('validateUpload — photo', () => {
  it('收 JPEG（顯示檔）與 WebP（縮圖）', () => {
    expect(validateUpload('photo', PHOTO_DISPLAY_CONTENT_TYPE, 1_000_000)).toEqual({ ok: true });
    expect(validateUpload('photo', PHOTO_THUMB_CONTENT_TYPE, 30_000)).toEqual({ ok: true });
  });

  it('不收 HEIC——accept 白名單讓 iOS 自動轉 JPEG，桌面拖放的 .heic 要在這裡被擋下', () => {
    expect(validateUpload('photo', 'image/heic', 1_000_000)).toEqual({ ok: false, reason: 'type' });
    expect(validateUpload('photo', 'image/heif', 1_000_000)).toEqual({ ok: false, reason: 'type' });
  });

  it('不收 PNG（進得來但壓縮後一律輸出 JPEG／WebP）與 PDF', () => {
    expect(validateUpload('photo', 'image/png', 1_000_000)).toEqual({ ok: false, reason: 'type' });
    expect(validateUpload('photo', 'application/pdf', 1_000)).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('超過硬性上限就擋（presigned PUT 管不住 client，這是伺服器端防線）', () => {
    expect(validateUpload('photo', PHOTO_DISPLAY_CONTENT_TYPE, MAX_PHOTO_BYTES + 1)).toEqual({
      ok: false,
      reason: 'size',
    });
  });

  it('白名單就是顯示檔與縮圖這兩種型別', () => {
    expect([...PHOTO_CONTENT_TYPES]).toEqual([
      PHOTO_DISPLAY_CONTENT_TYPE,
      PHOTO_THUMB_CONTENT_TYPE,
    ]);
  });
});

describe('stableSigningWindow', () => {
  const H = 60 * 60;

  it('同一窗口內的任何時刻都對齊到同一個簽名時間戳（URL 才會逐字元相同）', () => {
    const a = stableSigningWindow(Date.UTC(2026, 6, 15, 9, 0, 0), H);
    const b = stableSigningWindow(Date.UTC(2026, 6, 15, 9, 59, 59), H);
    expect(a.signingDate.getTime()).toBe(b.signingDate.getTime());
    expect(a.signingDate.toISOString()).toBe('2026-07-15T09:00:00.000Z');
  });

  it('跨到下一個窗口就換一個時間戳（簽名才會定期輪替）', () => {
    const a = stableSigningWindow(Date.UTC(2026, 6, 15, 9, 59, 59), H);
    const b = stableSigningWindow(Date.UTC(2026, 6, 15, 10, 0, 0), H);
    expect(a.signingDate.getTime()).not.toBe(b.signingDate.getTime());
  });

  it('TTL 是窗口的兩倍：窗口尾聲拿到的 URL 仍有一整個窗口的壽命', () => {
    const atEnd = Date.UTC(2026, 6, 15, 9, 59, 59);
    const { signingDate, expiresIn } = stableSigningWindow(atEnd, H);
    const expiresAt = signingDate.getTime() + expiresIn * 1000;
    expect(expiresAt - atEnd).toBeGreaterThanOrEqual(H * 1000);
  });

  it('窗口起點拿到的 URL 也不會超過兩個窗口', () => {
    const atStart = Date.UTC(2026, 6, 15, 9, 0, 0);
    const { signingDate, expiresIn } = stableSigningWindow(atStart, H);
    const expiresAt = signingDate.getTime() + expiresIn * 1000;
    expect(expiresAt - atStart).toBeLessThanOrEqual(2 * H * 1000);
  });

  it('對齊後的時間戳永不落在未來（簽名不可預先生效）', () => {
    const now = Date.UTC(2026, 6, 15, 9, 30, 0);
    expect(stableSigningWindow(now, H).signingDate.getTime()).toBeLessThanOrEqual(now);
  });

  it('預設窗口為 1 小時', () => {
    expect(STABLE_GET_WINDOW_SECONDS).toBe(3600);
  });
});

describe('chunk（相簿分批上傳）', () => {
  it('切成每批至多 PHOTO_BATCH_MAX——一次選 25 張要能全部傳完，而不是被整批打回', () => {
    const files = Array.from({ length: 25 }, (_, i) => i);
    const batches = chunk(files, PHOTO_BATCH_MAX);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(PHOTO_BATCH_MAX);
    expect(batches[1]).toHaveLength(5);
    expect(batches.flat()).toEqual(files); // 不掉檔、不重複、保序
  });

  it('剛好整除時不產生空批', () => {
    expect(
      chunk(
        Array.from({ length: 40 }, (_, i) => i),
        PHOTO_BATCH_MAX
      )
    ).toHaveLength(2);
  });

  it('空清單回空陣列', () => {
    expect(chunk([], PHOTO_BATCH_MAX)).toEqual([]);
  });
});

describe('photoItemSchema — taken_at 範圍（server 端硬防線）', () => {
  const validItem = () => ({
    key: `photos/${TRIP}/abc.jpg`,
    thumb_key: `photos/${TRIP}/abc_t.webp`,
  });

  const parse = (taken_at: string) =>
    addPhotosSchema.safeParse({ items: [{ ...validItem(), taken_at }] });

  it('擋掉未來的拍攝時間——datetime() 只驗格式，9999-01-01 是合法 ISO 字串', () => {
    // 沒有這條，偽造一次呼叫就能讓一張相片永遠置頂（相簿主排序是 takenAt 新到舊）
    expect(parse('9999-01-01T00:00:00.000Z').success).toBe(false);
  });

  it('擋掉過舊的拍攝時間（相機時鐘沒設定的預設值）', () => {
    expect(parse('1970-01-01T00:00:00.000Z').success).toBe(false);
  });

  it('收合理的拍攝時間', () => {
    expect(parse(new Date(Date.now() - 86_400_000).toISOString()).success).toBe(true);
  });

  it('taken_at 可以是 null（截圖沒有拍攝時間）', () => {
    expect(addPhotosSchema.safeParse({ items: [{ ...validItem(), taken_at: null }] }).success).toBe(
      true
    );
  });

  it('一次最多 PHOTO_BATCH_MAX 張', () => {
    const items = Array.from({ length: PHOTO_BATCH_MAX + 1 }, () => validItem());
    expect(addPhotosSchema.safeParse({ items }).success).toBe(false);
  });

  it('擋掉超出範圍的座標（與 exif.ts 同界，但這裡才是安全邊界）', () => {
    const bad = { ...validItem(), location: { lat: 91, lon: 0 } };
    expect(addPhotosSchema.safeParse({ items: [bad] }).success).toBe(false);
  });
});
