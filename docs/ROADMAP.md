# 功能藍圖（Feature Roadmap）

> 建立日期：2026-06-26（最後更新：2026-06-27）
> 對應版本：v3.4.3
> 性質：產品功能藍圖。盤點現有功能、列出可新增的功能構想，並給出優先序與落地草圖（schema / actions / UI 影響）。
> 相關文件：架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)；程式碼/基礎設施層級的改善見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)（本文件聚焦**產品功能**，與之互補）。

圖例：💎 旗艦（高價值、定義產品）　⭐ 高價值　🔹 加值/驚喜　｜　✅ 已完成
成本：S（數天）／M（一兩週）／L（需基礎設施或大改）

> **進度**：Tier 1 全數完成 — **#1 預算**、**#2 結算「標記已付」**、**#3 彈性分帳**；外加 **#13 群組統計**（全團視角）與 **#7 打包清單／待辦**。第二波導入 **Cloudflare R2 blob 儲存**，完成 **#4 收據附件** 與 **#11 頭像**（已併入 master）。**#6 行程強化** 已 **全 3 個 Phase 完成** — Phase 1（活動時間軸）、Phase 2（支出↔行程連結）、**Phase 3（票券附件 + 統計/地圖按天聚合）**（分支 `feat/itinerary-phase3`）。下一步建議接 **#9 通知**（結算提醒，續 #2，需新基礎設施）。

---

## 0. 現況盤點（已完成的核心）

先標定基準線，避免重複造輪子。

| 範疇 | 已有 |
| --- | --- |
| 帳號 | 註冊 / 登入 / 登出（JWT + httpOnly cookie）、改個資、重設密碼、**頭像**（R2） |
| 旅程 | CRUD、`hashCode` 公開分享 + 加入、個別軟封存、出發地/目的地、起迄日 |
| 成員 | admin/member 兩級、**虛擬成員**（未註冊也能分帳）、虛擬↔真人連結/轉換 |
| 支出 | CRUD、多幣別 + 匯率、7 種分類、付款人、四種分帳（均分/金額/百分比/份數）、**收據附件**（R2 私有 bucket） |
| 結算 | 貪心法最小化轉帳次數、餘額表 + 轉帳清單、**還款登記 + 淨額結算閉環** |
| 行程 | 逐日（日序 + 標題 + Markdown 內容 + 地點），刪除後自動重編號 |
| 清單 | 打包清單 / 待辦，可指派成員、進度條（獨立 Checklist 集合） |
| 統計 | 個人 + **全團**分類統計、付款排行、日期區間篩選、趨勢直方圖 |
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

### 4. ✅ ⭐ 收據照片 / 附件 (Receipt photos) — L（需儲存基礎設施）〔已完成 2026-06-27〕
**為什麼**：對帳、報帳的剛需，也是信任來源（「這筆是真的」）。

> **已實作**：導入 **Cloudflare R2**（S3 相容、無流量出口費）而非草圖預設的 Vercel Blob。基礎層 [lib/storage.ts](../src/lib/storage.ts)（server-only R2 client：`presignPut` / `presignGet` / `headObject` / `deleteObjects` / `deleteByPrefix`）+ [lib/uploads.ts](../src/lib/uploads.ts)（純函式：content-type 白名單、大小上限、`receipts/<tripId>/` 命名空間化 key —— owner 段由**伺服器**帶入，防跨 trip 寫入）+ [lib/imageCompress.ts](../src/lib/imageCompress.ts)（client 上傳前壓成 WebP，省流量）。收據存 **R2 私有 bucket**，內嵌 `Expense.attachments[]`＝`{ key, contentType, size, uploadedBy, uploadedAt }`（**存 key、不存 url**）；上傳走 presigned PUT 直傳 R2，存參照前以 **headObject** 重新驗證大小/型別（防 client 謊報）。檢視走 [getReceiptUrl](../src/actions/expense.actions.ts)（驗成員 + key 須屬本 trip → 短效簽名 GET）。`toExpenseDto` 加 `{ attachments }` 選項，**公開分享路由傳 `false`**（收據不外洩到未登入分享頁）。清理：`deleteExpense` / `deleteTrip` / 換附件皆 best-effort 刪 R2 物件。`R2_*` 六個 env 為 optional + `getR2Config()` 延遲檢查（未設定也能 boot / CI build）。UI：[ReceiptAttachments.tsx](../src/components/trips/detail/ReceiptAttachments.tsx)（上傳器 + 縮圖檢視）接進支出表單與支出卡。**逐項分帳、地圖相片釘點（#16）尚未做。**

