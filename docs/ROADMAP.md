# 功能藍圖（Feature Roadmap）

> 建立日期：2026-06-26（最後更新：2026-06-26）
> 對應版本：v3.4.3
> 性質：產品功能藍圖。盤點現有功能、列出可新增的功能構想，並給出優先序與落地草圖（schema / actions / UI 影響）。
> 相關文件：架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)；程式碼/基礎設施層級的改善見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)（本文件聚焦**產品功能**，與之互補）。

圖例：💎 旗艦（高價值、定義產品）　⭐ 高價值　🔹 加值/驚喜　｜　✅ 已完成
成本：S（數天）／M（一兩週）／L（需基礎設施或大改）

> **進度**：Tier 1 全數完成 — **#1 預算**、**#2 結算「標記已付」**、**#3 彈性分帳**；外加 **#13 群組統計**（全團視角）。下一步建議導入 blob 儲存解鎖 #4 收據／#11 頭像，或做 #6 行程強化。

---

## 0. 現況盤點（已完成的核心）

先標定基準線，避免重複造輪子。

| 範疇 | 已有 |
| --- | --- |
| 帳號 | 註冊 / 登入 / 登出（JWT + httpOnly cookie）、改個資、重設密碼 |
| 旅程 | CRUD、`hashCode` 公開分享 + 加入、個別軟封存、出發地/目的地、起迄日 |
| 成員 | admin/member 兩級、**虛擬成員**（未註冊也能分帳）、虛擬↔真人連結/轉換 |
| 支出 | CRUD、多幣別 + 匯率、7 種分類、付款人、**僅均分**分帳 |
| 結算 | 貪心法最小化轉帳次數、餘額表 + 轉帳清單（**只計算、不記錄已付**） |
| 行程 | 逐日（日序 + 標題 + Markdown 內容 + 地點），刪除後自動重編號 |
| 統計 | **個人**分類統計、日期區間篩選、趨勢直方圖 |
| 地圖 | 航線 / 熱點 / 國家三模式、使用者層級公開分享（`mapShareCode`） |
| 匯出 | CSV（支出 / 行程 / 結算） |
| 其他 | 四語系 i18n、深色模式、PWA manifest、公開唯讀分享頁 |

**三個最刺眼的產品缺口**（下方 Tier 1 對應）：

1. ✅ ~~App 叫「Budget Planner」卻沒有預算/編列功能~~ → 已補上預算編列與「預算 vs 實際」（見 #1）。
2. ✅ ~~結算只「算出」誰該付誰多少，沒有「標記已付清」~~ → 已補上還款登記與淨額結算閉環（見 #2）。
3. ✅ ~~分帳只能均分~~ → 已支援均分／金額／百分比／份數四種分帳（見 #3）。

---

## Tier 1 — 補完核心、立刻有感（建議先做）

### 1. ✅ 💎 預算編列與「預算 vs 實際」(Budgeting) — M〔已完成 2026-06-26〕
**為什麼**：直接兌現產品名稱。目前只能記錄已花的錢，無法回答「這趟還能花多少」。這是與「純分帳工具（如 Splitwise）」最大的差異化。

> **已實作**：`Trip.budget`＝`{ total, categories: [{ category, amount }] }`（基準幣 TWD，無 currency 欄位，null=未設）。預算進度由 [lib/budget.ts](../src/lib/budget.ts) `computeBudgetProgress` **前端即時計算**（旅程詳情頁本就載入 trip + 全部支出，省一次往返），故未做 `getBudgetProgress` action，只新增 [setTripBudget](../src/actions/budget.actions.ts)（admin）寫入。UI：旅程詳情頁的預算卡（總額 + 各分類進度條、超支標紅）＋ 編輯對話框。**進階（每日步調、每人預算）尚未做。**

**做法**
- `Trip` 加 `budget`：`{ total?: number, currency: string, categories?: { category: string, amount: number }[] }`（沿用基準幣 TWD）。
- 新 action `getBudgetProgress(tripIdOrCode)`：把既有的支出彙總（同 [stats.actions.ts](../src/actions/stats.actions.ts) 的 group 方式，但**全團**而非個人）對比預算，回傳每類 `spent / budget / remaining / pct`。
- UI：旅程頁加「預算」分頁或頂部進度條；超支標紅。可重用 Recharts。
- 進階：**每日步調**（剩餘天數 × 日均，預測是否超支）、**每人預算**。

**成本** 純加欄位 + 一個彙總 action + 一個畫面，無破壞性遷移。可作為旗艦首發。

---

