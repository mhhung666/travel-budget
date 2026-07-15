/**
 * JPEG 消毒：移除所有 APP1（0xFFE1）segment，產生**不含 EXIF／XMP** 的副本。
 *
 * 為什麼：相簿的顯示檔（`<uuid>.jpg`）是刻意**自帶完整 EXIF（含公尺級 GPS）**的
 * （見 PLAN-PHOTOS §3）——那是給成員下載回手機用的。但公開分享路由**絕不可**把這顆 key
 * 簽出去（§8）：一旦外流，位置就永久跟著檔案跑。公開路由改簽這裡產出的消毒副本 `_p.jpg`。
 *
 * **只是移除 marker segment，不重新編碼**——EXIF 是 APP1 marker segment，剝掉不動像素、
 * 不損畫質，成本近乎零（正好是 browser-image-compression 那個 `getApp1Segment` 注入的反操作）。
 * EXIF 與 XMP **都**住在 APP1（兩者都可能帶 GPS），故一律移除。順帶消滅機身序號／
 * OwnerName／Artist／Copyright，不必再另做相機中繼資料白名單。
 *
 * **純函式、無 I/O**：可單元測試。測試以 `exifr` 反向驗證「剝完真的讀不到 GPS」——
 * 這是「錯了很安靜」的隱私邏輯，只看檔案變小不算數（§10）。
 */

const MARKER_PREFIX = 0xff;
const SOI = 0xd8; // Start of Image
const EOI = 0xd9; // End of Image
const SOS = 0xda; // Start of Scan（其後為 entropy-coded 影像資料，停止解析、整段照抄）
const APP1 = 0xe1; // EXIF／XMP 所在的 marker，要移除的就是它
const TEM = 0x01; // 無長度欄位的獨立 marker
const RST0 = 0xd0;
const RST7 = 0xd7;

/** 無長度欄位（standalone）的 marker：TEM 與 RST0–7。SOI／EOI 另行處理。 */
function isStandaloneMarker(marker: number): boolean {
  return marker === TEM || (marker >= RST0 && marker <= RST7);
}

/**
 * 移除 JPEG 中所有 APP1 segment，回傳新的 Buffer。
 *
 * 從 SOI 沿 marker segment 走到 SOS 為止：遇 APP1 丟掉、其餘照抄；SOS（含其後的
 * entropy data）與 EOI 之後整段原樣保留。若輸入不是 JPEG 或結構異常，**原樣回傳**
 * （寧可不消毒也不要吐出壞檔——呼叫端另有前綴/型別把關）。
 */
export function stripJpegApp1(buf: Buffer): Buffer {
  // 不是 JPEG（沒有 SOI）→ 不動它。相簿顯示檔一律 JPEG，這只是防呆。
  if (buf.length < 2 || buf[0] !== MARKER_PREFIX || buf[1] !== SOI) {
    return buf;
  }

  const chunks: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;

  while (i < buf.length) {
    // marker 必為 0xFF；容許多個 0xFF 當 fill byte。非 0xFF ＝ 結構異常，剩餘照抄後結束。
    if (buf[i] !== MARKER_PREFIX) {
      chunks.push(buf.subarray(i));
      break;
    }
    let j = i;
    while (j < buf.length && buf[j] === MARKER_PREFIX) j++;
    if (j >= buf.length) {
      chunks.push(buf.subarray(i));
      break;
    }
    const marker = buf[j];

    // SOS 之後是影像資料、EOI 是結尾——都不再有可解析的 segment，整段照抄後結束。
    if (marker === SOS || marker === EOI) {
      chunks.push(buf.subarray(i));
      break;
    }

    // 獨立 marker（無長度欄位）：連同前導的 0xFF run 照抄。
    if (isStandaloneMarker(marker)) {
      chunks.push(buf.subarray(i, j + 1));
      i = j + 1;
      continue;
    }

    // 一般 segment：marker byte 後接 2-byte big-endian 長度（含長度欄位自身）。
    const lenAt = j + 1;
    if (lenAt + 2 > buf.length) {
      chunks.push(buf.subarray(i));
      break;
    }
    const segLen = buf.readUInt16BE(lenAt);
    const segEnd = lenAt + segLen;
    if (segLen < 2 || segEnd > buf.length) {
      // 長度異常：剩餘照抄後結束，別越界。
      chunks.push(buf.subarray(i));
      break;
    }

    if (marker !== APP1) {
      chunks.push(buf.subarray(i, segEnd)); // 保留（含 0xFF run）
    }
    // APP1 → 略過不 push（即移除）
    i = segEnd;
  }

  return Buffer.concat(chunks);
}