**做法（原始草圖）**：導入 blob 儲存（**Vercel Blob** 最貼合現有 Vercel 部署，或 S3 / Cloudflare R2）。`Expense` 加 `attachments: [{ url, type, uploadedBy }]`。上傳走簽名 URL，避免大檔過 server action。
**注意**：這層基礎設施一旦建好，可同時解鎖 #11 頭像、#19 地圖照片。建議與它們一起規劃。

### 5. ⭐ 離線優先 (Offline-first PWA) — L
**為什麼**：出國當下常常**沒網路 / 漫遊昂貴**，卻正是要記帳的時刻。已有 manifest，但無 service worker / 離線快取。
**做法**：加 service worker（`next-pwa` 或自寫 Workbox），支出建立採**樂觀 UI + 佇列**，連線恢復後同步。需處理離線時匯率（用最近一次快取值，回線再校正）。技術較深但對旅行 App 是殺手級體驗。

### 6. ✅ ⭐ 行程強化：時段、預訂、與支出連結 (Richer itinerary) — M〔Phase 1–3 全數完成；Phase 3 於 2026-06-27〕
**為什麼**：目前行程只有「第幾天 + 標題 + 內容」。旅行者要的是**時間軸**與**訂房/機票**。

> **已實作（Phase 1 — 活動時間軸）**：`ItineraryDay` 內嵌 `activities[]`＝`{ time?, endTime?, title, type, location?, note?, confirmationCode? }`（比照 [Checklist](../src/models/Checklist.ts) `items` 內嵌、每項自動 `_id`；additive、`default []`，**無遷移**）。`type`＝景點/餐飲/交通/住宿/活動/其他（獨立列舉，非 EXPENSE_CATEGORIES）。整個陣列由 `updateItineraryDay` **覆寫**（同 `splits` 取捨，未開逐項 action）；[activitySchema](../src/lib/validation.ts) 以 `HH:mm` 正則驗證、空字串/省略統一轉 null。輕量版**訂位/票券**（確認碼 + 起迄時間）已收進來；**票券附件留 Phase 3**。純函式 [sortActivities](../src/lib/itineraryActivities.ts)（有時間者升冪、無時間殿後）+ 單元測試。UI：[ItineraryDayCard](../src/components/trips/detail/itinerary/ItineraryDayCard.tsx) 時間軸 + [ActivityListEditor](../src/components/trips/detail/itinerary/ActivityListEditor.tsx) 編輯器接進對話框。**隱私決策**：[公開分享路由](../src/app/api/public/trips/%5Bid%5D/itinerary/route.ts) 回傳活動但**抹掉 `confirmationCode`**（訂位碼敏感，比照收據不外洩到公開頁）。markdown export 帶出活動清單。四語系。
>
> **已實作（Phase 2 — 支出↔行程連結）**：`Expense.itineraryDay`（nullable ref，additive 無遷移）。[create/updateExpense](../src/actions/expense.actions.ts) 接受 `itinerary_day_id` 並驗證該行程日**屬同一 trip**（比照 payer/split 的成員歸屬檢查，防跨團指向）。共用 [toExpenseDto](../src/lib/dto.ts) mapper 帶出 `itinerary_day_id`。**孤兒防護**：`deleteItineraryDay` 把參照此日的支出 `itineraryDay` 清為 null（比照 `removeMember` 清 checklist 指派；重編號不動 `_id`，故僅刪除需清）。UI：支出表單「關聯行程日」下拉（行程日經 React Query 與行程頁共用快取載入，省一次往返）+ 支出卡 `Day N` 標籤。四語系 + dto 測試。

**做法（原始草圖）**
- `ItineraryDay` 下加 `activities: [{ time?, title, location?, type }]`（景點/餐廳/交通…），或獨立 `Activity` model。
- **訂位/票券**：航班、住宿的確認碼、入住/退房時間、附件（連動 #4）。
- **行程↔支出連結**：`Expense.itineraryDayId?`，讓「第 3 天晚餐」可回溯，地圖/統計都能按天聚合。

