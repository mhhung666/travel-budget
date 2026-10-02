import { describe, it, expect } from 'vitest';
import { normalizePhotoExif, EXIF_STRING_MAX, type RawExifTags } from '@/lib/exif';

/**
 * EXIF 正規化是「錯了很安靜」的那類邏輯：搞砸了不會有任何錯誤訊息，只會讓相片
 * 默默地沒有座標、或在地圖上釘到錯的地方。故逐條測邊界。
 */

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0); // 2026-07-15
const FALLBACK = Date.UTC(2026, 6, 1); // file.lastModified 的替身

/** 一組合理的 exifr 輸出，測邊界時個別覆寫。 */
function raw(over: Partial<RawExifTags> = {}): RawExifTags {
  return {
    DateTimeOriginal: new Date(Date.UTC(2026, 5, 20, 8, 30)),
    latitude: 25.0339,
    longitude: 121.5645,
    Make: 'Apple',
    Model: 'iPhone 15 Pro',
    LensModel: 'iPhone 15 Pro back camera',
    ISO: 400,
    FNumber: 1.8,
    ExposureTime: 0.008,
    FocalLength: 6.9,
    Orientation: 6,
    ...over,
  };
}

describe('normalizePhotoExif — 座標', () => {
  it('帶出合法的 EXIF GPS', () => {
    expect(normalizePhotoExif(raw(), FALLBACK, NOW).location).toEqual({
      lat: 25.0339,
      lon: 121.5645,
    });
  });

  it('(0, 0) 視為沒有座標（裝置定位失敗時的常見假值，不可釘上地圖）', () => {
    expect(
      normalizePhotoExif(raw({ latitude: 0, longitude: 0 }), FALLBACK, NOW).location
    ).toBeNull();
  });

  it('只有一半的座標一律不成立', () => {
    expect(normalizePhotoExif(raw({ longitude: undefined }), FALLBACK, NOW).location).toBeNull();
    expect(normalizePhotoExif(raw({ latitude: undefined }), FALLBACK, NOW).location).toBeNull();
  });

  it('超出範圍的座標丟掉', () => {
    expect(normalizePhotoExif(raw({ latitude: 91 }), FALLBACK, NOW).location).toBeNull();
    expect(normalizePhotoExif(raw({ longitude: -181 }), FALLBACK, NOW).location).toBeNull();
  });

  it('NaN / 非數字座標丟掉', () => {
    expect(normalizePhotoExif(raw({ latitude: NaN }), FALLBACK, NOW).location).toBeNull();
    expect(normalizePhotoExif(raw({ latitude: '25.03' }), FALLBACK, NOW).location).toBeNull();
  });

  it('邊界值（±90 / ±180）仍算合法', () => {
    expect(
      normalizePhotoExif(raw({ latitude: -90, longitude: 180 }), FALLBACK, NOW).location
    ).toEqual({ lat: -90, lon: 180 });
  });
});

describe('normalizePhotoExif — 拍攝時間', () => {
  it('優先用 EXIF 的 DateTimeOriginal', () => {
    const out = normalizePhotoExif(raw(), FALLBACK, NOW);
    expect(out.taken_at).toBe('2026-06-20T08:30:00.000Z');
    expect(out.taken_local_date).toBe('2026-06-20');
    expect(out.taken_date_source).toBe('exif');
  });

  it('保留 EXIF 牆上日期，不用 UTC 日期分類歐洲凌晨照片', () => {
    // local constructor 模擬 exifr 將無時區的 DateTimeOriginal 解讀為裝置本地時間。
    // 在 UTC+ 時區，這個時間轉 ISO 可能落在前一天，但 taken_local_date 必須仍是 6/20。
    const localEarlyMorning = new Date(2026, 5, 20, 0, 30);
    const out = normalizePhotoExif(raw({ DateTimeOriginal: localEarlyMorning }), FALLBACK, NOW);
    expect(out.taken_local_date).toBe('2026-06-20');
    expect(out.taken_date_source).toBe('exif');
  });

  it('EXIF 沒有拍攝時間時退回 fallback（file.lastModified）', () => {
    const out = normalizePhotoExif(raw({ DateTimeOriginal: undefined }), FALLBACK, NOW);
    expect(out.taken_at).toBe(new Date(FALLBACK).toISOString());
    expect(out.taken_date_source).toBe('file');
  });

  it('太舊的時間視為相機時鐘沒設定，退 fallback', () => {
    const ancient = new Date(Date.UTC(1980, 0, 1));
    expect(normalizePhotoExif(raw({ DateTimeOriginal: ancient }), FALLBACK, NOW).taken_at).toBe(
      new Date(FALLBACK).toISOString()
    );
  });

  it('未來的時間退 fallback，但容忍一日內的時區/時鐘誤差', () => {
    const wayFuture = new Date(NOW + 10 * 24 * 60 * 60 * 1000);
    expect(normalizePhotoExif(raw({ DateTimeOriginal: wayFuture }), FALLBACK, NOW).taken_at).toBe(
      new Date(FALLBACK).toISOString()
    );

    const slightlyAhead = new Date(NOW + 60 * 60 * 1000);
    expect(
      normalizePhotoExif(raw({ DateTimeOriginal: slightlyAhead }), FALLBACK, NOW).taken_at
    ).toBe(slightlyAhead.toISOString());
  });

  it('EXIF 與 fallback 都不合理時為 null', () => {
    const out = normalizePhotoExif(raw({ DateTimeOriginal: undefined }), 0, NOW);
    expect(out.taken_at).toBeNull();
    expect(out.taken_local_date).toBeNull();
    expect(out.taken_date_source).toBeNull();
  });

  it('非 Date 的 DateTimeOriginal（字串）不被採信', () => {
    expect(
      normalizePhotoExif(raw({ DateTimeOriginal: '2026:06:20 08:30:00' }), FALLBACK, NOW).taken_at
    ).toBe(new Date(FALLBACK).toISOString());
  });
});