### 2. ✅ 💎 結算閉環：標記「已付清」(Settle-up records) — M〔已完成 2026-06-26〕
**為什麼**：[settlement.actions.ts](../src/actions/settlement.actions.ts) 只即時計算轉帳清單，重整後狀態歸零，沒人知道「阿明到底還我錢了沒」。這是分帳 App 的核心閉環。

> **已實作**：新 model [Payment.ts](../src/models/Payment.ts)＝`{ trip, from, to, amount, note?, createdBy }`（金額基準幣 TWD）。結算抵銷抽成純函式 [lib/settlement.ts](../src/lib/settlement.ts) `applyPayments`（7 個單元測試，只淨 `balance`、保留 totalPaid/totalOwed 供顯示）；[getSettlement](../src/actions/settlement.actions.ts) 與[公開分享路由](../src/app/api/public/trips/%5Bid%5D/settlement/route.ts)皆載入還款、淨額後回傳（共用 `toPaymentRecord` mapper）。新增 [recordPayment / deletePayment](../src/actions/payment.actions.ts)（任何成員可登記/刪除，同 `deleteExpense` 信任模型）；`getPayments` 刻意併入 settlement 省一次往返。UI：結算頁建議轉帳每列「標記已付」按鈕、登記對話框（付款人→收款人下拉 + 金額 + 備註，可改金額做**部分結清**或計畫外還款）、已結清紀錄列表（公開檢視唯讀）。資料完整性：`deleteTrip` cascade、`removeMember` 孤兒參照防護皆已含 Payment。**兩個簡化**：只存 TWD（不存原幣，免歷史匯率）、以 `createdAt` 為結算時間（未做可回填 `settledAt`）。**與 #9 通知（結算提醒）的連動尚未做。**

**做法**
- 新 model `Payment`（或 `Settlement`）：`{ trip, from, to, amount, currency, settledAt, note?, createdBy }`。
- `getSettlement` 計算餘額時**扣掉**已登記的 payment（淨額結算）。
- 新 actions：`recordPayment` / `deletePayment` / `getPayments`。
- UI：轉帳清單每列加「標記已付」按鈕；歷史付款列表；可部分結清。
- 與 #14 通知連動：「XX 已把錢還你」。

**成本** 一個新 collection + 三個 action + 結算邏輯小改（餘額先減 payment）。

---

### 3. ✅ ⭐ 彈性分帳（不均分）(Flexible splits) — M〔已完成 2026-06-26〕
**為什麼**：真實旅行不會永遠均分（有人沒吃那餐、有人請客、按比例）。**schema 已支援任意 `shareAmount`**，是缺明確的 UI。這是「補完既有設計」而非新建。

> **已實作**：四種模式 **均分 / 金額 / 百分比 / 份數** 的明確選單（ToggleGroup）。計算抽成純函式 [lib/expenseSplit.ts](../src/lib/expenseSplit.ts) `computeSplits`（14 個單元測試）；輸入用原幣、即時換算成 TWD 寫入 `splits[].shareAmount`；`createExpense`/`updateExpense` 加寬鬆的「總和 ≈ 金額」防呆。實際改的是 [ExpenseFormDialog.tsx](../src/components/trips/detail/dialogs/ExpenseFormDialog.tsx)（**原草圖誤指 `ExpenseForm.tsx`，該檔為未使用的舊元件**）。「我請客」用金額模式即可達成；**「逐項分帳」仍未做。**

**做法**
- 支出表單加分帳模式切換：**均分 / 指定金額 / 百分比 / 份數（權重）/ 我請客**。
- 前端各模式換算成 `splits[].share_amount` 後送出；現有驗證（[validation.ts](../src/lib/validation.ts) 的 `share_amount: z.number().min(0)`）已接受，僅需加「總和需等於金額（含 epsilon）」的檢查。
- `createExpense` 已直接寫入 `splits`，後端幾乎免改。
- 進階：**逐項分帳**（一張餐廳收據按品項拆給不同人）。

**成本** 主要是前端 UX + 一條總和驗證。CP 值很高。

---

## Tier 2 — 讓它成為「旅行」App（旅行情境深化）

### 4. ⭐ 收據照片 / 附件 (Receipt photos) — L（需儲存基礎設施）
**為什麼**：對帳、報帳的剛需，也是信任來源（「這筆是真的」）。
**做法**：導入 blob 儲存（**Vercel Blob** 最貼合現有 Vercel 部署，或 S3 / Cloudflare R2）。`Expense` 加 `attachments: [{ url, type, uploadedBy }]`。上傳走簽名 URL，避免大檔過 server action。
**注意**：這層基礎設施一旦建好，可同時解鎖 #11 頭像、#19 地圖照片。建議與它們一起規劃。

