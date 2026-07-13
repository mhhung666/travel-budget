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

### 19. 💎 旅行成就與收藏（Travel Collections / Achievements）— P3 待做〔P1+P2 已完成〕
**P1（目錄＋models＋CRUD＋`/collections` 成就頁）與 P2（行程一鍵帶入＋地圖飛行模式＋wrapped
成就區塊）已於 2026-07-13 完成**，實作筆記見 [FEATURES.md §16](./FEATURES.md)；
原始設計草圖查本檔 git 歷史。

**P3 — 徽章與分享 — M**：
- 里程碑徽章（第 10 次飛行、集滿三大聯盟、住過 5 個奢華品牌…）。
- 公開分享卡：串 `mapShareCode`，**只露徽章/數量，不露日期與航班號**（守去識別化契約）。
- 補遺：wrapped 的 `availableYears` 目前仍以旅程/支出年份為準——只有回填飛行紀錄的年份
  不會出現在年份切換（P3 一併評估要不要納入）。

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
  └── 19 旅行成就與收藏（P3 徽章與公開分享卡）
```

**新功能慣例**：DB 存取走 Mongoose + `dbConnect()`，業務邏輯走 server actions 回傳 `ActionResult<T>`，新使用者字串**四語系都要補**，新識別碼沿用 `hashCode` 格式（見 [hashcode.ts](../src/lib/hashcode.ts)）。實作前各項仍需獨立設計（schema 遷移、i18n、測試），再逐項開票動工。
