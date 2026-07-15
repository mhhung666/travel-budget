# 旅程相簿與相片地圖（Trip Album）規劃

> 建立日期：2026-07-15 · 狀態：**Phase 1／2／3／4 已完成（2026-07-15）**；餘 Phase 5（可選）。
> Phase 1–4 實作筆記已入 [FEATURES.md](./FEATURES.md) §17。**全部（必做）階段完成後**才依
> [README.md](./README.md) 慣例刪本檔（草圖查 git 歷史）——Phase 5 為可選加分項，本檔可保留至其定案。
>
> ## 動工後校正（Phase 1／2 實作時發現，與原規劃不符之處）
>
> 這幾條是**實測**出來的，不是推論。Phase 3–4 動工前先讀：
>
> 1. **§6 的「反查地名」是全新功能，不是現成 helper**。repo **沒有任何 reverse geocode**——
>    `ItineraryDay.location` 是使用者在前端用 Nominatim **正向搜尋**選好後整包送進 action 的，
>    **server 端從不做地理查詢**。加上 Nominatim 政策限 1 req/sec（一次挑 20 張＝20 秒的 action），
>    故 **Phase 1 的 `place` 一律留 `null`**，schema 形狀留好，Phase 3 地圖整合時再回頭填
>    （屆時建議離線批次跑，不要塞進上傳流程）。
> 2. **exifr 的選項不能照 §3 直覺寫**：`{ pick: [...], gps: true }` 會**靜靜地不回**
>    `latitude`／`longitude`（pick 一開就不做 GPS 合成），且預設會把 `Orientation` 翻譯成
>    `'Rotate 90 CW'` 這種**字串**。正解是明確列 block ＋ `translateValues: false`，
>    見 [exif.ts](../src/lib/exif.ts) 的 `EXIFR_OPTIONS`（該處註解已寫明「別隨手改」）。
> 3. **上傳簽名改成一次簽兩張**（`createPhotoUploadUrls`），非 §6 表格寫的「呼叫兩次」。
>    因為 §4 要求 `_t`／`_p` 能從顯示檔 key 推導，兩顆物件就**必須共用同一個 uuid**；
>    分兩次呼叫會拿到兩個不相干的 uuid，那條規則就沒了。
> 4. **§3 的 `preserveExif` 源碼限制已核對屬實**（`browser-image-compression@2.0.2`），
>    且與 `useWebWorker: true` **相容**（EXIF 是在 worker 回來後於主執行緒套用的）。
> 5. **新發現的坑（尚未處理）**：SW 的 `r2-images` 快取 `maxEntries: 128` 是為收據設計的，
>    相簿數十張縮圖會把收據擠出快取；`presignGetStable` 每小時輪替簽名又會加速消耗。
>    已記入 [IMPROVEMENTS.md](./IMPROVEMENTS.md) §H，待實測用量後決定。
> 6. **Phase 2 實作時的兩處與 §6 表格不符**（都是刻意的）：
>    - `deletePhoto`（單張）**已改為 `deletePhotos(tripIdOrCode, { photo_ids })`**（批次）。
>      Phase 2 要做批次選取刪除，逐張呼叫 = N 次 action + N 次 `deleteObjects`；讓單張走批次
>      路徑則零代價，故不留兩支。
>    - **§5 的 `place` 在 `source: 'itinerary'` 時仍留 null**：借行程日座標時「順手把當天的地名
>      快照進去」很誘人（不需要反查、資料就在同一個 query 裡），但 `place` 的語意是**這張相片所在
>      地點**，而不是「當天的城市」——填了會讓 Phase 3 的地圖分不出哪些 place 是真的反查來的。
>      `place` 仍整包留給 Phase 3。
> 7. **§5 沒寫、但 Phase 2 一做行程日關聯就冒出來的不變式**：`source: 'itinerary'` 的座標是
>    **借**的，必須跟著來源走——所以 `deleteItineraryDay`／`updateItineraryDay` 都得回頭清／
>    改 `Photo`（無 FK cascade）。Phase 3 的地圖若看到 `'itinerary'` 座標，可以信任它指向的行程日
>    還活著且地點沒變。**新增任何會動到 `ItineraryDay.location` 或刪除行程日的路徑時，這條要一起維護。**
> 8. **Phase 4 實作時的三處決策（與 §7／§8 一致，但值得記下）**：
>    - **公開頁顯示旅程名稱**（與使用者確認）：§8 明列公開 DTO 給「相片／說明／日期」，未列旅程名；
>      opt-in 主動分享符合共享相簿慣例，故公開 API 額外回 `trip_name`（只有旅程**名**，仍不露 id／
>      成員／日期範圍）。`PublicAlbumPhoto` 本身維持 §8 契約，不含 location／place／exif。
>    - **消毒副本 `_p.jpg` 採 idempotent 三處補產**（[photoSanitize.ts](../src/lib/photoSanitize.ts)
>      `ensureSanitizedPhotoCopies`）：開分享時預熱、分享中新上傳補產、公開路由 self-heal。穩態＝
>      一次 `listKeys`、零產生。§8 只說「Phase 4 才產生」沒定何時，這是實作補上的答案——避免第一位
>      訪客觸發整本相簿的即時剝除。
>    - **APP1 剝除在 server 端做**（[jpegSanitize.ts](../src/lib/jpegSanitize.ts) `stripJpegApp1`），
>      不是 §8 想的「`getApp1Segment` 的前端反操作」：顯示檔已在 R2，server GET 回來剝再 PUT `_p.jpg`
>      最直接，也讓消毒邏輯有 Vitest 反向驗證（exifr 讀不到 GPS）。