### 5. ⭐ 離線優先 (Offline-first PWA) — L
**為什麼**：出國當下常常**沒網路 / 漫遊昂貴**，卻正是要記帳的時刻。已有 manifest，但無 service worker / 離線快取。
**做法**：加 service worker（`next-pwa` 或自寫 Workbox），支出建立採**樂觀 UI + 佇列**，連線恢復後同步。需處理離線時匯率（用最近一次快取值，回線再校正）。技術較深但對旅行 App 是殺手級體驗。

### 6. ⭐ 行程強化：時段、預訂、與支出連結 (Richer itinerary) — M
**為什麼**：目前行程只有「第幾天 + 標題 + 內容」。旅行者要的是**時間軸**與**訂房/機票**。
**做法**
- `ItineraryDay` 下加 `activities: [{ time?, title, location?, type }]`（景點/餐廳/交通…），或獨立 `Activity` model。
- **訂位/票券**：航班、住宿的確認碼、入住/退房時間、附件（連動 #4）。
- **行程↔支出連結**：`Expense.itineraryDayId?`，讓「第 3 天晚餐」可回溯，地圖/統計都能按天聚合。

### 7. 🔹 打包清單 / 待辦 (Packing & checklist) — S
**為什麼**：低成本、高頻使用的旅行小工具，黏著度高。
**做法**：`Trip.checklists: [{ title, items: [{ text, done, assignee? }] }]`，可指派給成員、可作範本複用。

---

## Tier 3 — 協作與社交（多人旅行的黏著度）

### 8. ⭐ 活動紀錄 / 動態牆 (Activity feed) — M
**為什麼**：多人共編時「誰改了什麼」目前不可見。也是稽核基礎。
**做法**：輕量 `ActivityLog`（`{ trip, actor, verb, target, meta, at }`），在各 mutation action 寫入；旅程頁時間軸呈現。

### 9. ⭐ 通知 (Notifications) — L（需基礎設施）
**為什麼**：「有人新增支出」「該還錢了」「行程更新」需要被動推送。
**做法**：先做**站內通知**（`Notification` collection + 鈴鐺），再接 **Email（Resend）** 與 **Web Push**。結算提醒可排程（每週彙整未結清）。與 #2、#8 天然連動。

### 10. 🔹 支出留言 / 旅程聊天 (Comments) — M
**為什麼**：對某筆支出有疑問時，就地討論勝過群組訊息。
**做法**：`Comment`（`{ trip, expenseId?, author, body, at }`），支出卡片展開可留言。

### 11. 🔹 頭像 + 第三方登入 (Avatar & OAuth) — M
**做法**：頭像連動 #4 的 blob 儲存；OAuth（Google）可用 Auth.js 或自建，與現有自製 JWT 並存。

### 12. 🔹 常用旅伴 (Travel companions) — S
**為什麼**：常和同一群人出遊，每次重加很煩。
**做法**：`User.companions: [userId]`，建旅程時一鍵帶入；也能快速複製上一趟的成員名單。

---

## Tier 4 — 洞察與驚喜（留存與分享傳播）

### 13. ✅ ⭐ 群組統計（非僅個人）(Group insights) — M〔已完成 2026-06-26〕
**為什麼**：[stats.actions.ts](../src/actions/stats.actions.ts) 只算「我」的分攤。團隊視角缺席：誰花最多、全團分類佔比、每日花費曲線、平均每人每日。

> **已實作**：不在跨旅程的 `getStats` 加 scope（那是個人、跨旅程視角），而是新增**單一旅程的全團**統計，比照 settlement 開獨立子頁 [/trips/[id]/stats](../src/app/%5Blocale%5D/trips/%5Bid%5D/stats/page.tsx)。計算抽成純函式 [lib/tripStats.ts](../src/lib/tripStats.ts) `computeTripStats`（9 個單元測試）：全團分類彙總（**不過濾 splits.user**、金額為整筆）、付款排行（誰出錢最多）+ 各人分攤、平均每人每日（採旅程起迄日，未設則退用支出最早～最晚日）。新增 [getTripStats](../src/actions/stats.actions.ts) action + [公開分享路由](../src/app/api/public/trips/%5Bid%5D/stats/route.ts)，共用 [dto.ts](../src/lib/dto.ts) `toTripStatsInputs` mapper。前端 [useTripStats](../src/hooks/queries/useTripQueries.ts) **重用既有 `tripKeys.stats`**（本就被支出 mutation invalidate，零額外接線）；UI 重用既有 `ExpenseHistogram` / `CategoryStats`（categoryStats 形狀與個人 StatsData 相同），另加付款排行卡。**逐項分帳、群組 PDF（#14）尚未做。**

