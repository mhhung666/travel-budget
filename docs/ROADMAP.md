# 功能藍圖（Feature Roadmap）

> 建立日期：2026-06-26（最後更新：2026-07-18）
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

### 進階深化（已完成功能的延伸）
- **#1 預算**：每日步調、每人預算。
- **#3 分帳**：逐項分帳（item-level split）。
- **#5 離線**：擴大範圍到離線編輯 / 刪除、結算 / 統計離線重算。
- **#7 清單**：清單範本複用。
- **#15 回顧**：topCountry / 最愛目的地（需國碼→在地化國名查表）、公開圖卡下載、逐 story 翻頁動畫。
- **#20 會籍（已完成並結案 2026-07-16，見 [FEATURES.md](./FEATURES.md) §16）**：飯店會籍（Marriott／Hilton…夜數制——`ProgramRules` 加 `kind: 'nights'`、entry 加 `qualifyingNights`＋`stayRecord` ref，架構不變純加法）；里數效期提醒（各家效期規則需查證）；awardMiles 兌換紀錄分類統計；CI 門檻目前僅二手來源交叉確認（官網被 Akamai 擋），日後可補官方一手核對。
- **#20b 夥伴航班累積（partner accrual，2026-07-18 研究完成）**：搭 oneworld 夥伴（QR／JL…）掛 CX 會員號可累積 SP＋AM，歸屬看**票面行銷班號**（登機證 CX 開頭＝國泰營銷走 CX 表，夥伴班號走各夥伴表）；夥伴賺取率遠低於自家且 2023 改制後**無公開賺取表**（只有官方計算機，依航空×訂位艙等字母×距離）。落地：schema 免改（entry 已有 `program`＋`own_airline`＋`flight_record_id`）；缺口在 [FlightRecordDialog](../src/components/collections/FlightRecordDialog.tsx) `matchedAccount` 要求航空代碼＝program 才給累積 checkbox——改成「依聯盟對應列出可累積的帳戶讓使用者單選」（一段航班只能掛一個計畫；constants 給 program 加 `alliance` 欄＋航空代碼→聯盟名單：CX=oneworld、CI=SkyTeam、BR=Star Alliance），`own_airline` 依 `OWN_AIRLINE_CODES` 預勾。CX 積分試算**只限 CX 營銷航班**（夥伴表不同且 AM≠SP×100，夥伴情境改手動輸入＋官方計算機連結提示）。i18n 四語系。
- **#20c 更多計畫（BA／QR…，2026-07-18 初步查證）**：使用者未來可能同持 CX＋BA＋QR 等多會籍（同為 oneworld——同一 JL 航班三個帳戶都可掛，#20b 的單選 UI 必須以此為前提）。加計畫＝加 constants 規則＋i18n tier keys＋badge 色（無色有 fallback），schema 不動；但兩家規則形狀會撐大 `ProgramRules` union，動工前注意：**BA Club**（2025-04 改制）Tier Points 改**消費金額制**（£1=1 TP，BA/AA/IB 營銷票＋附加費），Bronze/Silver 另有純航段替代路徑（25／50 段 BA 營銷）、GGL 有 BA 營銷最低占比——TP 無法從航班距離/艙等推估，只能純手記（正符合本專案定位）；**QR Privilege Club** Qpoints 積分制、升等 rolling12m（銀 150／金 300／白金 600），續會「近 12 個月或近 24 個月雙門檻」（如銀 135｜270），自家條款為「20% Qpoints 來自 QR 營運 **或** 12 個月 4 段」——renewalWindow 與 own-airline 條款皆需新形狀。
- **#21 相簿（已完成並結案 2026-07-16，見 [FEATURES.md](./FEATURES.md) §17）**：相簿封面、打包下載（zip）、Year in Review 整合；相片反查地名 `place` 離線批次回填（目前一律 `null`，釘點標籤借關聯行程日地名——見 FEATURES §17「未做（刻意）」）。
- **隨手記（FEATURES §14）**：內文 `#標籤` 自動識別＋列表 filter chips（免 schema、從 text 解析）；筆記搜尋（前端過濾即可，資料已全量在快取）；「記一筆」快速連結（首行帶入記帳表單品項欄，很多速記本來就是「XX 大概 ¥3000」）；卡片選單「複製內容」（已是 Markdown，貼哪都好看）。

> 基礎設施類待辦（Public API 限流、actions 測試覆蓋、支出伺服端分頁）見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)。

---

## 建議落地順序

```
中等（M）
  ├── 14 PDF 報告
  └── 11b OAuth 登入
```

**新功能慣例**：DB 存取走 Mongoose + `dbConnect()`，業務邏輯走 server actions 回傳 `ActionResult<T>`，新使用者字串**四語系都要補**，新識別碼沿用 `hashCode` 格式（見 [hashcode.ts](../src/lib/hashcode.ts)）。實作前各項仍需獨立設計（schema 遷移、i18n、測試），再逐項開票動工。