## 1. 背景與定位

目前 app 裡的「相片」是**收據的副產品**：`getMapPhotos`（[map.actions.ts](../src/actions/map.actions.ts)）
把「有圖片附件、且關聯到含座標行程日」的支出釘上地圖，座標**借自行程日**而非相片本身。
這能用，但語意是錯的——收據是憑證不是回憶，而且一整天的相片全擠在同一顆行程日座標上。

**核心定位：相簿是旅程的第一級內容，座標來自相片自己的 EXIF GPS。**
這讓旅遊地圖從「旅程去過哪些城市」升級成「這張照片是在這個街角拍的」。

**相簿要「取代」收據釘地圖，不是與它並存**——收據衍生的相片模式在 Phase 3 退役（見 §7）。
這也是本規劃把地圖重新設計包進來的原因：它不是附帶的加分項，是這功能的終點之一。

歸屬：**trip-scoped、成員共享**（同 Checklist／Note 的成員信任模型：任何成員可上傳／編輯／刪除）。

## 2. 目標／非目標

**目標**
- 旅程下的共享相簿：上傳、瀏覽（grid＋lightbox）、說明、刪除。
- 壓縮到合理大小（空間有限），但**壓縮後的檔案仍自帶完整 EXIF（含 GPS）**——
  使用者從 iPhone／Android 存回手機時，Apple 照片／Google 相簿要讀得到地點。
- 地理座標與相機參數另抽一份進 DB 欄位，供地圖釘點／排序／篩選查詢。
- 相片 EXIF GPS → 旅遊地圖的精確釘點，**取代並退役**現行收據衍生的相片模式（§7）。
- **可選擇性公開分享**相簿（opt-in，同 `mapShareCode` 模式）；公開版是**純相片牌、不帶任何位置資訊**（§8）。

**非目標（刻意不做）**
- 影片（體積與轉檔成本完全不同量級，另案）。
- 人臉／物件辨識、自動相簿分類、AI 選圖。
- 相片編輯（裁切／濾鏡）——上傳前使用者自己的相機 app 已經做完了。
- **原檔／全解析度保存**——相簿不是攝影作品庫；壓縮到 2560px 且保有 EXIF 已滿足「存回手機」的需求（§3）。

## 3. 關鍵技術取捨：輸出格式決定 EXIF 能不能留（本規劃的核心）

**先破除一個誤解：壓縮本身不會丟掉 EXIF。**
Lightroom 重新輸出的照片保有 EXIF，是因為它**主動把 metadata 寫回輸出檔**——這是正常且普遍的做法，
不是什麼特權。丟掉 EXIF 的**不是「壓縮」，是我們選的方法：canvas 重繪**。
canvas 是純像素表面、沒有 metadata 概念，`toBlob()` 吐出來的是一個全新的、乾淨的檔案。
**所以這不是瀏覽器限制，是 pipeline 的選擇**——而且是可以改的選擇。

**現成解法：`browser-image-compression`（本專案已安裝）的 `preserveExif: true`。**
它做的正是 Lightroom 做的事：把原檔的 **APP1（EXIF）segment 原封搬進壓縮後的輸出**。