**做法**：`getStats` 加 `scope: 'me' | 'trip'`，trip scope 不過濾 `splits.user`，並回傳付款人排行。多為查詢層改動。

### 14. 🔹 PDF 行程/結算報告 (PDF reports) — M
**為什麼**：目前只有 CSV。一份漂亮的「旅程結算單 / 行程手冊」PDF 很適合分享與報帳。
**做法**：既有 [src/lib/exporters/](../src/lib/exporters/) 已抽象化，新增 PDF exporter（`@react-pdf/renderer` 或伺服端 puppeteer）。

### 15. 🔹 年度旅行回顧 (Travel Wrapped) — M
**為什麼**：年底「我的旅行回顧」（幾國/幾城/總里程/總花費/最常吃的分類）是高傳播性的留存功能，且資料（地圖 + 支出）都已具備。
**做法**：彙整既有資料成可分享圖卡，串接既有 `mapShareCode` 公開分享機制。

### 16. 🔹 地圖強化 (Map enhancements) — S~M
**做法**：地圖疊統計（造訪 N 國 M 城）、航段**里程加總**、（連動 #4）相片釘點。多為前端聚合。

### 17. 🔹 支出搜尋 / 篩選 / 分頁 (Search, filter, paginate) — S
**為什麼**：長旅程支出一多就難找。亦呼應 [IMPROVEMENTS.md](./IMPROVEMENTS.md) 項目 G（支出無上限）。
**做法**：支出列表加關鍵字 / 分類 / 付款人 / 日期篩選；資料量大時改游標分頁 + 無限捲動。

### 18. 🔹 自訂分類 / 標籤 (Custom tags) — S
**為什麼**：固定 7 類不夠用（簽證、保險、紀念品…）。
**做法**：`Trip.customCategories` 或自由 `Expense.tags: string[]`，統計可按 tag 聚合。

---

## 橫向基礎設施（一次投資、多項解鎖）

許多功能卡在同一批外部相依——值得一起決策（呼應 [IMPROVEMENTS.md](./IMPROVEMENTS.md) 項目 A 對 Upstash 的判斷）：

| 基礎設施 | 解鎖的功能 | 候選 |
| --- | --- | --- |
| **Blob 儲存** | #4 收據、#11 頭像、#16 相片釘點 | Vercel Blob / S3 / R2 |
| **即時 / 推播** | #8 動態牆即時化、#9 通知 | SSE、Pusher / Ably、Web Push |
| **Email / 排程** | #9 結算提醒、邀請信 | Resend + Vercel Cron |
| **Redis（外部狀態）** | 公開 API 限流（IMPROVEMENTS A） | Upstash |

> 都遵守現有約定：DB 存取走 Mongoose + `dbConnect()`，業務邏輯走 server actions 回傳 `ActionResult<T>`，新使用者字串**四語系都要補**，新識別碼沿用 `hashCode` 格式（見 [hashcode.ts](../src/lib/hashcode.ts)）。

---

## 建議落地順序

```
第一波（補完核心、無新基礎設施）✅ 全數完成
  ├── 1  預算 vs 實際        ✅ 已完成
  ├── 3  彈性分帳            ✅ 已完成
  └── 2  結算「標記已付」     ✅ 已完成（閉環核心流程）

第二波（旅行情境 + 一次性基礎設施）← 下一波
  ├── 13 群組統計           ✅ 已完成（純查詢層、無新基礎設施）
  ├── 4  收據照片  ┐ 一起導入 blob 儲存
  ├── 11 頭像/OAuth┘
  └── 6  行程強化（時段/訂位/連結支出）

第三波（協作與留存）
  ├── 8  活動紀錄  ┐ 一起做通知管線
  ├── 9  通知      ┘
  ├── 5  離線優先（旅行殺手級體驗）
  └── 15 年度回顧（傳播）

隨手可做（S，穿插填空）
  └── 7 清單 ・ 12 旅伴 ・ 17 搜尋篩選 ・ 18 標籤 ・ 16 地圖統計
```

**Tier 1 已全數完成**（#1 預算、#2 結算閉環、#3 彈性分帳），第二波也已先完成 **#13 群組統計**。下一步建議一次性導入 **blob 儲存** 解鎖 **#4 收據／#11 頭像**，或做無新基礎設施的 **#6 行程強化**。#9 通知可接續 #2 做「結算提醒」。

---

> 本文件為構想清單，實作前各項仍需獨立設計（schema 遷移、i18n、測試）。歡迎在此增刪、調整優先序，再逐項開票動工。