> **已實作（Phase 3 — 票券附件 + 按天聚合）**：
> ① **活動票券附件**：`Activity.attachments[]`（內嵌，形狀同 `Expense.attachments`＝`{ key, contentType, size, uploadedBy, uploadedAt }`，additive 無遷移）。檔案存 **R2 私有 receipts bucket** 的新命名空間 `itinerary/<tripId>/`（與收據共用 bucket、前綴不同）——擴 [uploads.ts](../src/lib/uploads.ts)（`UploadKind` 加 `'itinerary'`、`itineraryKeyPrefix` / `isItineraryKeyForTrip`，沿用收據的型別白名單與 8MB 上限）。上傳走新 [createItineraryUploadUrl](../src/actions/upload.actions.ts) 的 presigned PUT，存參照前以 **headObject** 重新驗證 size/type（防 client 謊報）。檢視走 [getItineraryAttachmentUrl](../src/actions/itinerary.actions.ts)（驗成員 + key 須屬本 trip 票券前綴 → 短效簽名 GET）。**覆寫式 diff**：activities 整批覆寫（同 splits 取捨），故附件以 R2 `key` 為穩定身分跨整天 diff——新 key 驗證、舊 key 沿用（保留 uploadedBy/At）、被移除的 key 在 `updateItineraryDay` / `deleteItineraryDay` best-effort 刪 R2；`deleteTrip` cascade 也 `deleteByPrefix('itinerary/<tripId>/')`。**漏洩防護**：公開 itinerary 路由不回傳 attachments（比照 confirmationCode）。UI：[ReceiptAttachments.tsx](../src/components/trips/detail/ReceiptAttachments.tsx) 抽出通用 `AttachmentThumb` / `AttachmentUploader`（吃 `getUrl` + `createUploadUrl` 回呼），收據 / 票券各為薄包裝；票券上傳器接進 [ActivityListEditor](../src/components/trips/detail/itinerary/ActivityListEditor.tsx) 每列、縮圖顯示於 [ItineraryDayCard](../src/components/trips/detail/itinerary/ItineraryDayCard.tsx)。
> ② **統計按天聚合**：[computeTripStats](../src/lib/tripStats.ts) 用 Phase 2 的 `Expense.itineraryDay` 連結加出 `dailySpend`（每行程日 total/count，依 dayNumber 升冪，未關聯支出歸入最後的 null 桶；完全無行程日時為空陣列，前端不渲染卡片）+ 單元測試。[getTripStats](../src/actions/stats.actions.ts) 與公開 stats 路由多載一次行程日（共用 [toTripStatsInputs](../src/lib/dto.ts) mapper），UI 新增 [DailySpendCard](../src/components/stats/DailySpendCard.tsx) 與付款排行並排。
> ③ **地圖按天聚合**：[getVisitedPlaces](../src/actions/map.actions.ts) 加 `weightBy: 'visits' | 'spend'`——'spend' 時以 `$lookup` 關聯支出、加總金額作為熱點權重。地圖熱點模式加「造訪次數 / 花費」切換（[TripMapView](../src/components/map/TripMapView.tsx)）；**花費權重恆為登入限定**（公開地圖去識別化契約不外洩金額），且城市數 / 國家點亮仍以造訪次數集為準，不受切換影響。

**Phase 3（原始草圖）**：① 活動**票券附件**——擴 [uploads.ts](../src/lib/uploads.ts) 命名空間到 `itinerary/<tripId>/`，重用 #4 的 presigned PUT + `headObject` 驗證；② 地圖熱點 / 統計**按天聚合**——用 Phase 2 的 `Expense.itineraryDay` 連結把支出與地點按行程日匯總（連動 #13、#16）。

### 7. ✅ 🔹 打包清單 / 待辦 (Packing & checklist) — S〔已完成 2026-06-26〕
**為什麼**：低成本、高頻使用的旅行小工具，黏著度高。