**但有一個硬限制，決定了整個設計。** 讀它的源碼：

```js
// node_modules/browser-image-compression（節錄）
preserveExif && "image/jpeg" === e.type && (!o.fileType || o.fileType === e.type)
```
→ **只在「輸入是 JPEG 且輸出也是 JPEG」時生效。輸出 WebP 一律沒有 EXIF。**
（實作是直接搬 JPEG 的 APP1 segment，WebP 容器塞不進去。）

**所以真正的取捨是「WebP vs JPEG」，不是「壓縮 vs EXIF」。**
既然 EXIF 要留，**顯示／下載檔就輸出 JPEG**，代價是同畫質下比 WebP 大約 25–30%——這個代價值得付：

**決策：輸出 JPEG＋`preserveExif`，不留原檔。**

```
選檔 → exifr.parse(原始 File)          ← 必須在任何 canvas 操作之前
     → 取出 GPS / 相機 / 拍攝時間 → 進 DB 欄位（供查詢）
     → compressImage(file, 'photo')     ← 輸出 JPEG 2560 + preserveExif: true
                                          → 壓縮檔自帶完整 EXIF（含 GPS）
     → 縮圖 400 WebP（不需 EXIF）
     → 兩顆直傳 R2 → addTripPhotos(keys, exif結構)  ← headObject + Zod 驗證後入庫
```

**這比「留 5MB 原檔」在幾乎每個軸上都更好**（原檔方案已作廢，理由在此）：

| | 留原檔方案 | **JPEG＋preserveExif** |
|---|---|---|
| 下載回手機有 EXIF | ✅（原檔） | ✅（壓縮檔自帶） |
| 每張儲存 | ~3.6MB | **~1.2MB** |
| R2 免費 10GB 可放 | ~2,800 張 | **~8,000 張** |
| 5MB 上限擋掉單眼直出 | ❌ 會擋 | 不適用（壓縮後才存） |
| 物件數／張 | 3 | **2** |

**`preserveExif` 還順手處理了 orientation**：它的函式叫 `copyExifWithoutOrientation`——
搬 EXIF 時會把 Orientation tag **重設為 1**，因為 canvas 已經把旋轉烤進像素了。
若照搬原值會**二次旋轉**（照片躺著）。這個坑它替我們踩過了，別自己手刻 EXIF 注入。

**DB 那份 EXIF 仍然要存**，與檔案裡那份不重複、各司其職：
地圖釘點、依拍攝時間排序、「找出這顆鏡頭拍的」，不可能為了讀 metadata 去下載解析每一顆 JPEG。
**檔案裡那份是給使用者帶走的，DB 那份是給 app 查詢的。**

**函式庫**：`exifr`（讀取，~30KB gzip、可 `pick` 只取需要的 tag）。
寫入不必自己來（`preserveExif` 已涵蓋），所以**不需要** `piexifjs`。

### 手機來源：iPhone 的 HEIC 與 Android

（`HEIF` 是容器、`HEIC` 是其中 HEVC 編碼的那種，iPhone 拍的就是 HEIC；以下統稱 HEIC。）

**iPhone 預設拍 HEIC，而 Chrome／Firefox／Edge／Android 都無法在 `<img>` 渲染 HEIC**（只有 Safari 可以）。
所以 HEIC 的難處**從來不是上傳**（白名單加一行就開放），**是上傳完之後能不能顯示**。

**好消息：現行程式碼已經在用一個免費的折衷方案，不必新增任何依賴。**
[NoteComposer.tsx](../src/components/trips/detail/notes/NoteComposer.tsx) 與
[ReceiptAttachments.tsx](../src/components/trips/detail/ReceiptAttachments.tsx) 的
`accept` 都是 `image/jpeg,image/png,image/webp`——**刻意沒有列 HEIC**。
在 `accept` 不含 HEIC 時，**iOS 照片選取器會自動把 HEIC 轉成 JPEG 才交給網頁，且 EXIF（含 GPS）保留**。
HEIC 根本進不到 pipeline。相簿沿用同一個 `accept` 即可。

**這個轉檔行為與 §3 的 `preserveExif` 剛好完美咬合**：iOS 交出來的是 **JPEG**，
正好落在 `preserveExif` 唯一支援的 JPEG→JPEG 路徑上。兩件事互相成全，不是巧合——
JPEG 是行動裝置相片的通用貨幣。

**各來源盤點**：

