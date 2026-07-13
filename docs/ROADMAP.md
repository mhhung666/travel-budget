# 功能藍圖（Feature Roadmap）

> 建立日期：2026-06-26（最後更新：2026-07-03）
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

### 14. 🔹 PDF 行程 / 結算報告 (PDF reports) — M
**為什麼**：目前只有 CSV。一份漂亮的「旅程結算單 / 行程手冊」PDF 很適合分享與報帳。
**做法**：既有 [src/lib/exporters/](../src/lib/exporters/) 已抽象化，新增 PDF exporter（`@react-pdf/renderer` 或伺服端 puppeteer）。

### 16. 💎 旅行成就與收藏（Travel Collections / Achievements）— L
**為什麼**：把記帳工具延伸成「旅行人生紀錄」——搭過哪些航空（幾次、哪個航班）、住過哪些品牌飯店、
去過哪些國家。類似文華東方「收集扇子」的品牌收藏體驗，情感價值與黏著度高。
**核心決策（要不要固定資料庫？）**：
- **航空公司＝固定目錄**。全球有 IATA 代碼的客運航空是有限集合（數百家），自 OpenFlights / Wikipedia
  產生 `airlines.json`（`{ iata, name(多語), country, alliance }`），比照 `countries.geojson`
  「生成資產勿手改＋產生腳本」慣例。航班號前綴（BR/JL/CI…）可自動比對航空公司。
- **機場＝固定目錄**（ourairports 公開資料，濾到有 IATA 碼者），供航段選擇；含座標，日後可直接
  餵地圖既有的 great-circle 航線弧。
- **飯店＝混合制**：單一飯店是開放集合（百萬級、無乾淨開放資料），**不做**目錄；
  **品牌／集團**做人工精選目錄（~150–250 筆，`{ id, group, tier(奢華/高端/中端/平價/青旅), names }`）
  ＋自由文字飯店名＋可選星級。品牌可為 null（獨立旅宿），目錄缺漏不擋輸入。
**Schema（新增 2 個 user-level collection——個人終身紀錄，非 trip-scoped）**：
- `FlightRecord`：`user(ref,index), trip(ref,可null), date + datePrecision('day'|'month'|'year'),
  airline(IATA,必填), flightNo?, from/to(機場碼)?, cabin?, note`
- `StayRecord`：`user(ref,index), trip(ref,可null), checkIn + 精度, nights?, brand?(目錄id),
  hotelName(必填), stars?, location?, note`
- **刻意偏離 cascade 慣例**：`deleteTrip` 對這兩個 collection 是「解除連結（trip 置 null）」而非刪除
  （終身紀錄不因刪旅程消失）。隱私比照收據：絕不進公開分享路由。
**資料蒐集雙路徑**：① 成就頁手動補登，`datePrecision` 支援「只記得年份」的低摩擦歷史回填；
② 行程整合——transport / accommodation 活動加可選結構化欄位，偵測後一鍵帶入紀錄（Phase 2）。
**UI**：新 user-level 頁 `/collections`（定位比照 /stats /map /wrapped）。Tabs＝航空／住宿／國家。
品牌牆＝monogram 徽章卡（品牌縮寫圓章＋tier 色環，**不用商標圖**避免侵權），已收集點亮、
未收集預設隱藏可切換；航空依聯盟分組＋搭乘次數；國家 tab 重用地圖 visited 資料。
統計卡與圖表沿用 stats 頁樣式；彙總純函式放 `lib/collections.ts`（比照 tripStats，附單元測試）。
**Phases**：P1＝目錄＋models＋CRUD actions＋成就頁；P2＝行程整合＋個人地圖航線弧＋wrapped 新圖卡
（今年新解鎖 X 家航空）；P3＝里程碑徽章＋公開分享卡（只露徽章/數量，不露日期航班，守 mapShareCode
去識別化契約）。

### 進階深化（已完成功能的延伸）
- **#1 預算**：每日步調、每人預算。
- **#3 分帳**：逐項分帳（item-level split）。
- **#5 離線**：擴大範圍到離線編輯 / 刪除、結算 / 統計離線重算。
- **#7 清單**：清單範本複用。
- **#15 回顧**：topCountry / 最愛目的地（需國碼→在地化國名查表）、公開圖卡下載、逐 story 翻頁動畫。

> 基礎設施類待辦（Public API 限流、actions 測試覆蓋、支出伺服端分頁）見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)。

---

## 建議落地順序

```
中等（M）
  ├── 14 PDF 報告
  └── 11b OAuth 登入
大（L）
  └── 16 旅行成就與收藏（P1 → P2 → P3 分期）
```

**新功能慣例**：DB 存取走 Mongoose + `dbConnect()`，業務邏輯走 server actions 回傳 `ActionResult<T>`，新使用者字串**四語系都要補**，新識別碼沿用 `hashCode` 格式（見 [hashcode.ts](../src/lib/hashcode.ts)）。實作前各項仍需獨立設計（schema 遷移、i18n、測試），再逐項開票動工。