describe('normalizePhotoExif — 相機參數', () => {
  it('帶出完整的相機參數', () => {
    expect(normalizePhotoExif(raw(), FALLBACK, NOW).exif).toEqual({
      make: 'Apple',
      model: 'iPhone 15 Pro',
      lens: 'iPhone 15 Pro back camera',
      iso: 400,
      f_number: 1.8,
      exposure_time: 0.008,
      focal_length: 6.9,
      orientation: 6,
    });
  });

  it('字串欄位截斷到上限並去空白', () => {
    const long = 'x'.repeat(EXIF_STRING_MAX + 50);
    const out = normalizePhotoExif(raw({ Make: long, Model: '  Pixel 9  ' }), FALLBACK, NOW);
    expect(out.exif.make).toHaveLength(EXIF_STRING_MAX);
    expect(out.exif.model).toBe('Pixel 9');
  });

  it('空字串視為沒有（不要存一個空的機身名稱）', () => {
    expect(normalizePhotoExif(raw({ Make: '   ' }), FALLBACK, NOW).exif.make).toBeUndefined();
  });

  it('0 或負數的相機參數視為「沒寫」而非真的是 0', () => {
    const out = normalizePhotoExif(raw({ ISO: 0, FNumber: -1 }), FALLBACK, NOW);
    expect(out.exif.iso).toBeUndefined();
    expect(out.exif.f_number).toBeUndefined();
  });

  it('Orientation 只接受 1–8 的整數', () => {
    expect(
      normalizePhotoExif(raw({ Orientation: 9 }), FALLBACK, NOW).exif.orientation
    ).toBeUndefined();
    expect(
      normalizePhotoExif(raw({ Orientation: 0 }), FALLBACK, NOW).exif.orientation
    ).toBeUndefined();
    expect(
      normalizePhotoExif(raw({ Orientation: 2.5 }), FALLBACK, NOW).exif.orientation
    ).toBeUndefined();
    expect(normalizePhotoExif(raw({ Orientation: 1 }), FALLBACK, NOW).exif.orientation).toBe(1);
  });

  it('exifr 若沒關掉 translateValues 會給字串 Orientation——這種值不可採信', () => {
    // 'Rotate 90 CW' 是 exifr 的預設翻譯輸出。讀取端已設 translateValues: false，
    // 這條是防呆：萬一選項被改掉，寧可沒有 orientation 也不要存進一個字串。
    expect(
      normalizePhotoExif(raw({ Orientation: 'Rotate 90 CW' }), FALLBACK, NOW).exif.orientation
    ).toBeUndefined();
  });
});

describe('normalizePhotoExif — 完全沒有 EXIF', () => {
  it('exifr 對無 EXIF 的檔（PNG 截圖）回 undefined，不可炸掉', () => {
    const out = normalizePhotoExif(undefined, FALLBACK, NOW);
    expect(out.location).toBeNull();
    expect(out.exif).toEqual({});
    expect(out.taken_at).toBe(new Date(FALLBACK).toISOString());
  });

  it('null 同上', () => {
    expect(normalizePhotoExif(null, FALLBACK, NOW).location).toBeNull();
  });

  it('單一欄位不合格只丟該欄位，不影響其他欄位（不是整張拒收）', () => {
    const out = normalizePhotoExif(raw({ latitude: 999, ISO: 0 }), FALLBACK, NOW);
    expect(out.location).toBeNull();
    expect(out.exif.iso).toBeUndefined();
    // 其餘欄位照常帶出
    expect(out.exif.make).toBe('Apple');
    expect(out.taken_at).toBe('2026-06-20T08:30:00.000Z');
  });
});