| 來源 | 交給網頁的格式 | EXIF | preserveExif |
|---|---|---|---|
| iPhone 相簿（HEIC） | JPEG（iOS 自動轉） | ✅ 含 GPS | ✅ |
| iPhone／Android 現拍 | JPEG | ✅ 含 GPS | ✅ |
| Android 相簿（多數） | JPEG | ✅ 含 GPS | ✅ |
| Android 相簿（Samsung 等 HEIC） | JPEG（同 accept 機制） | ✅ | ✅ |
| 螢幕截圖 | PNG | 本來就沒有 | 不適用（無妨） |
| 桌面拖放 `.heic` | **不會被轉** | — | ❌ 被白名單擋下 |

→ **建議：不引入 `heic-to`／`libheif-js`**，零依賴、零解碼成本。
→ **動工時必須真機驗證**（iPhone Safari／Chrome、Android Chrome、桌面拖放 `.heic`）：
   `accept` 轉檔是**平台行為、不是規格保證**。**桌面從檔案總管拖放 `.heic` 不會被轉**，
   要靠伺服器端型別白名單擋下並給明確錯誤訊息（而不是默默壞掉）。
   驗證時**用真的用手機拍的照片**，並確認**下載回手機後 Apple 照片／Google 相簿讀得到地點**——
   那才是這功能的驗收標準，不是「檔案存進去了」。

**壓縮參數**（新增 preset，見 §5）：顯示檔長邊 2560、輸出 **JPEG**、`preserveExif: true`、`maxSizeMB: 2`。
實務上 2560px JPEG q80 多半落在 **0.6–1.2MB**（比 WebP 大約 25–30%，這是留 EXIF 的價錢）；
另存一張 400px **WebP** 縮圖（~30KB，縮圖不需要 EXIF）給 grid，
不要讓相簿列表載入數十張全尺寸圖。

**EXIF 是不可信輸入**：client 送什麼 server 就收什麼，且 server 無法自行重新推導（它看不到 bytes）。
入庫前必須 Zod 驗證：`lat` ∈ [-90, 90]、`lon` ∈ [-180, 180]、`takenAt` 落在合理區間、
字串欄位長度上限。不合格就丟掉該欄位（而非整張拒收）。

## 4. 儲存與簽名（決策：私有 bucket ＋ 穩定簽名窗）

**bucket：沿用現有私有 `receipts` bucket，新前綴 `photos/<tripId>/`。不開公開 bucket。**

即使需要公開分享，也不需要公開 bucket——**公開分享頁的 server 端驗過 share code 之後自己簽短效 GET URL 即可**
（share code 就是那把鑰匙，同 `/api/public/*` 的既有模式）。這比公開 bucket 好在：

- **可撤銷**：關掉分享 → 不再簽發新 URL，已發出的在窗口內過期就死。公開 bucket 的物件一旦外流，永久有效。
- 只有一份儲存、一套 key 命名，不必在兩個 bucket 間同步／刪除。
- presign 是**純 HMAC 計算、沒有網路往返**，一次簽 200 張 URL 的成本可忽略——效能疑慮不成立。

**但有一個真的坑：簽名 URL 會打爆 SW 快取。**
[sw.ts](../src/sw.ts) 對 R2 圖片是 `CacheFirst`，快取 key = 完整 URL。
`presignGet` 每次呼叫都產生**不同**的 `X-Amz-Date`／`X-Amz-Signature`
→ 同一張相片每次瀏覽都是新 URL → 快取永遠 miss、而且無限膨脹。
現行 GET TTL 只有 300 秒（[storage.ts](../src/lib/storage.ts)），收據一次看一兩張無所謂，相簿幾十張就會很明顯。

→ **新增 `presignGetStable(bucket, key, windowSeconds)`**：把簽名時間戳**對齊到整點窗口**
（例：窗口 1 小時 → 同一小時內對同一 key 產生**逐字元相同**的 URL）。
如此 SW／瀏覽器快取才會命中，離線也才看得到剛看過的相簿。
收據沿用現行 `presignGet`（300s、不對齊），**不要動它**——那是刻意的短效。

**每張相片兩顆物件**（顯示／下載＋縮圖，理由見 §3）：
```
photos/<tripId>/<uuid>.jpg     顯示＋下載（長邊 2560，~0.6–1.2MB，**自帶 EXIF**）
photos/<tripId>/<uuid>_t.webp  縮圖（長邊 400，~30KB，grid 用，無 EXIF）
```
沿用 `buildObjectKey` 的 owner 區段規則（`tripId` 由**伺服器端**從 membership 帶入，client 不可指定）。
**沒有第三顆「原檔」**——`preserveExif` 讓顯示檔本身就帶著 EXIF，原檔失去存在理由（§3 對照表）。

