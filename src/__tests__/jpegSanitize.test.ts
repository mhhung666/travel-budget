import { describe, it, expect } from 'vitest';
import exifr from 'exifr';
import { stripJpegApp1 } from '@/lib/jpegSanitize';

/**
 * APP1 剝除是「錯了很安靜」的隱私邏輯：搞砸了不會報錯，只會讓帶著公尺級 GPS 的
 * 顯示檔被公開路由簽出去（PLAN-PHOTOS §8／§10）。故驗收標準不是「檔案變小了」，
 * 而是**用 exifr 反向驗證剝完真的讀不到 GPS**。
 */

/**
 * 手工組一顆帶 GPS 的 EXIF APP1，包成最小 JPEG（SOI + APP1 + EOI）。
 * 大端序（"MM"）TIFF：IFD0 只有 GPSInfo 指標 → GPS IFD 有經緯度與方位。
 * 座標 ≈ 25.0339, 121.5645（台北 101 一帶）。
 */
function buildJpegWithGps(): Buffer {
  // ── GPS IFD 的 RATIONAL 資料（deg, min, sec）──
  const rational = (num: number, den: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt32BE(num, 0);
    b.writeUInt32BE(den, 4);
    return b;
  };
  const latData = Buffer.concat([rational(25, 1), rational(2, 1), rational(2, 1)]); // 24 bytes
  const lonData = Buffer.concat([rational(121, 1), rational(33, 1), rational(52, 1)]); // 24 bytes

  // 以 TIFF 起點為 offset 0 佈局（見檔內註解）：
  //   header 0..8 | IFD0 8..26 | GPS IFD 26..80 | latData 80..104 | lonData 104..128
  const GPS_IFD_OFFSET = 26;
  const LAT_DATA_OFFSET = 80;
  const LON_DATA_OFFSET = 104;

  const tiff = Buffer.alloc(128);
  let o = 0;
  // TIFF header
  tiff.write('MM', o);
  o += 2;
  tiff.writeUInt16BE(0x002a, o);
  o += 2;
  tiff.writeUInt32BE(8, o);
  o += 4; // IFD0 at offset 8

  // IFD0：1 個 entry（GPSInfo）
  tiff.writeUInt16BE(1, o);
  o += 2;
  tiff.writeUInt16BE(0x8825, o);
  o += 2; // GPSInfo tag
  tiff.writeUInt16BE(4, o);
  o += 2; // type LONG
  tiff.writeUInt32BE(1, o);
  o += 4; // count
  tiff.writeUInt32BE(GPS_IFD_OFFSET, o);
  o += 4; // value = GPS IFD offset
  tiff.writeUInt32BE(0, o);
  o += 4; // next IFD = 0  → o == 26

  // GPS IFD：4 個 entry（tag 遞增）
  const writeEntry = (tag: number, type: number, count: number, value: Buffer | number) => {
    tiff.writeUInt16BE(tag, o);
    o += 2;
    tiff.writeUInt16BE(type, o);
    o += 2;
    tiff.writeUInt32BE(count, o);
    o += 4;
    if (Buffer.isBuffer(value)) {
      value.copy(tiff, o);
      o += 4;
    } else {
      tiff.writeUInt32BE(value, o);
      o += 4;
    }
  };
  tiff.writeUInt16BE(4, o);
  o += 2; // 4 entries
  writeEntry(0x0001, 2, 2, Buffer.from('N\0\0\0', 'latin1')); // GPSLatitudeRef ASCII inline
  writeEntry(0x0002, 5, 3, LAT_DATA_OFFSET); // GPSLatitude RATIONAL×3 @offset
  writeEntry(0x0003, 2, 2, Buffer.from('E\0\0\0', 'latin1')); // GPSLongitudeRef
  writeEntry(0x0004, 5, 3, LON_DATA_OFFSET); // GPSLongitude
  tiff.writeUInt32BE(0, o);
  o += 4; // next IFD = 0  → o == 80

  latData.copy(tiff, LAT_DATA_OFFSET);
  lonData.copy(tiff, LON_DATA_OFFSET);

  // ── APP1：0xFFE1 + length + "Exif\0\0" + TIFF ──
  const ident = Buffer.from('Exif\0\0', 'latin1');
  const payload = Buffer.concat([ident, tiff]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => {
      const l = Buffer.alloc(2);
      l.writeUInt16BE(payload.length + 2, 0); // 長度含自身 2 bytes
      return l;
    })(),
    payload,
  ]);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    app1,
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

/** 掃出所有 0xFFE1（APP1）marker 的位置。 */
function findApp1Markers(buf: Buffer): number[] {
  const hits: number[] = [];
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xe1) hits.push(i);
  }
  return hits;
}

describe('stripJpegApp1', () => {
  it('剝除前 exifr 讀得到 GPS（先確認 fixture 有效）', async () => {
    const jpeg = buildJpegWithGps();
    // jsdom 環境下 exifr 不吃 Node Buffer，改傳 Uint8Array（view，零拷貝）。
    const gps = await exifr.gps(new Uint8Array(jpeg));
    expect(gps?.latitude).toBeCloseTo(25.0339, 3);
    expect(gps?.longitude).toBeCloseTo(121.5645, 3);
  });

  it('剝除後 exifr 讀不到 GPS（隱私驗收，非「檔案變小」）', async () => {
    const stripped = stripJpegApp1(buildJpegWithGps());
    const gps = await exifr.gps(new Uint8Array(stripped));
    // exifr 沒有 GPS 時回 undefined
    expect(gps?.latitude ?? undefined).toBeUndefined();
    expect(gps?.longitude ?? undefined).toBeUndefined();
  });

  it('輸出不含任何 APP1 marker，且保留 SOI/EOI', () => {
    const stripped = stripJpegApp1(buildJpegWithGps());
    expect(findApp1Markers(stripped)).toHaveLength(0);
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8); // SOI
    expect(stripped[stripped.length - 2]).toBe(0xff);
    expect(stripped[stripped.length - 1]).toBe(0xd9); // EOI
  });

  it('保留非 APP1 的 segment（APP0/JFIF 不被誤刪）', () => {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x11, 0x22]); // 假 APP0，len=4
    const withApp0 = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      app0,
      Buffer.from([0xff, 0xe1, 0x00, 0x04, 0xaa, 0xbb]), // APP1，應被移除
      Buffer.from([0xff, 0xd9]),
    ]);
    const stripped = stripJpegApp1(withApp0);
    expect(findApp1Markers(stripped)).toHaveLength(0);
    // APP0 內容仍在
    expect(stripped.includes(Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x11, 0x22]))).toBe(true);
  });

  it('非 JPEG 原樣回傳（防呆）', () => {
    const notJpeg = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    expect(stripJpegApp1(notJpeg)).toEqual(notJpeg);
  });
});
