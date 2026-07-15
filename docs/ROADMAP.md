# 功能藍圖（Feature Roadmap）

> 建立日期：2026-06-26（最後更新：2026-07-15）
> 性質：產品功能藍圖——只列**尚未動工**的功能構想，附優先序與落地草圖（schema / actions / UI 影響）。
> 相關文件：**已完成功能**的紀錄見 [CHANGELOG.md](./CHANGELOG.md)、實作細節見 [FEATURES.md](./FEATURES.md)；架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)；程式碼 / 基礎設施層級的改善見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)。

圖例：💎 旗艦（高價值、定義產品）　⭐ 高價值　🔹 加值 / 驚喜
成本：S（數天）／M（一兩週）／L（需基礎設施或大改）

> 慣例：本文件只列**待辦**。功能一旦完成 → 實作筆記寫進 [FEATURES.md](./FEATURES.md)、在 [CHANGELOG.md](./CHANGELOG.md) 加一行、並把本檔該項刪掉。原始草圖如需回顧，查本檔 git 歷史。

---

## 待辦

### 11b. 🔹 第三方登入 (OAuth) — M〔頭像已完成，OAuth 待做〕
**為什麼**：降低註冊摩擦。
**做法**：Google 登入可用 Auth.js 或自建，與現有自製 JWT 並存。

### 20. ⭐ 會籍積分與里程紀錄 (Loyalty ledger) — 餘 Phase 2/3〔Phase 1 國泰 MVP 已完成 2026-07-14〕
**待做**：Phase 2＝華航／長榮（補規則常數＋program 切換 UI；動工時門檻需重新查證）；
Phase 3（可選）＝積分區間預估；更遠期＝飯店會籍（夜數制）。
**完整規劃見 [PLAN-LOYALTY.md](./PLAN-LOYALTY.md)；Phase 1 實作筆記見 [FEATURES.md](./FEATURES.md) §16。**

### 21. 💎 旅程相簿與相片地圖 (Trip album) — 餘 Phase 4〔Phase 1 相簿本體、Phase 2 行程日關聯、Phase 3 地圖整合已完成 2026-07-15〕
**為什麼**：目前的「相片」只是收據的副產品——`getMapPhotos` 拿收據附件、座標**借自行程日**，
一整天的相片全疊在同一顆點上。相簿讓相片變成旅程的第一級內容，並用相片自己的 EXIF GPS
把旅遊地圖從「去過哪些城市」升級成「這張是在這個街角拍的」。
**收據釘地圖是被本功能取代的對象**：Phase 3 直接退役，不留聯集、不做資料遷移（既有收據圖的
EXIF 在當初上傳壓縮時就已永久消失，倒進相簿只會塞滿沒有 GPS 的憑證照）。
**核心難點**：丟掉 EXIF 的不是「壓縮」而是 **canvas 重繪**（現行 pipeline 輸出 WebP）→
改用已安裝的 `browser-image-compression` 的 **`preserveExif`（僅 JPEG→JPEG 有效）輸出 JPEG**，
壓縮檔即自帶 GPS（另抽一份進 DB 供地圖／排序查詢），不需保留原檔。
另有簽名 URL 打爆 SW 快取、以及**公開分享絕不可直接給帶 EXIF 的 JPEG**（需剝除 APP1 的消毒副本）兩個坑。
公開版是純相片牌、不帶位置（故不需座標模糊化），地圖與位置為成員限定。
**待做**：Phase 4＝公開相簿分享＋消毒副本 `_p.jpg`（M）。
**Phase 1 已落地**：`Photo` model、`'photo'` UploadKind／preset、EXIF 讀取（DB）＋JPEG `preserveExif`（檔案）、
`presignGetStable`、相簿 grid／lightbox／下載。成員限定、私有。
**Phase 2 已落地**：行程日關聯（無 GPS 的相片借當天座標，`source: 'itinerary'`）、說明編輯、
批次選取刪除（`deletePhotos`）、行程日卡片顯示當天相片。
**Phase 3 已落地**：地圖相片圖層改讀 `Photo`（EXIF 精確釘點、~11m 分群＋前端 cluster）、
`presignGetStable` 批次簽發、釘點對話框改綁相簿 `PhotoLightbox`，**收據衍生相片模式已退役**
（顯示標籤暫沿用關聯行程日地名，相片自己的反查地名 `place` 待離線批次回填）。
**完整規劃見 [PLAN-PHOTOS.md](./PLAN-PHOTOS.md)；Phase 1–3 實作筆記見 [FEATURES.md](./FEATURES.md) §17。**

### 14. 🔹 PDF 行程 / 結算報告 (PDF reports) — M
**為什麼**：目前只有 CSV。一份漂亮的「旅程結算單 / 行程手冊」PDF 很適合分享與報帳。
**做法**：既有 [src/lib/exporters/](../src/lib/exporters/) 已抽象化，新增 PDF exporter（`@react-pdf/renderer` 或伺服端 puppeteer）。

### 進階深化（已完成功能的延伸）
- **#1 預算**：每日步調、每人預算。
- **#3 分帳**：逐項分帳（item-level split）。
- **#5 離線**：擴大範圍到離線編輯 / 刪除、結算 / 統計離線重算。
- **#7 清單**：清單範本複用。
- **#15 回顧**：topCountry / 最愛目的地（需國碼→在地化國名查表）、公開圖卡下載、逐 story 翻頁動畫。
- **隨手記（FEATURES §14）**：內文 `#標籤` 自動識別＋列表 filter chips（免 schema、從 text 解析）；筆記搜尋（前端過濾即可，資料已全量在快取）；「記一筆」快速連結（首行帶入記帳表單品項欄，很多速記本來就是「XX 大概 ¥3000」）；卡片選單「複製內容」（已是 Markdown，貼哪都好看）。

> 基礎設施類待辦（Public API 限流、actions 測試覆蓋、支出伺服端分頁）見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)。

---

## 建議落地順序

```
中等（M）
  ├── 20 會籍積分與里程紀錄（規劃已完成 → PLAN-LOYALTY.md）
  ├── 14 PDF 報告
  └── 11b OAuth 登入

大（L，分階段）
  └── 21 旅程相簿與相片地圖（Phase 1–3 已完成、餘 Phase 4 → PLAN-PHOTOS.md）
        ~~Phase 1 相簿本體~~ → ~~2 行程日關聯~~ → 3 地圖整合（M）→ 4 公開分享（M）
```

**新功能慣例**：DB 存取走 Mongoose + `dbConnect()`，業務邏輯走 server actions 回傳 `ActionResult<T>`，新使用者字串**四語系都要補**，新識別碼沿用 `hashCode` 格式（見 [hashcode.ts](../src/lib/hashcode.ts)）。實作前各項仍需獨立設計（schema 遷移、i18n、測試），再逐項開票動工。