**刪除**：同現行 no-cascade 契約——刪相片／刪旅程時，兩顆 blob 都是 **best-effort 刪除**
（失敗只 log，不讓使用者操作失敗）；`deleteObjects` 一次批次收掉。

**上限與空間帳**：`MAX_PHOTO_BYTES = 3MB`（伺服器端硬防線；壓縮後正常落在 1.2MB 以內，
這條線只擋異常）。**使用者選檔階段不設 5MB 上限**——單眼直出的 12MB JPEG 壓縮後一樣是 1MB 上下，
沒有理由擋。前端只需擋「明顯不合理」的超大檔（例如 > 50MB，避免瀏覽器解碼卡死）。

| | 每張 | R2 免費 10GB 約可放 |
|---|---|---|
| 留 5MB 原檔（已作廢） | ~3.6MB | ~2,800 張 |
| WebP 無 EXIF（已作廢） | ~0.65MB | ~17,000 張 |
| **JPEG＋preserveExif（本方案）** | **~1.2MB** | **~8,000 張** |

**別過度擔心空間**：R2 超出免費額度是 **$0.015/GB/月**——100GB（約 8 萬張）也才 **$1.5/月**，
且 R2 **egress 免費**。真正的風險是失控成長而非單價，所以仍建議**每旅程 300 張**軟上限
（超過時提示，不做硬刪）。

## 5. 資料模型

**新 model `Photo`**（trip-scoped 獨立 collection，同 Note／Checklist 的定位）：

```ts
{
  trip: ObjectId,              // ref Trip
  key: string,                 // 顯示＋下載 photos/<tripId>/<uuid>.jpg（自帶 EXIF）
  thumbKey: string,            // 縮圖       photos/<tripId>/<uuid>_t.webp
  contentType: string,         // 一律 image/jpeg
  size: number,
  width: number, height: number,

  takenAt: Date | null,        // EXIF DateTimeOriginal；缺則退 file.lastModified
  location: {                  // null = 這張沒有地理資訊
    lat: number, lon: number,
    source: 'exif' | 'itinerary' | 'manual',
  } | null,
  place: {                     // 反查地名快照，形狀對齊 ItineraryDay.location
    name: string, names: LocalizedNames, country_code: string,
  } | null,
  exif: {                      // 全部 optional，缺就是缺
    make, model, lens: string,
    iso, fNumber, exposureTime, focalLength: number,
    orientation: number,
  },

  itineraryDay: ObjectId | null,  // 可選關聯（Phase 2）
  caption: string,
  uploadedBy: ObjectId,
  uploadedByName: string,      // 建立當下快照，同 Note.authorName（讀取免 populate）
}
```

索引：`{ trip: 1, takenAt: -1 }`（相簿主排序）、`{ trip: 1, itineraryDay: 1 }`（Phase 2 分組）。

**`location.source` 是刻意留的欄位**：EXIF 有 GPS 就用 EXIF；沒有（截圖、關了定位、社群下載圖）
就退回關聯行程日的座標並標 `'itinerary'`；使用者手動拉釘則為 `'manual'`。
地圖上可依 source 區分精確度，也讓「這張為什麼釘在這」可解釋。

**新 `UploadKind: 'photo'`**（[uploads.ts](../src/lib/uploads.ts)）：
`PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/webp']`（顯示檔 JPEG＋縮圖 WebP，壓縮後只會是這兩種）、
`MAX_PHOTO_BYTES = 3MB`。搭配 `photoKeyPrefix(tripId)` / `isPhotoKeyForTrip(tripId, key)`，
沿用既有那三組 helper 的形狀。

**注意白名單不收** `image/heic`／`image/heif`（§3：`accept` 不列 HEIC，iOS 會自動轉 JPEG）——
桌面拖放 `.heic` 會在這裡被擋下，前端要給明確錯誤訊息。
也**不收 `image/png`**：PNG 進得來（截圖），但壓縮後一律輸出 JPEG／WebP，不會有 PNG 上傳。
伺服器端上限是**硬防線**：presigned PUT 管不住 client 實送內容，`addTripPhotos` 仍要 `headObject` 覆驗。