> **已實作**：採**獨立 [Checklist](../src/models/Checklist.ts) 集合**（非草圖的 `Trip.checklists` 內嵌）——比照 [ItineraryDay](../src/models/ItineraryDay.ts) 為旅程子集合，避免每次載入 Trip 都帶清單、也避免勾選一個項目就改寫整份 Trip；清單項目 `items[]` 仍內嵌（數量有界、整批編輯，同 `Expense.splits`）。權限採**成員信任模型**（任何成員可建立/編輯/勾選/刪除，同 expense/payment），而非行程那種 admin-only——清單本質是協作。7 個 action（[checklist.actions.ts](../src/actions/checklist.actions.ts)：清單 CRUD + 項目 add/update/remove，項目更新以 `arrayFilters` 定位、避免改寫整個陣列）+ [公開唯讀分享路由](../src/app/api/public/trips/%5Bid%5D/checklists/route.ts) + [useChecklists / useChecklistMutations](../src/hooks/queries/)（共用 `toChecklistDto` mapper）。可**指派項目給成員**（assignee）；資料完整性：`deleteTrip` cascade、`removeMember` 時清掉該成員的 item 指派（避免孤兒參照）。UI：旅程詳情頁新增「清單」入口 + 獨立子頁，清單卡含進度條、勾選、指派下拉、即時新增/刪除。**清單範本複用尚未做。**

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

### 11. 🔹 頭像 + 第三方登入 (Avatar & OAuth) — M〔頭像 ✅ 2026-06-27；OAuth 未做〕

> **已實作（頭像部分）**：`User.avatarUrl`（存 R2 **公開** avatars bucket 的穩定 URL）。新增 [setAvatar / removeAvatar](../src/actions/avatar.actions.ts)（key 須屬 `avatars/<userId>/`、headObject 驗證後寫入；換/移除時 best-effort 刪舊物件），共用 #4 的上傳基礎（presigned PUT + 壓縮）。`getCurrentUser` 與 `getMembers` 帶出 `avatar_url`。UI：設定頁 [AvatarUploader](../src/components/AvatarUploader.tsx)（壓成 512px WebP 上傳）、Navbar 與成員清單顯示頭像（無則退回首字母）。頭像走**公開 bucket**（穩定 URL、免每次簽名），與收據的私有 bucket 分流。**OAuth（Google）仍未做。**

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
| **Blob 儲存** ✅ | #4 收據、#11 頭像（已解鎖）、#16 相片釘點 | **Cloudflare R2**（已採用，私有收據 + 公開頭像兩 bucket） |
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

第二波（旅行情境 + 一次性基礎設施）
  ├── 13 群組統計           ✅ 已完成（純查詢層、無新基礎設施）
  ├── 4  收據照片  ┐ ✅ 已導入 Cloudflare R2 blob 儲存（已併入 master）
  ├── 11 頭像      ┘ ✅ 已完成（OAuth 未做）
  └── 6  行程強化   ✅ Phase 1 活動時間軸 ・ Phase 2 支出↔行程連結 ・ Phase 3 票券附件 + 統計/地圖按天聚合（全數完成）

第三波（協作與留存）
  ├── 8  活動紀錄  ┐ 一起做通知管線
  ├── 9  通知      ┘
  ├── 5  離線優先（旅行殺手級體驗）
  └── 15 年度回顧（傳播）

隨手可做（S，穿插填空）
  ├── 7  清單              ✅ 已完成（獨立 Checklist 集合、成員協作、可指派）
  └── 12 旅伴 ・ 17 搜尋篩選 ・ 18 標籤 ・ 16 地圖統計
```

**Tier 1 已全數完成**（#1 預算、#2 結算閉環、#3 彈性分帳）；第二波已完成 **#13 群組統計**、導入 **Cloudflare R2 blob 儲存**解鎖 **#4 收據** 與 **#11 頭像**（已併入 master），並 **完成 #6 行程強化全 3 Phase** — Phase 1（活動時間軸）、Phase 2（支出↔行程連結）、Phase 3（票券附件 + 統計/地圖按天聚合，後者放大了 #13 統計與 #16 地圖）（分支 `feat/itinerary-phase3`）。下一步建議接 **#9 通知**（站內通知 → Email → Web Push；結算提醒續 #2，與 #8 動態牆共用通知管線，屬第三波）。

---

> 本文件為構想清單，實作前各項仍需獨立設計（schema 遷移、i18n、測試）。歡迎在此增刪、調整優先序，再逐項開票動工。