**新 CompressPreset**：`photo`（2560 / 2MB / **`fileType: 'image/jpeg'` ＋ `preserveExif: true`**）、
`photoThumb`（400 / 0.05MB / WebP，不需 EXIF）。
現行 [imageCompress.ts](../src/lib/imageCompress.ts) 的 preset 型別只有 `{ maxWidthOrHeight, maxSizeMB }`
且硬寫 `fileType: 'image/webp'` —— **要把 `fileType`／`preserveExif` 提升成 preset 的一部分**，
`receipt`／`avatar` 維持現行 WebP 行為不變（它們不需要 EXIF，別順手改壞）。

## 6. Server actions

全部走 `withAuth` + `getTripMembership`（**無 RLS，每個 action 自己驗**）：

| action | 說明 |
|---|---|
| `createPhotoUploadUrl(tripIdOrCode, contentType, size)` | 比照 `createNoteUploadUrl`，kind `'photo'`。一張相片呼叫兩次（顯示檔／縮圖）。 |
| `addTripPhotos(tripIdOrCode, items[])` | 每張的**兩顆 key 都** `headObject` 覆驗真實大小/型別 → Zod 驗 EXIF → 反查地名 → 批次 insert。 |
| `getTripPhotos(tripIdOrCode)` | 回 DTO（`thumbUrl`/`url`，用 `presignGetStable` 批次簽）。 |
| `updatePhoto(photoId, { caption, itineraryDay, location })` | 說明／關聯／手動拉釘。**關聯行程日時，沒有 GPS 的相片借當天座標**（`source: 'itinerary'`）；exif／manual 的座標不被覆蓋，解除關聯則收回借來的座標。 |
| ~~`deletePhoto(photoId)`~~ → `deletePhotos(photoIds[])` | 刪 docs + best-effort 刪 blob（一次 `deleteObjects`）。**單張也走這裡**，見檔頭校正 6。 |

**下載** = 直接給顯示檔的簽名 URL（`<a download>`）——它本身就是一張帶 EXIF 的 JPEG，
不需要額外的「原檔下載」action。iOS Safari 長按存到「照片」／Android 下載後入相簿，
**GPS 都會跟著進去**，Apple 照片與 Google 相簿會正確定位。這正是本功能的驗收標準（§3）。

一律回 `ActionResult<T>`、錯誤碼取自 `ErrorCodes`、`await dbConnect()`。
`addTripPhotos` **一次收一批**（一次挑 20 張就是 20 個 headObject，但只有一次 DB round trip），避免 N+1。

## 7. 地圖重新設計：相簿**取代**收據相片模式

**已拍板：收據釘地圖（`getMapPhotos`）就是要被相簿取代的功能，Phase 3 直接退役、不留聯集。**
收據是憑證不是回憶，它會出現在地圖上只是因為當時沒有別的相片來源。

新的相片圖層改讀 **`Photo` collection**：

- 座標優先 `location`（EXIF）→ 退關聯行程日 → 手動拉釘，由 `location.source` 標示。
- 同座標去重的 `toFixed(2)`（~1km）**要放寬**：EXIF 精度到街廓，四捨五入到 1km 會把整條街的
  相片誤判成同一張而丟掉。改以 `photoId` 為 key，座標近的用 marker cluster 在**前端**處理。
- 簽名改用 `presignGetStable` 批次簽（現行是逐張 `getReceiptUrl`）。

**不做資料遷移（backfill），這是刻意的。**
把既有收據圖片倒進 `Photo` 看似體貼，實際上會倒進**正好是本規劃要消滅的那種低品質資料**：
它們在當初以 `'receipt'` preset 上傳時就已經過 canvas 壓縮，**EXIF 早就永久消失**、無從復原，
座標也只能繼續用行程日借的——等於新相簿一開張就先塞滿沒有 GPS 的收據照。相簿是回憶，不是憑證。

**代價要認**：Phase 3 切換當下，既有使用者的地圖相片圖層會**變空**，直到他們上傳相簿相片。
→ 緩解：Phase 3 **排在 Phase 1/2 上線一段時間之後**才切，讓相簿先有內容；
→ 可選的橋接（非必要）：支出的收據縮圖給一個「加入相簿」動作，讓使用者**手動**把想留的那幾張
   收進相簿（EXIF 沒了、座標記為 `source: 'itinerary'`）。這是使用者逐張選擇，不是系統性倒資料。

**Phase 3 要刪掉的東西**（退役＝真的刪，不要留死碼）：
[map.actions.ts](../src/actions/map.actions.ts) 的 `getMapPhotos`／`MapPhoto`／`PhotoAggRow`
＋ `src/actions/index.ts` 的 re-export、[useMapPhotos.ts](../src/hooks/queries/useMapPhotos.ts)、
[PhotoPinDialog.tsx](../src/components/map/PhotoPinDialog.tsx)（改綁相簿簽名，不再用 `getReceiptUrl`）、
[photos.ts](../src/components/map/photos.ts) 的 `groupPhotoPins`（分群邏輯留著、輸入型別換掉）、
[mapPhotos.test.ts](../src/__tests__/mapPhotos.test.ts)（改寫）、
[TripMapView.tsx](../src/components/map/TripMapView.tsx) 的 `mode === 'photos'` 資料源。
`getReceiptUrl` 本身**留著**——支出頁的收據檢視還要用，只是地圖不再是它的呼叫端。

同時要更新 [ARCH-NOTES.md](./claude/ARCH-NOTES.md) §旅遊地圖那句
「照片模式（收據照釘在行程日座標）恆為登入限定」——描述的是被取代掉的舊行為。

## 8. 公開分享：**公開相簿完全不帶位置**

決策：**相簿可 opt-in 公開分享**。做法比照 `User.mapShareCode`：
`Trip.albumShareCode`（sparse-unique、`hash_code` 同格式、預設關閉）＋公開頁 `/album/share/<code>`
（不列入 [proxy.ts](../src/proxy.ts) 的 protectedRoutes）。

**決策：公開相簿是「純相片牌」——照片＋說明＋日期，不顯示地圖、不顯示地名、不輸出座標。**
所以**不做座標模糊化**：沒有座標可模糊。地圖與位置是**成員限定**的功能。

這個決定讓 §8 從「風險最高的一段」變成最簡單的一段，因為**位置有兩條獨立的外洩路徑，
而純相片牌把兩條同時切斷**：

| 外洩路徑 | 阻斷方式 |
|---|---|
| ① **檔案裡**的 EXIF GPS（下載後永久跟著跑） | 公開路由只給**消毒副本**，見下 |
| ② **頁面上**的座標（DTO 的 lat/lon、地圖釘點） | 公開 DTO **根本沒有** `location`／`place`／`exif` 欄位 |

**只擋一條是沒有意義的**——剝了 EXIF 卻在頁面上釘精確座標，位置照樣公開；
反之模糊了頁面座標卻給出帶 EXIF 的原始 JPEG，模糊化完全白做。兩條一起切才成立。

**① 消毒副本（Phase 4）**：`photos/<tripId>/<uuid>_p.jpg`。
**決定在 §3 留 EXIF，就等於顯示檔本身是一顆帶著公尺級 GPS 的手榴彈**，公開路由**絕不可簽 `.jpg`**。
做法是**移除 JPEG 的 APP1 segment 即可，不需要重新編碼**（EXIF 只是個 marker segment，
剝掉不損畫質、成本近乎零，正好是 `browser-image-compression` 那個 `getApp1Segment` 的**反操作**）。
公開 DTO 只給 `_p.jpg` 與 `_t.webp`（縮圖經 canvas 產生，天生無 EXIF ✅），**`key` 連 DTO 都不該進**。
→ **Phase 1 不必做這顆**（未分享的旅程不需要），但 **`_p` 的 key 規則要現在就定好**。
→ 順帶解決另一件事：APP1 剝掉之後，機身序號／`OwnerName`／`Artist`／`Copyright`
   （有些相機會寫入機主姓名）也一併消失，**不需要再做相機中繼資料白名單**。

**② 公開 DTO 的形狀**：只有相片 URL、說明、日期。
**不露** `location`／`place`／`exif`／uploader 身分／旅程 id／成員名單。
這是**獨立的 DTO 型別**，不要用成員版 DTO 加 `omit`——漏一個欄位就是隱私事故，
用型別把它變成不可能（比照 `toExpenseDto` 的 `{ attachments: false }` 選項是刻意契約的精神）。

**收據永遠不進相簿分享**：`photos/` 與 `receipts/` 是不同前綴，公開相簿路由只簽 `photos/` 前綴的 key，
且必須驗 `isPhotoKeyForTrip`。現行「收據永不出現在未登入頁」的硬規則**不受本規劃影響**。

**既有公開地圖 API 的契約也不動**（只露座標／在地化地名／年份）——相簿分享是另一條路由、
另一套契約，**不要把相片餵進** `/api/public/map/[code]`。

> **日後若想讓公開相簿顯示位置**（地圖或地名），這個決定要重開：屆時座標模糊化就變成必要的，
> 因為 ② 那條路徑會被打開。現在省下模糊化是**因為公開頁沒有位置**，不是因為模糊化不重要。
- **既有公開地圖 API 的契約不動**（只露座標／在地化地名／年份）——相簿分享是**另一條路由**、
  另一套契約，不要把相片餵進 `/api/public/map/[code]`。

上線時 [CLAUDE.md](../CLAUDE.md) 的硬規則要補一條：
**公開相簿路由只簽 `photos/<tripId>/<uuid>_p.jpg`（消毒副本）與 `_t.webp`，絕不簽 `.jpg`；
公開相簿 DTO 永不含 `location`／`place`／`exif`。**

## 9. 落地階段

| Phase | 內容 | 成本 |
|---|---|---|
| ~~**1**~~ | ~~`Photo` model＋`'photo'` UploadKind／preset＋**EXIF 讀取（DB）＋JPEG `preserveExif`（檔案）**＋`presignGetStable`＋相簿 grid／lightbox／下載。成員限定、私有。~~ **✅ 完成 2026-07-15**（`place` 反查除外，見檔頭校正 1） | **M** |
| ~~**2**~~ | ~~關聯行程日（含無 GPS 相片退回當天座標，`source: 'itinerary'`）、說明編輯、批次選取／刪除、行程日頁顯示當天相片。~~ **✅ 完成 2026-07-15**（`place` 仍留 null，見檔頭校正 6） | S |
| ~~**3**~~ | ~~地圖整合：相片圖層改讀 `Photo`、EXIF 精確釘點、前端 cluster，**同時刪除收據相片模式**（§7）。~~ **✅ 完成 2026-07-15**（顯示標籤沿用關聯行程日地名，相片自己的反查地名 `place` 待離線批次回填，見檔頭校正 1／§7；分群 bucket 收緊到 ~11m 4dp） | M |
| ~~**4**~~ | ~~公開相簿分享（`albumShareCode`＋**消毒副本 `_p.jpg`**＋獨立的無位置公開 DTO）。純相片牌，不含地圖。~~ **✅ 完成 2026-07-15**（見檔頭校正 8：公開頁**顯示旅程名稱**、消毒副本採 idempotent 三處補產） | M |
| **5**（可選） | 相簿封面、打包下載（zip）、Year in Review 整合。 | S |

**Phase 1 就要定案、否則之後要 migration 回填的**：`location.source`、`exif` 子文件形狀、
`thumbKey`、`_p` 消毒副本的 key 規則（§8）。
**`preserveExif` 尤其不能等**——Phase 1 若先出了不帶 EXIF 的版本，那批相片的 EXIF
就在使用者的瀏覽器裡被 canvas 丟掉了，**之後永遠補不回來**（同 §7 不 backfill 收據圖的理由）。
（同 PLAN-LOYALTY 的 `ownAirline` 教訓：形狀留好，值可以之後才有。）

## 10. 實作前必辦

- **四語系字串全補**（`en`／`zh`／`zh-CN`／`jp`），驗證：`grep -l "<key>" src/i18n/messages/*.json` → 4 個檔。
- Photo collection 是**新增**、非改欄位形狀 → Phase 1 靠 Mongoose `autoIndex` 即可，**不需要 migration**。
  Phase 4 的 `Trip.albumShareCode` 也是純新增欄位（sparse index），同樣免回填。
- DTO 形狀進 TanStack Query 快取 → **bump `PERSIST_BUSTER`**（[queryPersister.ts](../src/lib/queryPersister.ts)）。
- 純函式（EXIF 正規化、APP1 剝除、`presignGetStable` 的窗口對齊）要有 Vitest 單元測試——
  這幾個是「錯了很安靜」的那種 bug。**APP1 剝除尤其要測到「剝完真的讀不到 GPS」**
  （用 `exifr` 反向驗證輸出，而不是只看檔案變小了），錯了就是隱私事故。
- 路徑用 [routes.ts](../src/constants/routes.ts) 的 builder，不要硬寫字串。
