# 功能總覽（Features）

> 更新日期：2026-07-01
> 本文件盤點**已實作**的所有產品功能，並附上各功能的關鍵實作筆記（schema / actions / UI / 取捨）。
> 規劃中、尚未動工的構想見 [ROADMAP.md](./ROADMAP.md)；系統架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)。

旅行記帳是一個多人旅程的記帳與分帳 App。以下依使用情境分組，列出每項功能與其落地細節。

---

## 1. 帳號與成員

| 功能 | 說明 |
| --- | --- |
| 註冊 / 登入 / 登出 | 自製 JWT（`jose`）+ httpOnly cookie，密碼以 `bcryptjs` 雜湊 |
| 修改個資 / 重設密碼 | 設定頁；重設碼存於 [PasswordResetCode](../src/models/PasswordResetCode.ts) |
| 變更 Email（寄碼驗證） | 設定頁兩步驟：`requestEmailChange` 寄 6 位數碼到**新信箱** → `confirmEmailChange` 驗碼通過才套用；待驗證碼存於 [EmailChangeCode](../src/models/EmailChangeCode.ts)（含 `newEmail`），與重設密碼共用驗證碼機制 |
| 頭像 | `User.avatarUrl`，存 R2 **公開** avatars bucket 的穩定 URL（見 §7） |
| 虛擬成員 | `User.isVirtual`：未註冊者也能參與分帳；可與真人帳號連結 / 轉換 |
| 通知偏好 | `User.notifyByEmail`（Email opt-out）、`User.locale`（寄信語系） |

**頭像實作**：[setAvatar / removeAvatar](../src/actions/avatar.actions.ts)（key 須屬 `avatars/<userId>/`、`headObject` 驗證後寫入；換 / 移除時 best-effort 刪舊物件），共用 §7 的上傳基礎（presigned PUT + 前端壓縮）。`getCurrentUser` 與 `getMembers` 帶出 `avatar_url`。UI：設定頁 [AvatarUploader](../src/components/AvatarUploader.tsx)（壓成 512px WebP），Navbar 與成員清單顯示頭像（無則退回首字母）。

**虛擬成員連結 / 轉換**：透過公開分享頁的 [link-member](../src/app/api/public/trips/%5Bid%5D/link-member/route.ts) / [convert-member](../src/app/api/public/trips/%5Bid%5D/convert-member/route.ts) 流程把虛擬成員接上真人帳號。

---

## 2. 旅程

| 功能 | 說明 |
| --- | --- |
| 旅程 CRUD | admin/member 兩級權限（內嵌 `Trip.members[]`） |
| 公開分享 | `Trip.hashCode`（opt-in 唯讀分享連結 + 加入） |
| 出發地 / 目的地 / 起迄日 | 地點欄位、行程日期區間 |
| 個別軟封存 | 每位成員可單獨封存某趟旅程（`member.archivedAt`） |
| 預算編列 | `Trip.budget` + 「預算 vs 實際」 |
| 行程空間分頁 | 行程（落點）／支出／相簿／結算 + 子分頁（見下） |

**行程空間分頁（2026-07-15 重排）**：主分頁收斂為 **行程／支出／相簿／結算** 四顆，隨手記與清單收進「行程」、統計收進「結算」的子分頁列；空間落點（`/trips/[id]`）＝行程分頁，支出移到 `/trips/[id]/expenses`（舊 `/itinerary` 308 轉址回落點，其餘子頁 URL 不變）。旅行資訊卡隨落點住在行程分頁；2026-07-27 起新增支出主動作改為 App Shell 全域「記一筆」，單一進行中旅行直開、多旅行先選擇，PWA `/quick-add` 共用流程。結構、路由表與深連結規則見 [ARCHITECTURE.md §4.14](./ARCHITECTURE.md)。

**預算（💎 旗艦功能，兌現「Budget Planner」名稱）**：`Trip.budget` = `{ total, categories: [{ category, amount }] }`（基準幣 TWD，無 currency 欄位，null = 未設）。預算進度由純函式 [lib/budget.ts](../src/lib/budget.ts) `computeBudgetProgress` **前端即時計算**（旅程詳情頁本就載入 trip + 全部支出，省一次往返），故未做 `getBudgetProgress` action，只有 [setTripBudget](../src/actions/budget.actions.ts)（admin）寫入。UI：旅程詳情頁的預算卡（總額 + 各分類進度條、超支標紅）+ 編輯對話框。*進階（每日步調、每人預算）尚未做。*

---

## 3. 支出與分帳

| 功能 | 說明 |
| --- | --- |
| 支出 CRUD | 付款人、日期、7 種分類、備註 |
| 多幣別 + 匯率 | 存原幣 + 匯率，換算 TWD 寫入 `amount`；旅程可設常用幣別 / 自訂匯率 / 預設幣別 |
| 四種分帳 | 均分 / 金額 / 百分比 / 份數 |
| 收據附件 | R2 私有 bucket（見 §7） |
| 支出 ↔ 行程日連結 | `Expense.itineraryDay`（見 §5） |
| 搜尋 / 篩選 | 關鍵字 / 分類 / 付款人 / 分帳對象 / 標籤 / 日期區間 |
| 留言 | 支出下的討論串，作者本人或旅程 admin 可刪除 |
| 自訂標籤 | 自由文字、可複選，與固定 7 類 `category` 正交，統計可依標籤加總 |

**彈性分帳**：四種模式的明確選單（ToggleGroup）。計算抽成純函式 [lib/expenseSplit.ts](../src/lib/expenseSplit.ts) `computeSplits`（14 個單元測試）；輸入用原幣、即時換算成 TWD 寫入 `splits[].shareAmount`；`createExpense` / `updateExpense` 加寬鬆的「總和 ≈ 金額」防呆。實作於 [ExpenseFormDialog.tsx](../src/components/trips/detail/dialogs/ExpenseFormDialog.tsx)。「我請客」用金額模式即可達成；*「逐項分帳」尚未做。*

**搜尋 / 篩選**：純前端篩選——純函式 [lib/expenseFilters.ts](../src/lib/expenseFilters.ts) `filterExpenses` / `countActiveFilters`（關鍵字 + 分類 + 付款人 + 分帳對象 + 標籤 + 日期區間，AND 結合；21 個單元測試）。[TripExpenses.tsx](../src/components/trips/detail/TripExpenses.tsx) 加搜尋框 + 可收合的進階篩選面板（含啟用條件數 badge 與「清除」、結果筆數提示）。長列表採**純前端漸進渲染**（預設 20 筆 +「顯示更多」）——**伺服端游標分頁刻意延後**（見 [IMPROVEMENTS.md](./IMPROVEMENTS.md) G）。

**自訂標籤**：`Expense.tags: string[]`，與固定 7 類的 `category` 正交——`category` 維持封閉集合供預算比對，`tags` 為開放、可複選的自由文字（Zod 限制單一標籤 ≤30 字、至多 20 個）。輸入用新元件 [tag-input.tsx](../src/components/ui/tag-input.tsx)（chip 輸入 + 同 trip 內既有標籤自動完成），置於 [ExpenseFormDialog.tsx](../src/components/trips/detail/dialogs/ExpenseFormDialog.tsx) 的進階選項區。統計依標籤加總比照分類統計（見 §9 `TagStat`），公開分享頁與 `category` 同等級公開（無 gating）。

**旅程幣別設定**：`Trip.currencySettings` = `{ defaultCurrency, currencies: [{ code, rate }] }`（null = 未設定，行為同舊版：預設 TWD、即時匯率；仿 `budget` 先例的內嵌可空欄位，免 migration）。`rate` 為自訂匯率（1 外幣 = ? TWD；null = 用即時匯率），可鎖定如換現金的實際匯率。**幣別不限精選 6 種**——支援完整 ISO 4217（`Intl.supportedValuesOf('currency')`，~160 種；名稱以 `Intl.DisplayNames` 本地化），設定頁以可搜尋下拉 [CurrencyCombobox](../src/components/trips/detail/CurrencyCombobox.tsx) 加入；驗證改用開放式 `currencyCodeSchema`（[validation.ts](../src/lib/validation.ts)，比對支援集合）取代原本的 6 種 enum；[匯率 proxy](../src/app/api/exchange-rates/route.ts) 也改為回傳全部幣別的即時匯率。寫入走 [setTripCurrencySettings](../src/actions/currency.actions.ts)（admin only），UI 為設定頁的 [TripCurrencySettings](../src/components/trips/detail/TripCurrencySettings.tsx) 卡片（加入幣別 → 逐筆填自訂匯率 → 選預設幣別）。三個消費端共用純函式 [lib/tripCurrency.ts](../src/lib/tripCurrency.ts)（16 個單元測試；`resolveTripRates` 自訂匯率蓋過即時匯率）：支出表單幣別 **僅限**選定的常用幣別（`getTripExpenseCurrencies`；未設定則退回 TWD，編輯時保留原幣）、預設幣別 + 匯率預填順序＝自訂 → 即時；結算與 trip 統計的顯示幣別＝ TWD + 選定幣別（`getTripDisplayCurrencies`）。**不追溯**：改設定只影響之後新增的支出，既有支出保留寫入當下的 `exchange_rate`。

**留言**：獨立 collection [Comment](../src/models/Comment.ts) = `{ trip, expense, author, authorName, body }`（比照 `ActivityLog` 去正規化 `authorName`、trip-scoped 獨立集合，非內嵌於 `Expense`）。Actions [comment.actions.ts](../src/actions/comment.actions.ts)：`getComments`（單筆支出的留言串，舊到新）、`getCommentCounts`（全 trip 一次 aggregate 算各支出留言數，供列表 badge 免逐筆查詢的 N+1）、`createComment`（best-effort 通知其他成員，見 §8 `expense_comment_added`）、`deleteComment`（**僅留言作者本人或旅程 admin** 可刪——比其餘 data-level 刪除〔`deleteExpense` / `deletePayment` / `removeChecklistItem`〕更嚴格的信任模型，因留言的個人語意更接近聊天訊息）。UI：[TripExpenses.tsx](../src/components/trips/detail/TripExpenses.tsx) 支出卡片下的「留言 (N)」toggle + [ExpenseComments](../src/components/expenses/ExpenseComments.tsx)（懶載入，展開該筆支出才查詢留言串）。資料完整性：`deleteExpense` / `deleteTrip` cascade 清除留言。

---

## 4. 結算

| 功能 | 說明 |
| --- | --- |
| 最小化轉帳 | 貪心法配對債權 / 債務人 |
| 餘額表 + 轉帳清單 | 誰該付誰多少 |
| 標記已付清 | 還款登記 + 淨額結算閉環 |

**演算法**：[lib/settlement.ts](../src/lib/settlement.ts) 貪心法配對，`0.01` epsilon 處理浮點誤差（[settlement.test.ts](../src/__tests__/settlement.test.ts) 覆蓋）。

**結算閉環（💎）**：model [Payment](../src/models/Payment.ts) = `{ trip, from, to, amount, note?, createdBy }`（金額基準幣 TWD）。純函式 `applyPayments`（[settlement.ts](../src/lib/settlement.ts)，7 個單元測試）把還款淨額抵銷進「以支出算出的餘額」（只調整 `balance`，保留 totalPaid/totalOwed 供顯示）。[getSettlement](../src/actions/settlement.actions.ts) 與[公開分享路由](../src/app/api/public/trips/%5Bid%5D/settlement/route.ts)皆載入還款後回傳（共用 `toPaymentRecord` mapper）。登記 / 刪除走 [recordPayment / deletePayment](../src/actions/payment.actions.ts)（任何成員可登記 / 刪除，同 `deleteExpense` 信任模型；`getPayments` 併入 settlement 省一次往返）。UI：結算頁每列「標記已付」按鈕、登記對話框（可改金額做**部分結清**或計畫外還款）、已結清紀錄列表（公開檢視唯讀）。**簡化**：只存 TWD（不存原幣，免歷史匯率）、以 `createdAt` 為結算時間。

---

## 5. 行程規劃

| 功能 | 說明 |
| --- | --- |
| 逐日行程 | 日序 + 標題 + Markdown 內容 + 地點，刪除後自動重編號 |
| 活動時間軸 | 每日內嵌 `activities[]`（時段、類型、地點、確認碼） |
| 票券附件 | 活動可掛附件（R2 私有 bucket，`itinerary/<tripId>/` 前綴） |
| 支出 ↔ 行程日連結 | 支出可關聯到某行程日，統計 / 地圖按天聚合 |

**活動時間軸**：`ItineraryDay` 內嵌 `activities[]` = `{ time?, endTime?, title, type, location?, note?, confirmationCode?, attachments[] }`（每項自動 `_id`；additive、無遷移）。`type` = 景點 / 餐飲 / 交通 / 住宿 / 活動 / 其他。整陣列由 `updateItineraryDay` **覆寫**（同 `splits` 取捨）；[activitySchema](../src/lib/validation.ts) 以 `HH:mm` 正則驗證。純函式 [sortActivities](../src/lib/itineraryActivities.ts)（有時間者升冪、無時間殿後）+ 單元測試。UI：[ItineraryDayCard](../src/components/trips/detail/itinerary/ItineraryDayCard.tsx) 時間軸 + [ActivityListEditor](../src/components/trips/detail/itinerary/ActivityListEditor.tsx) 編輯器。**隱私**：[公開分享路由](../src/app/api/public/trips/%5Bid%5D/itinerary/route.ts)回傳活動但**抹掉 `confirmationCode` 與 attachments**（訂位碼 / 票券敏感，比照收據不外洩到公開頁）。

**支出 ↔ 行程日連結**：`Expense.itineraryDay`（nullable ref，additive 無遷移）。[create/updateExpense](../src/actions/expense.actions.ts) 驗證該行程日**屬同一 trip**（防跨團指向）。**孤兒防護**：`deleteItineraryDay` 把參照此日的支出 `itineraryDay` 清為 null。UI：支出表單「關聯行程日」下拉 + 支出卡 `Day N` 標籤。

**票券附件 + 按天聚合**：見 §7（附件）、§9（統計 dailySpend）、§10（地圖 spend 權重）。

---

## 6. 清單

| 功能 | 說明 |
| --- | --- |
| 三種清單類型 | `kind`＝待辦 / 行李 / 購物，勾選語意隨類型 |
| 範本 / 跨旅程複製 | 冷啟動給行前待辦 / 行李 / 購物 / 藥品證件範本，或從其他旅程搬 |
| per-member 勾選 | 行李清單每人各自勾（`doneBy[]`），顯示「我的進度」 |
| 指派成員 | 僅待辦類型可指派 assignee |
| 勾完購物 → 記一筆 | 購物項勾選後浮出「記一筆」，帶品名開支出表單 |

採**獨立 Checklist 集合**（非內嵌在 Trip）：比照 ItineraryDay 為旅程子集合，避免每次載入 Trip 都帶清單、也避免勾一個項目就改寫整份 Trip；項目 `items[]` 仍內嵌（數量有界、整批編輯）。權限採**成員信任模型**（任何成員可建立 / 編輯 / 勾選 / 刪除）。9 個 action（[checklist.actions.ts](../src/actions/checklist.actions.ts)，項目更新以 `arrayFilters` 定位）+ [公開唯讀分享路由](../src/app/api/public/trips/%5Bid%5D/checklists/route.ts)。資料完整性：`deleteTrip` cascade、`removeMember` 清掉該成員的 item 指派**與 `doneBy`**。

**清單類型（`kind`）決定行為**（2026-07 重新設計，把「通用多清單工具」變成「旅行情境清單」）：
- **`todo` 行前待辦**：共享勾選（任一人勾即完成）、**可指派** assignee（分工用，僅此類型顯示指派 UI）。
- **`packing` 行李打包**：**per-member 勾選**——item 的完成狀態是 `doneBy: ObjectId[]`（誰帶了誰打勾，`$addToSet` / `$pull` 自己），卡片顯示「我的進度」與「N 人已備」；不顯示指派。
- **`shopping` 購物**：共享勾選；勾掉（買到了）後列上浮出「**記一筆**」捷徑，帶品名直接開支出表單——把清單接上記帳核心。走既有 [TripSpaceShell](../src/components/trips/space/TripSpaceShell.tsx) 的 shell 層 add-expense 表單（清單分頁就在此 provider 內，免跨頁導航）：`TripSpaceActions.openAddExpense({ description })` → `ExpenseFormSheet` / `useExpenseForm` 的 `initialDescription`（僅 add mode）。

**資料模型細節**：item 的完成狀態統一存 `doneBy: ObjectId[]`（取代舊的單一 `done` boolean）——共享清單即「非空＝完成、存標記者 id」，DTO 對外仍導出 `done`（= `doneBy` 非空）維持相容，另帶 `done_by` 供 per-member 渲染。schema 遷移見 [migration 20260703133143](../migrations/20260703133143-checklist-kind-and-per-member-done.js)（回填 `kind='todo'`、`done→doneBy`，idempotent + down）。

**建立流程**：範本 = 前端常數 [checklistTemplates.ts](../src/constants/checklistTemplates.ts)（id + emoji + kind，文字走 i18n 四語系），選取由 `createChecklistWithItems` 一次寫入；`getCopyableChecklists` 列出使用者其他旅程的非空清單供「從其他旅程複製」（只搬項目文字、以 `todo` 建立）。UI：[NewChecklistSheet](../src/components/trips/detail/checklist/NewChecklistSheet.tsx) 範本選擇器解冷啟動、[ChecklistItemRow](../src/components/trips/detail/checklist/ChecklistItemRow.tsx) 指派收進列尾 ⋯ 選單（未指派無雜訊）、[ChecklistCard](../src/components/trips/detail/checklist/ChecklistCard.tsx) 完成項自動沉底（純前端穩定排序）。

---

## 7. 附件與檔案（Cloudflare R2）

收據（§3）、頭像（§1）、票券（§5）的檔案都存於 **Cloudflare R2**（S3 相容、無流量出口費）。

- **基礎層** [lib/storage.ts](../src/lib/storage.ts)：**server-only** R2 client（`presignPut` / `presignGet` / `headObject` / `deleteObjects` / `deleteByPrefix` / `avatarPublicUrl`）。純邏輯（content-type 白名單、大小上限、key 命名空間）抽在 [lib/uploads.ts](../src/lib/uploads.ts)（可單元測試、client-safe）；前端壓縮在 [lib/imageCompress.ts](../src/lib/imageCompress.ts)。
- **兩個 bucket**：私有 `receipts`（presigned PUT 上傳；成員驗證後的短效 presigned GET 檢視）+ 公開 `avatars`（presigned PUT 上傳；穩定公開 URL，免每次簽名）。收據與票券共用 receipts bucket、以前綴區隔（`receipts/<tripId>/` vs `itinerary/<tripId>/`）。
- **上傳流程**：瀏覽器壓成 WebP → 向 server action 要 presigned PUT → **直傳 R2**（大檔不過 server action）→ 回存參照。**owner 段由伺服器帶入**、client 無法指定（防跨 trip/user 寫入）；存參照前以 **`headObject`** 重新驗證大小 / 型別（presigned PUT 無法限制 client 真正送出的內容）。
- **隱私**：收據 / 票券為私有，公開分享路由不回傳 attachments；頭像為低敏感、走公開 bucket。
- **環境變數**：六個 `R2_*` 在 [lib/env.ts](../src/lib/env.ts) 設為 **optional**，`getR2Config()` 用到時才嚴格檢查 → 未設定 R2 也能 boot / CI build。
- **清理（無 cascade）**：`deleteExpense` / `deleteTrip` / 換附件 / `setAvatar` / `removeAvatar` 皆 **best-effort** 刪 R2 物件（刪不掉的孤兒只記 log、不擋使用者操作）。

收據附件內嵌 `Expense.attachments[]` = `{ key, contentType, size, uploadedBy, uploadedAt }`（**存 key、不存 url**）；活動票券 `Activity.attachments[]` 同形狀。通用 UI 元件 [ReceiptAttachments.tsx](../src/components/trips/detail/ReceiptAttachments.tsx) 抽出 `AttachmentThumb` / `AttachmentUploader`，收據 / 票券各為薄包裝。

---

## 8. 通知

四種通知通道，共用同一套 fan-out 與 i18n（[lib/notify.ts](../src/lib/notify.ts)）：

| 通道 | 觸發 | 說明 |
| --- | --- | --- |
| 站內通知（鈴鐺） | 新增支出 / 登記還款 / 成員加入 / 支出留言 / 好友邀請 / 好友接受 | per-user 收件匣 + 未讀數 |
| Email（Resend） | 同上 | 新增支出改**每日彙整**；還款 / 加入 / 留言即時 |
| 排程提醒（Vercel Cron） | 每週結算提醒 + 每日支出摘要 | best-effort、env-gated |
| Web Push | 同站內四觸發點 | 瀏覽器推播、共用離線 SW |

**站內通知**：collection [Notification](../src/models/Notification.ts) = `{ user(收件者), trip(**optional**), tripName, type, actor, actorName, meta, read }`——**per-user 收件匣**（去正規化顯示欄位、讀取免 populate）。fan-out 工具 [lib/notify.ts](../src/lib/notify.ts) `notify()` = **best-effort**（失敗只記 log、絕不 throw 進主 action）；純函式 `selectNotificationRecipients`（排除觸發者本人 / 虛擬成員 / 去重，8 個單元測試）。觸發點：`createExpense` / `recordPayment` / `joinTrip` / `createComment` + 好友邀請 / 接受（`sendFriendRequest` / `acceptFriendRequest`）+ 匯入旅程（`addFriendsToTrip`）。**好友通知不屬於任何旅程**，走 `notify()` 的**無 `tripId` 路徑**（跳過 Trip 查詢、`tripName` 留空、必帶 `recipientIds`），鈴鐺 / Email / Push 一律深連結到設定頁好友卡片（詳見 §15）。Actions [notification.actions.ts](../src/actions/notification.actions.ts) 皆限定 `user: session.userId`。**文案在前端依收件者語系即時組出**（i18n `notifications` 命名空間 + meta）。UI：navbar 鈴鐺 [NotificationBell](../src/components/notifications/NotificationBell.tsx)（未讀 badge 輪詢 60s + 視窗 focus 重抓、Popover 清單、點擊標記已讀並導向）。資料完整性：`deleteTrip` cascade、`removeMember` 清該成員通知。

**Email（Resend）**：env-gated（`RESEND_API_KEY` / `RESEND_FROM` / `APP_URL` optional，`getResendConfig()` 回 null 則整支靜默跳過）。[lib/email.ts](../src/lib/email.ts) `sendEmail()` = best-effort 永不 throw。模板 [lib/emailTemplates.ts](../src/lib/emailTemplates.ts) 在伺服端用收件者語系以 next-intl `createTranslator` 算文案（`email` i18n 命名空間，四語系）。為此 `User` 加 `notifyByEmail`（opt-out，預設開）+ `locale`（寄信語系）。連結用 `APP_URL` 組絕對 URL，HTML 模板對使用者字串做 escape。

**提醒還款（手動）**：結算頁 [SettlementPlan](../src/components/settlement/SettlementPlan.tsx) 上，當事人（某筆建議轉帳的收款人 / 被欠款者）可按「提醒還款」，由 [remindPayment](../src/actions/payment.actions.ts) action 對欠款的成員即時寄出提醒 Email（模板 `buildPaymentReminderEmail`）。action **伺服端重算結算**確認「債務人 → 觸發者」確有一筆建議轉帳才寄（不信任前端帶的對象 / 金額），債務人為虛擬成員 / 無信箱 / 關閉 Email 通知則回對應錯誤。**取代了原本的每週結算提醒 cron**——改由使用者主動催款。

**排程（Vercel Cron）**：受 `CRON_SECRET` 保護的 route（驗 `Authorization: Bearer`，未設 secret 一律拒絕）——
- [/api/cron/expense-digest](../src/app/api/cron/expense-digest/route.ts)（每天 13:00 UTC）：`expense_added` 即時 Email 太頻繁，改每日彙整（站內鈴鐺仍即時，只略過即時 Email）。為「排除收件者自己加的」於 `Expense` 加 `createdBy`。純函式 [lib/expenseDigest.ts](../src/lib/expenseDigest.ts) `computeExpenseDigests`（5 個單元測試）。

**Web Push（VAPID）**：env-gated（`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY`，`getWebPushConfig()` 回 null 則跳過）。公鑰是**唯一帶 `NEXT_PUBLIC_` 的 env**（瀏覽器 `pushManager.subscribe` 需要、非機密）。model [PushSubscription](../src/models/PushSubscription.ts) = `{ user, endpoint(unique), keys, userAgent }`——**訂閱本身即 opt-in**（無 User 層開關）。[lib/webpush.ts](../src/lib/webpush.ts)：`buildPushPayload`（依收件者語系在地化、**重用 `notifications` 命名空間**）+ `sendPush`（best-effort、回 404/410 就地刪失效訂閱）。接進 `notify()` fan-out（沿用 4 觸發點；**推播一律即時、不看 `notifyByEmail`**——推播的 opt-in 是有沒有訂閱）。**與離線 PWA 共用同一個 service worker**（[src/sw.ts](../src/sw.ts) 的 `push` / `notificationclick` handler）。訂閱管理 [push.actions.ts](../src/actions/push.actions.ts) + [usePushNotifications](../src/hooks/usePushNotifications.ts) + 設定頁通知卡（iOS 加主畫面引導 `needsInstall` + 已訂閱裝置列表）。**鈴鐺即時化**：每次推播後 SW `postMessage` 開啟分頁 → [useNotificationPushSync](../src/hooks/queries/useNotifications.ts) invalidate（60s 輪詢保留為無推播使用者的 fallback）。**iOS Safari 須先「加入主畫面」（standalone）才支援推播**。

---

## 9. 統計

| 範疇 | 說明 |
| --- | --- |
| 個人（跨旅程） | `/stats`，彙總「我」在所有旅程的分攤，可依日期區間篩選 |
| 群組（單一旅程、全團） | `/trips/[id]/stats`，全團分類佔比、付款排行、平均每人每日 |
| 標籤統計 | 依自訂標籤加總（個人 + 群組），無標籤時不顯示該區塊 |
| 按行程日花費 | `dailySpend`（每行程日 total/count） |
| 趨勢直方圖 | `ExpenseHistogram` |

**個人**：[getStats](../src/actions/stats.actions.ts) 過濾 `splits.user = 我`。**群組**：[getTripStats](../src/actions/stats.actions.ts) **不過濾** `splits.user`、金額取整筆，純計算在 [lib/tripStats.ts](../src/lib/tripStats.ts) `computeTripStats`（9 個單元測試）+ [公開分享路由](../src/app/api/public/trips/%5Bid%5D/stats/route.ts)。兩者 `categoryStats` 形狀相同，`ExpenseHistogram` / `CategoryStats` 元件兩邊共用；群組查詢重用 `tripKeys.stats`。**按天花費**：`dailySpend` 用 §5 的 `Expense.itineraryDay` 連結加總（未關聯支出歸入最後的 null 桶），UI [DailySpendCard](../src/components/stats/DailySpendCard.tsx)。

**標籤統計**：`tagStats: TagStat[]`，與 `categoryStats` 同一套 `Map<key, {total,count,details}>` 聚合手法，個人版本（`getStats`）計自己分攤的份額、群組版本（`computeTripStats`）計整筆金額——差異與 `categoryStats` 完全一致。一筆支出可有多個標籤，故金額會**分別**計入每個標籤的桶（非分攤），不影響 `totalAmount`。UI [TagStats.tsx](../src/components/stats/TagStats.tsx)（結構同 `CategoryStats.tsx`），無標籤資料時整區塊不渲染。

---

## 10. 旅遊地圖與分享

四種模式 + 使用者層級公開分享：

| 模式 | 說明 |
| --- | --- |
| 航線 | great-circle 弧線 |
| 熱點 | leaflet.heat，權重 = 造訪次數 **或** 花費（登入限定） |
| 國家 | choropleth 點亮造訪國 |
| 相片 | 旅程相簿相片依 EXIF GPS 釘點（退關聯行程日座標），點擊看 gallery（登入限定，§17 Phase 3） |

- **Leaflet 為 client-only**：畫布一律 `dynamic(..., { ssr: false })`，並在 [globals.css](../src/app/globals.css) 保留 `.leaflet-container { isolation: isolate; }`。
- **分享為使用者層級**：`User.mapShareCode`（opt-in、sparse-unique，同 trip `hashCode` 格式 / 驗證）。`/map/share/*` 為公開頁。
- **公開 API [/api/public/map/[code]](../src/app/api/public/map/%5Bcode%5D/route.ts) 依約去識別化**：只露座標、在地化地名與**年份**，絕不露旅行名稱 / id / 完整日期。熱點彙整到四捨五入座標。
- **花費權重熱點**（[getVisitedPlaces](../src/actions/map.actions.ts) `weightBy: 'visits' | 'spend'`）以 `$lookup` 關聯支出加總；**花費權重恆為登入限定**（公開地圖去識別化契約不外洩金額）。
- **相片釘點**：Phase 3 起改讀旅程相簿 `Photo` collection（詳見 §17；舊的 ROADMAP #16 收據衍生模式已退役，收據附件不再上地圖）。純函式 [groupPhotoPins](../src/components/map/photos.ts) 以 **50m 貪心距離分群**（質心錨定，釘點座標＝群質心）；cluster 在最大縮放被點擊時把群內釘點合併直接開整組 gallery（取代 spiderfy）。`url`／`thumb_url` 由 `presignGetStable` 批次簽發，**恆為登入限定、不外洩到公開分享路由**。
- **`public/geo/countries.geojson` 是產生的資產**（Natural Earth 110m admin-0 瘦身版），需更新時自 `nvkelso/natural-earth-vector` 重新產生。

---

## 11. 動態牆（活動紀錄）

collection [ActivityLog](../src/models/ActivityLog.ts) = `{ trip, actor, actorName, type, meta }`（timestamps 只 createdAt）。**與通知的取捨**：通知是 per-user fan-out 收件匣，動態牆是 **per-trip 單筆共享**（一個事件存一筆、全體成員共看同一份時間軸、走 getTripMembership 授權，且**包含觸發者本人**）。寫入工具 [lib/activity.ts](../src/lib/activity.ts) `logActivity()` = best-effort。**五個觸發點**：`expense_added` / `expense_updated` / `expense_deleted` / `payment_recorded` / `member_joined`（前三者是通知沒有的「誰改了什麼」稽核值）。Action [getActivityLog](../src/actions/activity.actions.ts)（成員可檢視全團、上限 50 筆）。**資料完整性**：`deleteTrip` cascade；`removeMember` 刻意**不清**（稽核性質、actorName 已快照）。UI：獨立子頁 [/trips/[id]/activity](../src/app/%5Blocale%5D/trips/%5Bid%5D/activity/page.tsx) + [ActivityFeed](../src/components/activity/ActivityFeed.tsx)。

> **型別命名**：行程子系統已有不同概念的 `ActivityType` / `Activity`（景點 / 餐飲…），故動態牆型別一律 `ActivityLog*` 避免衝突。

---

## 12. 離線優先 PWA

出國當下常沒網路 / 漫遊昂貴，卻正是要記帳的時刻。離線支援拆兩層（因讀寫都走 Server Actions（POST RPC），離線無法執行也無法被 SW 正常快取）：

**離線讀取 + 可安裝 app shell**：導入 **Serwist**（`@serwist/next`）。
- **Service worker**（[src/sw.ts](../src/sw.ts) → 建置產出 `public/sw.js`，gitignore）：`defaultCache` 為底 + Leaflet 圖磚 CacheFirst + R2 圖片 CacheFirst，導覽 NetworkFirst、雙語靜態 [public/offline.html](../public/offline.html) fallback；**明確不快取 server-action POST / `/api/*` 變更**。
- **TanStack Query 快取持久化到 IndexedDB**（[lib/queryPersister.ts](../src/lib/queryPersister.ts)，`idb-keyval`，`maxAge` 7 天、`PERSIST_BUSTER` 版本碼）接進 [QueryProvider](../src/components/providers/QueryProvider.tsx)（`PersistQueryClientProvider`，query defaults 加 `networkMode:'offlineFirst'`）。先前看過的旅程斷網重開仍渲染。
- UI：[useOnlineStatus](../src/hooks/useOnlineStatus.ts) + [OfflineBanner](../src/components/OfflineBanner.tsx)。

**離線寫入（僅支出建立）**：最常見的「記帳當下沒網路」情境；**編輯 / 刪除維持線上限定**（離線時以 `onlineManager.isOnline()` 擋下並 toast）。純函式 [lib/optimisticExpense.ts](../src/lib/optimisticExpense.ts) `buildOptimisticExpense`（`optimistic_<uuid>` 合成 id，7 個單元測試）。[useExpenseMutations](../src/hooks/queries/useExpenseMutations.ts) 的 `create`：`onMutate` 樂觀插入、`onError` 回滾、`onSettled` invalidate；變數帶 `{ tripId, input }`（**tripId 須隨變數序列化**，reload 後重放才知道目標 trip）。**離線佇列三段式**：① `networkMode:'online'` 讓離線 mutation 自動暫停；② 暫停中的 mutation 連同 query 快取持久化到 IndexedDB；③ [lib/offlineMutations.ts](../src/lib/offlineMutations.ts) `registerOfflineMutationDefaults` 以 `setMutationDefaults` 全域重註冊 `mutationFn`（序列化只存 key + 變數，reload 後靠這個重放），restore 後 `onSuccess` 呼叫 `resumePausedMutations()`。UI：樂觀列顯示「待同步」CloudOff badge、隱藏編輯 / 刪除。

> **Build/dev 踩雷**：Serwist 用 webpack plugin，**Next 16 預設 Turbopack 不會觸發它**（build 無錯但不產 `sw.js`）→ `build` script 改 **`next build --webpack`**。SW 在 dev 停用，PWA 測試走 `pnpm build && pnpm start`。

---

## 13. 年度旅行回顧（Travel Wrapped）

年底「我的旅行回顧」高傳播性留存功能，純彙整、**無新 model / 無遷移**。純函式 [lib/yearInReview.ts](../src/lib/yearInReview.ts) `computeYearInReview`（**兩種年份口徑**：地理 = 「起訖與該年重疊」的旅程 = 趟數 / 國家 / 城市 / 里程 / 最長天數 / 旅伴；花費 = 「支出日期落在該年」的個人分攤 = 總額 / 分類 / 月份；12 個單元測試）。小重構：抽出共用 [lib/geo.ts](../src/lib/geo.ts) `haversineKm`、[dateRange.ts](../src/lib/dateRange.ts) `yearsSpanned`。Action [getYearInReview](../src/actions/wrapped.actions.ts) + [useYearInReview](../src/hooks/queries/useYearInReview.ts)（`keepPreviousData` 讓年份切換不閃整頁）。

UI：登入頁 [/wrapped](../src/app/%5Blocale%5D/wrapped/page.tsx)（年份切換 + 漸層圖卡 [WrappedCard](../src/components/wrapped/WrappedCard.tsx) + 每月花費長條 + 下載 / 分享）；圖卡以 **html-to-image** 匯出 PNG（手機走 Web Share、桌機退回下載；卡內**不放遠端圖片**避免擷取 CORS）。**分享串接既有 `mapShareCode`**；公開路由 [/api/public/wrapped/[code]/[year]](../src/app/api/public/wrapped/%5Bcode%5D/%5Byear%5D/route.ts) **只回傳地理 + 年份，不含任何金額 / 分類 / 旅伴 / 名稱 / 完整日期**（守住 mapShareCode「永不外洩金額」契約）。公開頁 [/wrapped/share/[code]/[year]](../src/app/%5Blocale%5D/wrapped/share/%5Bcode%5D/%5Byear%5D/page.tsx)（proxy `protectedRoutes` 為精確比對，`/wrapped` 不涵蓋此多段路徑故維持公開）。*未做：topCountry / 最愛目的地、公開圖卡下載、逐 story 翻頁動畫。*

---

## 14. 隨手記（Trip notes）

旅程成員共享的速記——想到但尚未排入行程的點子先丟這裡，之後可**一鍵轉成行程活動**。

| 功能 | 說明 |
| --- | --- |
| 速記 | **Markdown**（≤10,000 字，GFM＋單換行即換行），釘選置頂 |
| 待辦打勾 | 內文 `- [ ]` task list 直接在卡片上點擊勾選（改寫原文存回） |
| 長筆記摺疊 | 超過 4 行或 160 字的筆記摺疊成「首行標題＋兩行摘要」，點擊展開 |
| 照片附件 | 每則最多 6 張圖片，R2 私有存放、僅成員可見 |
| 轉行程 | 把筆記轉成某一行程日的活動，筆記標記「已規劃」保留在摺疊區 |

採**獨立 Note 集合**（`ref trip`，比照 §6 清單為旅程子集合，非內嵌在 Trip）；`authorName` 為建立當下快照（比照留言，讀取免 populate）。權限採**成員信任模型**（任何成員可建立 / 編輯 / 刪除 / 轉行程）——隨手記定位是最低摩擦的協作速記，卡權限反而失去「隨手」的意義。**僅成員可讀，不設公開分享路由**（分享頁看不到）。6 個 action（[note.actions.ts](../src/actions/note.actions.ts)）：`getNotes`（釘選優先、新到舊）、`createNote` / `updateNote` / `deleteNote`、`planNote`、`getNoteAttachmentUrl`。列表以 `pinned:-1, createdAt:-1` 排序。資料完整性：`deleteTrip` cascade（連同 R2 照片）。

- **轉行程活動（`planNote`）**：把筆記 `$push` 成該行程日的活動（`type: 'other'`），**首行去 Markdown 語法後截斷為活動標題**（≤100 字，`summarizeNote`；strip 後為空退回原始首行），標題有改寫 / 截斷或筆記多行時全文放進活動備註避免遺失；成功後於筆記寫入 `plannedAt` + `plannedDayNumber`（轉換當下的日編號快照，供 Badge 顯示），**已規劃者不可再次轉換**。權限是**產品決定**：行程日建立 / 編輯本身為 admin-only，但轉行程開放全體成員——隨手記的路徑就是「人人先丟點子、順手推進行程」。非交易式（本 codebase 無多文件交易慣例）：先加活動再標記筆記，中途失敗筆記維持未規劃，重試至多產生可手動刪的重複活動，不反向遺失資料。
- **照片附件**：**只收圖片**（`NOTE_CONTENT_TYPES` = jpeg / png / webp，無 PDF；上限 `MAX_NOTE_BYTES` 4MB，沿用頭像上限），每則至多 6 張。沿用 §7 的 R2 私有附件模式——與收據 / 票券共用 `receipts` bucket、前綴 `notes/<tripId>/` 區隔；presigned PUT 直傳（[createNoteUploadUrl](../src/actions/upload.actions.ts)），**存參照前以 `headObject` 重新驗證 size / type**（防 client 謊報）。內嵌 `Note.attachments[]` = `{ key, contentType, size, uploadedBy, uploadedAt }`（**存 key、不存 url**，同收據形狀）；更新以 key 為穩定身分**整批覆寫**（新 key 走 `headObject`、舊 key 沿用、被移除的 key best-effort 刪 R2），刪筆記 / 刪旅程亦 best-effort 清理孤兒。檢視走短效簽名 GET（[getNoteAttachmentUrl](../src/actions/note.actions.ts)，驗成員 + key 須屬本 trip 筆記前綴），UI 沿用 §7 的 `AttachmentThumb` / `AttachmentUploader`（[ReceiptAttachments.tsx](../src/components/trips/detail/ReceiptAttachments.tsx)）。
- **UI**：頁面 [/trips/[id]/notes](../src/app/%28app%29/trips/%5Bid%5D/notes/page.tsx) + [NoteComposer](../src/components/trips/detail/notes/NoteComposer.tsx) / [NoteCard](../src/components/trips/detail/notes/NoteCard.tsx) / [NoteEditDialog](../src/components/trips/detail/notes/NoteEditDialog.tsx) / [PlanNoteSheet](../src/components/trips/detail/notes/PlanNoteSheet.tsx)；資料走 [useNotes](../src/hooks/queries/useNotes.ts)（`tripKeys.notes`）。測試涵蓋 note.actions（含附件 headObject 驗證 / 覆寫清理、planNote 標題 strip）、`toTripNoteDto`、uploads 白名單、`noteMarkdown`（標題/摘要抽取、task 改寫）、`relativeTime`。
- **版面重新設計（2026-07）**：composer 收成單一卡片——上傳器不再常駐（原本永遠掛一顆孤兒虛線方塊），圖片入口收成工具列 icon、縮圖只在有附件時出現，並支援 **`onPaste` 貼上即傳**（截圖直接貼）。卡片：pin / 「已規劃 Day N」badge 併入 meta 列（移除無條件渲染的空列），單張附件放大顯示、多張走方格。相對時間修 [relativeTime.ts](../src/lib/relativeTime.ts) 的 `intlLocale` `zh → zh-TW`（原本在繁中介面顯示簡體「4小时前」，**全站鈴鐺 / 動態牆同受益**）。
- **Markdown 筆記化（2026-07-14）**：內文從純文字升級為 **GFM Markdown**（上限 500 → 10,000 字），渲染共用行程頁 [MarkdownRenderer](../src/components/trips/detail/itinerary/MarkdownRenderer.tsx) 新增的 **`compact` 變體**（卡片字級、`remark-breaks` 讓單換行＝換行，與純文字時代顯示相容，舊資料零遷移）；裸網址由 GFM autolink 處理（原 `linkifyText` 退役刪除）。**長筆記摺疊**：`shouldCollapseNote` 超過 4 行或 160 字 → 摺成「首行標題＋兩行純文字摘要」（[summarizeNote](../src/lib/noteMarkdown.ts) 行級啟發式 strip，不跑完整 parser），點擊展開才渲染完整 Markdown。**task checkbox 互動**：卡片內 `- [ ]` 可直接點擊，以 DOM 順序事件委派對回原文序號（`toggleNoteTask`，fenced code 內不計、與 GFM 規格同步要求 `]` 後接空白），改寫原文走 `updateNote` 存回；`useNotes.update` 改 **optimistic**（點了即勾，失敗回滾），釘選切換順帶受惠。編輯 Dialog 加「編輯 / 預覽」tabs。已規劃筆記的 checkbox 唯讀。

---

## 15. 好友系統（Friends）

雙向好友關係——常和同一群人出遊時，不必每趟重加；也是未來社交功能（好友回顧 / 地圖疊層 / 足跡排行）的共用地基。

| 功能 | 說明 |
| --- | --- |
| 好友關係 | 邀請 / 接受 / 拒絕（收回）/ 刪除 / 列表（好友 + 收到 / 送出的 pending） |
| 入口 | 旅程成員頁「加好友」按鈕（已同遊過、userId 現成）+ 設定頁好友管理卡片 |
| 好友通知 | `friend_request` / `friend_accepted`（站內 + Email + Push，深連結設定頁；見 §8） |
| 匯入旅程 | 建旅程 / 成員頁「從好友加入」多選，直接加入成員 |

**Schema**：獨立 collection [Friendship](../src/models/Friendship.ts) = `{ requester, recipient, status: pending\|accepted, pairKey }`——**一段關係一份文件**（非 `User.friends[]` 雙陣列），讓「接受」是一次原子更新（Mongo 無 cascade，雙陣列有不一致風險），也預留未來 `blocked`。`pairKey` = 排序後的 `<小id>:<大id>`（`pre('validate')` 自動算），建 **unique index** 同時防重複邀請與反向重複（A→B 存在時 B→A 撞鍵）。虛擬成員（`isVirtual`）由 actions 層擋下、不參與。

**Actions**（[friend.actions.ts](../src/actions/friend.actions.ts)，只驗 session、不走 `getTripMembership`，各自 `dbConnect()`）：`getFriends` / `sendFriendRequest`（對方已先邀請我則直接原子接受，避免互按卡死）/ `acceptFriendRequest`（`findOneAndUpdate` 取回 requester 供通知）/ `declineFriendRequest`（拒絕或收回 → 刪文件）/ `removeFriend`。狀態機全用「條件式原子更新 / 刪除」（filter 帶 `_id` + 我方角色 + 當前狀態），不做讀改寫。21 個單元測試（[friend.actions.test.ts](../src/__tests__/friend.actions.test.ts)）。

**通知整合**：新增 `friend_request` / `friend_accepted` 類型，`Notification.trip` 改 optional，`notify()` 走無 `tripId` 路徑（見 §8）。UI 深連結一律到設定頁好友卡片。

**匯入旅程（原始痛點兌現）**：[addFriendsToTrip](../src/actions/member.actions.ts)（**成員層級**，非僅管理員——好友即同意、且分享邀請連結加入本就無審核，權限面不變寬）只收 **accepted 好友**（排序 `pairKey` 一次查回）、排除已是成員與自己，逐一 `Trip.updateOne(members.user $ne)` 防併發 push，每位被加入者發 `member_joined` 通知（fan-out 排除操作者本人）+ 動態牆。兩個入口：成員頁 [AddFriendsToTripDialog](../src/components/trips/detail/dialogs/AddFriendsToTripDialog.tsx) 多選、建旅程 [CreateTripDialog](../src/components/trips/CreateTripDialog.tsx) 內建「邀請好友一起」勾選（`createTrip` 成功後 best-effort 呼叫同一 action，失敗不擋建立）。8 個測試（[member.actions.test.ts](../src/__tests__/member.actions.test.ts)）。UI：設定頁 [FriendsSection](../src/components/friends/FriendsSection.tsx)（好友列表 + pending 收件匣）、成員頁 [AddFriendButton](../src/components/friends/AddFriendButton.tsx)（四態渲染），資料共用 [useFriends](../src/hooks/queries/useFriends.ts) 快取。

*未做（評估後認為現階段非必要）：好友邀請連結（`User.friendInviteCode`）、帳號搜尋（username/email 完全比對）。* 本專案目前無「刪帳號」流程，故 `Friendship` 清理路徑暫無掛載點。

---

## 16. 旅行成就（Travel Collections，ROADMAP #19）

「旅行人生紀錄」：搭過哪些航空（幾次、哪個航班）、住過哪些品牌飯店（文華東方式的品牌收藏牆）、
去過哪些國家。**user-level 終身紀錄**——可回填 app 出現之前的旅行史，也不因旅程刪除而消失。

| 功能 | 說明 |
| --- | --- |
| `/collections` 頁 | user-level（比照 /stats /wrapped），三 Tab＝航空／住宿／國家；桌機頂列＋「我的」選單入口 |
| 航空 tab | 統計磚（航班/航空公司/聯盟 x/3）＋航空徽章牆（IATA 圓章＋聯盟 badge＋次數）＋逐筆紀錄 CRUD |
| 住宿 tab | 統計磚＋**品牌收藏牆**（monogram 圓章＋tier 語意色環；不用商標圖）＋「顯示未收集」圖鑑切換＋逐筆 CRUD |
| 國家 tab | 由旅程出發/目的地＋行程日地點自動推導（與地圖/回顧同口徑），零手動輸入 |
| 歷史回填 | `datePrecision: day/month/year`——只記得年份的舊旅行也能補登（表單必填欄位極少） |
| 旅程連結 | 紀錄可選連結 trip（`getTripMembership` 驗證、雙重接受 id/hashCode）；P2 行程整合的地基 |

**固定目錄（核心取捨）**：航空/機場＝封閉集合 → 生成資產 [public/data/airlines.json + airports.json](../scripts/generate-catalogs.mjs)
（OpenFlights + OurAirports，`pnpm generate:catalogs` 重新產生、**勿手改**，比照 countries.geojson；
腳本內含三大聯盟標記、常用航空繁中名、以及修正 OpenFlights 停更後被新航空接手的代碼——JX 星宇、IT 台虎、TR 酷航等）。
兩份 JSON 不進 bundle，前端 [useCatalogs](../src/hooks/queries/useCatalogs.ts) 延遲 fetch＋`staleTime: Infinity`。
飯店＝開放集合 → **不做**單店目錄，人工精選**品牌**目錄 [hotelBrands.ts](../src/constants/hotelBrands.ts)
（~140 品牌/60 集團，`id` 為穩定識別碼勿改），`brand` 可為 null（獨立旅宿），目錄缺漏不擋輸入。

**Schema**：[FlightRecord](../src/models/FlightRecord.ts) / [StayRecord](../src/models/StayRecord.ts)，
`user`(index) + `trip`(可 null)。**刻意偏離級聯刪除慣例**：`deleteTrip` 對這兩個 collection 是
`updateMany({ trip }, { trip: null })` 解除連結而非刪除（終身紀錄）。隱私比照收據：不進任何公開分享路由。

**Actions**（[collection.actions.ts](../src/actions/collection.actions.ts)，比照好友系統只驗 session）：
`getCollections`（紀錄＋visited countries 一次回）＋兩組 CRUD（條件式原子更新/刪除 `{ _id, user }`，不做讀改寫）；
輸入過 Zod（[validation.ts](../src/lib/validation.ts) `create/updateFlightRecordSchema` 等），brand 存在性對
`HOTEL_BRAND_IDS` 驗證。彙總純函式 [lib/collections.ts](../src/lib/collections.ts)
（`summarizeAirlines` / `summarizeBrands` / `formatByPrecision`，10 個單元測試）。
航班號輸入自動帶出航空公司（前兩碼比對目錄）。

**P2（行程整合＋地圖＋wrapped，2026-07-13）**：
- **行程一鍵帶入**：行程頁交通/住宿活動列的 Medal 按鈕（**任何成員可用**，個人紀錄不受 isAdmin 限制）
  → 開預填的補登對話框。預填為啟發式（[lib/collectionImport.ts](../src/lib/collectionImport.ts)，15 個測試）：
  日期＝旅程出發日推第 N 天、航班號/航空自標題文字比對、出發/抵達機場自標題文字抓一組
  大寫 IATA 三碼（`parseAirports`，容忍箭頭/連字號/斜線/`to`/「往至到飛去」等方向記號；
  只認大寫免把小寫字誤判）、飯店品牌自標題比對目錄（取最長命中；旗艦品牌另掛裸集團關鍵字
  `aliases`，讓 "Bangkok Marriott Marquis" 這類「城市＋集團＋物業名」也命中）、住宿晚數自
  標題/備註抓 `晚/泊/night(s)`（`parseNights`）、猜錯在對話框改掉即可。紀錄帶 `sourceActivity`（活動子文件 _id，action 以 `ItineraryDay.exists`
  驗證歸屬防偽造）；[getTripCollectionLinks](../src/actions/collection.actions.ts) 回「我已帶入」的活動 id
  集合供顯示已帶入/防重複。編輯紀錄時 `source_activity_id` 沿用原值（改掉連結旅程才清除）。
- **地圖「飛行」模式**：第五個模式（routes/flights/heat/countries/photos）。FlightRecord 依
  「出發→抵達」聚合成航段（線寬＝次數、great-circle 弧＋機場點），座標自 airports.json 解析，
  **純 client 組裝、登入限定**——公開分享地圖（PublicMapView）不含此圖層。年份篩選連動，
  並把飛行紀錄年份併入年份選項（回填可早於任何旅程）。
- **wrapped 成就區塊**：`computeYearInReview` 新增（該年航班/住宿數＋「新解鎖」航空/品牌——
  首次出現以**全歷史**判定，3 個新測試）。`YearInReviewData` 新欄位為 **optional**：公開分享
  payload（[public wrapped 路由](../src/app/api/public/wrapped/%5Bcode%5D/%5Byear%5D/route.ts)自建白名單）
  不含它們 → 公開圖卡自動隱藏此區塊，去識別化契約不變。

**P3（里程碑徽章＋公開分享卡，2026-07-13，#19 至此全部完成）**：
- **里程碑徽章**：純函式 [lib/badges.ts](../src/lib/badges.ts)——15 枚（航班數/航空數/三大聯盟/
  住宿數/品牌數/奢華品牌×5/國家數），**輸入只有彙總數字 `BadgeCounts`**，`id` 一經釋出即凍結
  （i18n key 與公開卡依賴）。聯盟對照抽成單一來源 [constants/alliances.json](../src/constants/alliances.json)
  （generate-catalogs.mjs 與伺服端共用；異動後需 `pnpm generate:catalogs` 重產目錄）。
  `/collections` 第四個 tab「徽章」＝解鎖統計磚＋[BadgeWall](../src/components/collections/BadgeWall.tsx)
  （未解鎖灰階＋進度條）＋分享入口。
- **公開分享卡**：串同一把 `mapShareCode`（地圖/回顧/徽章三處共用同一個開關，文案有標示）。
  [/api/public/collections/[code]](../src/app/api/public/collections/%5Bcode%5D/route.ts) **只回
  BadgeCounts 彙總數字**——無日期、航班號、航線、飯店名、航空/品牌明細（逐筆紀錄維持
  「比照收據不進公開路由」的契約）；徽章由公開頁（/collections/share/[code]）以同一份
  lib/badges.ts 在前端推導。
- **wrapped `availableYears` 補遺**：登入版納入飛行/住宿紀錄年份（`availableReviewYears`
  第三參數；只有回填紀錄、沒有任何旅程的使用者也有年份可切，該年僅成就區塊有數字）。
  公開 wrapped 路由**刻意不納**：公開 payload 白名單不含成就區塊，納了只會多出整張白卡的年份。

### 會籍積分與里程紀錄（Loyalty，ROADMAP #20，2026-07-14～16 完成並結案：CX MVP → BR／CX 試算＋collapse → CI＋續卡精算）

規劃檔 PLAN-LOYALTY.md 已退役刪除（草圖查 git 歷史）。定位是「**積分記帳**，不是計算器」——積分/里數由
使用者從航空 app 手抄（LoyaltyEntry ledger），app 只對照門檻常數算升等/續會進度，不自動判級。

- **資料**：[LoyaltyAccount](../src/models/LoyaltyAccount.ts)（一人一 program 一筆，`{user, program}`
  unique；等級自行申報）＋ [LoyaltyEntry](../src/models/LoyaltyEntry.ts)（唯一加總來源；
  `ownAirline`/`qualifyingMiles` 已為 CI/BR 預留）。隱私比照 FlightRecord：**不進任何公開路由**，
  連彙總數字都不進公開收藏牆。
- **規則常數**：[constants/loyalty.ts](../src/constants/loyalty.ts) 集中全部門檻，`ProgramRules`
  為 discriminated union 依 `kind` 分兩制——**積分制**（`points`，升等窗口 `window:
  'calendar' | 'rolling12m'`＋續會窗口 `renewalWindow: 'sameWindow' | 'term2y'`）：CX 2027 新制
  （曆年：綠 0／銀 300／金 600／鑽 1,200／鑽石行政 2,400，金以上續會減半＋超額 50% 結轉）與
  CI 2026 新制（滾動 12 月：華夏 0／金 360／翡翠 720／晶鑽 1,400；續卡＝2 年卡籍效期內
  580／1,150／2,240；`ownAirlineMinRatio: 0.5`＝積分須 ≥50% 來自華航/華信，升等續卡皆適用）；
  **哩程＋航段制**（`milesAndSegments`，長榮 BR 近 12 月：銀 30k哩+4段／26段、金 50k／50段、
  鑽 120k／100段，哩程或航段擇一達標；續卡＝卡籍效期 2 年窗口，銀 40k／42段、金 80k／80段、
  鑽 200k／140段）。每 program 標 `verifiedAt`，UI 帶「以官方為準」——改規則＝改常數不動 schema。
- **進度計算**：[lib/loyalty.ts](../src/lib/loyalty.ts) 純函式，依 kind 分流——`computeLoyaltyProgress`
  （積分制：曆年／滾動 12 月窗口、跨級、結轉估算、續會門檻——`sameWindow` 同升等窗口（CX）
  或 `term2y` 效期窗口（CI）、自家占比）＋`computeMilesSegmentsProgress`（哩程制：滾動 12 月
  窗口、哩程／航段雙路徑達標、自家國際航段計數，純哩程可跳級；續卡＝效期窗口精算）。
  兩制的效期窗口都取 `tier_expires_at` 往前推 2 年、字串日期比較、兩端點含。
  測試在 [loyalty.test.ts](../src/__tests__/loyalty.test.ts)（39 個）。
- **UI**：獨立頁 `/memberships`（會籍）＝**航空／飯店兩個 tab**（比照旅行成就分頁；飯店為
  夜數制 placeholder，Phase 2 後續）。航空 tab **多 program 編排**
  （[AirlineMemberships](../src/components/memberships/AirlineMemberships.tsx)）：每個計畫一個
  **collapse 區塊**（[ProgramProgressCard](../src/components/memberships/ProgramProgressCard.tsx)）——
  收合列只放計畫名＋等級 badge（底色＝官方卡面近似色，`TIER_BADGE_COLORS`，規則見
  [TIER-COLORS.md](./TIER-COLORS.md)）＋迷你進度（CX `600/1,200`；BR 取哩程/航段完成率較高的路徑），
  點開才有 StatTiles、完整進度條（依 kind：CX 積分／BR 哩程＋航段雙路徑）、帳戶操作與該計畫的
  [LoyaltyLedger](../src/components/memberships/LoyaltyLedger.tsx)（RecordYearGroups 年份分組）；
  單一帳戶預設展開、多帳戶預設收合。新增帳戶可挑計畫、設定完隱藏。entry 表單 program-aware
  （BR 顯示卡籍哩程＋「長榮／立榮國際線航段」勾選）。字串仍在 `collections.loyalty.*` 命名空間；
  `/collections`（旅行成就）維持 4 個 tab（航空／住宿／國家／徽章）。航空 tab 每筆飛行紀錄加
  「記入會籍積分」（Medal 鈕，需先設帳戶；多帳戶時記入最早設定者）；已帶入者停用防重複
  （entry 存 `flightRecord` ref，action 驗證歸屬＋重複回 `CONFLICT`，同 sourceActivity 模式）。
  刪 FlightRecord 時 entry 解除連結但保留（積分仍是賺到的）；刪帳戶連帶刪該 program 全部
  entries（手動級聯）。
- **積分預估（CX，Phase 3，2026-07-15）**：官方 2025-08-20 生效賺取表進
  [constants/loyalty.ts](../src/constants/loyalty.ts)（`CX_SP_RANGES`：6 距離區間 × 客艙的 SP
  min–max——同艙等內依票價類別/訂位艙等字母差異大，FlightRecord 只存客艙 → 刻意只給**區間**；
  短途類別2 依 `CX_SHORT_TYPE2_COUNTRIES` 端點國家判定；**Asia Miles ＝ SP × 100** 官方兩表逐格
  恆等，`CX_AWARD_MILES_PER_SP` 推導）。[lib/loyalty.ts](../src/lib/loyalty.ts)
  `estimateCxStatusPoints` 純函式（距離＝[lib/geo.ts](../src/lib/geo.ts) `haversineKm` × `KM_TO_MI`）。
  兩個入口：(1) 飛行「記入會籍積分」時 entry 表單顯示預估 chip（點擊帶入積分＋里數 ×100，仍可改）；
  (2) CX 卡展開區「試算」鈕開
  [CxSpEstimatorDialog](../src/components/memberships/CxSpEstimatorDialog.tsx)（自選機場＋客艙，
  純顯示不落 DB）。預估 UI 恆帶「以官方為準」disclaimer（`CX_EARN_VERIFIED_AT`）。
- **Phase 2b（華航 CI＋BR 續卡精算，2026-07-16，#20 全部完成）**：`tier_expires_at`（卡籍效期）
  端到端接出（Zod → action → DTO → 帳戶表單效期欄，**僅 BR/CI 顯示**、CX 曆年制不用）——兩家
  續卡窗口都錨定它；未設效期則續卡顯示「設定效期後可計算」提示。CI 自家占比 <50% 顯示警示
  （`text-warning` 語意色）；entry「自家航班」勾選 program-aware（BR＝航段判定、CI＝占比分子，
  CX 無此欄），飛行帶入依 `OWN_AIRLINE_CODES`（CI/AE、BR/B7）預設勾選。BR 官方「達標日至新卡
  生效間哩程保留」緩衝機制**刻意不建模**（disclaimer 蓋住）。查證註記（2026-07-16）：BR 續卡為
  官網一手；CI 官網被 Akamai 擋，以 jazztalk／pokem／官方社群三來源交叉確認（constants 註解
  有記，日後可補官方一手核對——見 ROADMAP #20 延伸）。

---

## 17. 旅程相簿（Trip Album，ROADMAP #21）

> Phase 1（相簿本體）／Phase 2（行程日關聯、說明、批次刪除）／Phase 3（地圖整合＋退役收據相片模式）
> ／Phase 4（公開分享）已完成 2026-07-15；**2026-07-16 真機驗收通過並結案**（iOS 選 HEIC 自動轉
> JPEG、下載回手機 Apple 照片讀得到地點——本功能的驗收標準）。規劃檔 PLAN-PHOTOS.md 已退役刪除
> （草圖查 git 歷史）；可選延伸（封面／打包下載／Year in Review／`place` 回填）記在 ROADMAP #21。

- **定位**：trip-scoped 共享相簿，比照隨手記／清單的**成員信任模型**（任何成員可上傳／編輯／刪除）。
  [Photo](../src/models/Photo.ts) 為旅程下的獨立 collection；`uploadedByName` 為上傳當下快照（讀取免 populate）。
  成員版 `usePhotos` 直接呼叫 action、不走 public fallback；公開分享（Phase 4）是**另一條獨立路由**（見下）。
- **EXIF 保存是本功能的核心取捨**（[imageCompress.ts](../src/lib/imageCompress.ts)）：丟掉 EXIF 的**不是壓縮，
  是 canvas 重繪**——canvas 是純像素表面，`toBlob()` 吐出的是全新的乾淨檔案。改用
  `browser-image-compression` 的 `preserveExif`（把原檔的 APP1 segment 原封搬進輸出），
  **但它只在「輸入 JPEG 且輸出 JPEG」時生效**（源碼實測確認；輸出 WebP 一律無 EXIF）。
  故相簿顯示檔**輸出 JPEG 而非 WebP**，代價是同畫質大 25–30%——換來使用者存回手機時
  Apple 照片／Google 相簿讀得到地點，**那才是本功能的驗收標準**。preset 因此新增
  `fileType`／`preserveExif` 兩個欄位；`receipt`／`avatar` 維持 WebP 不變（它們不需要 EXIF）。
  `preserveExif` 也順手處理 orientation（搬 EXIF 時把 Orientation 重設為 1，因為 canvas
  已把旋轉烤進像素）——**別自己手刻 EXIF 注入**。
- **兩份 EXIF、各司其職**：檔案裡那份給使用者帶走；[exif.ts](../src/lib/exif.ts) 另抽一份進 DB 欄位供
  地圖釘點／排序查詢（不可能為了讀 metadata 去下載解析每顆 JPEG）。**必須在壓縮前讀原始 File**。
  exifr 的選項是實測定出來的：**不可用 `pick`**（`{ pick, gps: true }` 會靜靜地不回 `latitude`／`longitude`），
  且 **`translateValues: false` 必要**（否則 `Orientation` 會是 `'Rotate 90 CW'` 這種字串）。
  `(0, 0)` 一律視為無座標（裝置定位失敗的常見假值）。**EXIF 是不可信輸入**——server 看不到 bytes、
  無法自行推導，故入庫前一律過 Zod（`photoExifSchema`），單一欄位不合格丟該欄位而非整張拒收。
- **HEIC 零依賴**：檔案挑選器 `accept` 刻意**不列 HEIC**（沿用收據／隨手記的白名單）——accept 不含 HEIC 時
  **iOS 會自動把 HEIC 轉成 JPEG 才交給網頁**（EXIF 含 GPS 保留），正好落在 `preserveExif` 唯一支援的
  JPEG→JPEG 路徑上。桌面拖放 `.heic` 不會被轉，由伺服器白名單擋下並在前端給明確訊息。
- **儲存**（[uploads.ts](../src/lib/uploads.ts)）：沿用私有 receipts bucket，前綴 `photos/<tripId>/`。
  每張兩顆物件、**共用同一個 uuid**（`<uuid>.jpg` 顯示＋下載／`<uuid>_t.webp` 縮圖），
  故上傳簽名**一次簽兩張**（`createPhotoUploadUrls`）——uuid 分家就無法推導 `_t`／`_p`。
  Phase 4 的消毒副本 `<uuid>_p.jpg` 規則現在就定死（key 命名有相片入庫後就改不動）。
  `MAX_PHOTO_BYTES = 6MB`（伺服器硬防線，壓縮後正常 2–3.5MB，長邊 3264 ≈ 8MP）；每旅程軟上限 300 張（回 `CONFLICT`）。
  刪除同 no-cascade 契約：blob best-effort，一次 `deleteObjects` 收三顆 key（含尚未存在的 `_p`，S3 刪不存在的 key 是 no-op）。
- **簽名 URL 必須穩定**（[storage.ts](../src/lib/storage.ts) `presignGetStable`）：SW 對 R2 圖片是 CacheFirst、
  快取 key＝完整 URL，而 `presignGet` 每次都產生新的 `X-Amz-Date`／`X-Amz-Signature` → 相簿每次瀏覽
  都是新 URL、快取永遠 miss 且無限膨脹。故把簽名時間戳**對齊整點窗口**（1 小時），窗口內對同一 key
  產生逐字元相同的 URL。TTL 是窗口的**兩倍**——否則窗口尾聲拿到的 URL 一秒後就死了。
  **收據仍用 `presignGet`（300s、不對齊），那是刻意的短效。**
- **行程日關聯與座標退回（Phase 2）**：lightbox 可把相片掛到某個行程日（`updatePhoto`），
  掛上時**沒有 GPS 的相片會借當天的座標**並標 `location.source = 'itinerary'`。規則的核心是
  **精確度只能往上、不能被覆蓋**：`'exif'`（相片自己的 GPS，街廓級）與 `'manual'`（使用者親手拉的釘）
  都比「整天共用一顆城市座標」精確，關聯行程日不會蓋掉它們；反向也成立——解除關聯或換到沒設地點的
  行程日時，**借來的座標要跟著消失**，否則地圖上會留下無來源可解釋的釘子（見 `deriveItineraryLocation`
  與 [photo.actions.test.ts](../src/__tests__/photo.actions.test.ts) 的對應案例）。
  行程頁的每張日卡片下方顯示當天相片（`DayPhotoStrip`，唯讀 lightbox；編輯／刪除留在相簿頁一處），
  資料與相簿頁**共用同一份 query 快取**、在前端依 `itinerary_day_id` 分組，不另開 query。
- **借來的座標必須跟著來源走**（Mongo 無 FK cascade，這種清理一律自己來，比照
  `deleteItineraryDay` 既有的 `Expense.itineraryDays` `$pull`）：刪行程日 → 相片解除關聯＋
  收回借來的座標；改／清行程日地點（`updateItineraryDay`）→ 借出的座標跟著移動／消失。
  兩處都只動 `location.source === 'itinerary'` 的相片，**`'exif'`／`'manual'` 永不受影響**。
  不變式由 [itineraryPhotoLinks.test.ts](../src/__tests__/itineraryPhotoLinks.test.ts) 守住。
- **批次刪除（Phase 2）**：相簿頁的選取模式 → `deletePhotos(tripIdOrCode, { photo_ids })`。
  **單張刪除也走同一支 action**（傳一個元素的陣列）：一次刪 50 張若逐張呼叫就是 50 次 action
  ＋50 次 `deleteObjects`。`deleteObjects` 本身改為**自動分批**（S3/R2 單次上限 1000 個 key），
  呼叫端不必自己算上限。
- **地圖整合＋退役收據相片模式（Phase 3）**：地圖的相片圖層改讀 `Photo` collection
  （[getMapPhotos](../src/actions/map.actions.ts)），座標取自相片自己的 EXIF GPS（退關聯行程日 → 手動拉釘，
  由 `location.source` 標示），**取代**了舊的收據衍生模式（收據是憑證不是回憶，座標只能借整天共用的行程日
  中心；不做資料遷移——既有收據圖的 EXIF 早已永久消失）。`url`／`thumb_url` 由 `presignGetStable` **批次簽發**
  隨 DTO 一起回（一次幾百張只是純 HMAC、沒有網路往返；逐張再打 action 反而 N+1），釘點對話框直接用它、
  改綁相簿共用的 `PhotoLightbox`（不再 per-photo `getReceiptUrl`）。座標分群歷經兩輪收斂：~1km 網格
  （整條街誤併）→ ~11m（4dp）網格（EXIF GPS 幾乎不會全同，幾乎每張自成一釘，且網格有「差 2m 跨線就拆群」
  的邊界問題）→ 現行 **50m 貪心距離分群**（質心錨定防鏈延，釘點座標＝群質心）。更遠釘點在低縮放的視覺
  重疊交給 marker cluster；cluster 在**最大縮放**被點擊時（過去會 spiderfy 散開成單張卡片）改為
  `mergePhotoPins` 合併群內釘點、直接開整組相片的 gallery（iPhone 相簿行為）。
  分群邏輯與不變式由 [mapPhotos.test.ts](../src/__tests__/mapPhotos.test.ts) 守住。
- **公開分享＝純相片牌，不帶任何位置（Phase 4）**：相簿可 opt-in 公開（`Trip.albumShareCode`，
  sparse-unique、`hash_code` 同格式；[albumShare.actions.ts](../src/actions/albumShare.actions.ts) 產生／
  重新產生／撤銷，trip-scoped 先驗成員）。公開頁 `/album/share/[code]`（不在 `proxy.ts` protectedRoutes）
  只顯示**相片＋說明＋日期＋旅程名**，**沒有地圖／地名／座標／EXIF／上傳者**。位置有兩條獨立外洩路徑，
  由兩個獨立機制同時切斷：① **檔案裡的 EXIF GPS** → 公開路由只簽剝除 APP1 的消毒副本 `_p.jpg`
  （[jpegSanitize.ts](../src/lib/jpegSanitize.ts) `stripJpegApp1`，Vitest 以 exifr 反向驗證剝完讀不到 GPS），
  **絕不簽**自帶 GPS 的顯示檔 `.jpg`；② **頁面上的座標** → `PublicAlbumPhoto`／`toPublicAlbumPhotoDto`
  是**獨立型別**（非成員 DTO 加 omit），型別上根本沒有 `location`／`place`／`exif`。消毒副本由
  [photoSanitize.ts](../src/lib/photoSanitize.ts) `ensureSanitizedPhotoCopies` **idempotent** 產生
  （開分享時預熱、分享中新上傳補產、公開路由 self-heal；穩態＝一次 `listKeys`、零產生）。
  收據永不進相簿分享（只簽 `photos/` 前綴、逐顆 `isPhotoKeyForTrip` 覆核）。
- **未做（刻意）**：`place`（相片自己的反查地名）目前仍一律 `null`——repo 沒有 reverse geocode 能力
  （`ItineraryDay.location` 是前端 Nominatim **正向**搜尋選好後整包送上來的，server 從不做地理查詢），
  且 Nominatim 限 1 req/sec，塞進上傳會讓「一次挑 20 張」變成 20 秒的 action。schema 形狀先留好
  （同 PLAN-LOYALTY 的 `ownAirline` 教訓：形狀留好，值可以之後才有），日後以**離線批次**回填。
  **在此之前地圖釘點的顯示標籤沿用關聯行程日的地名**（`getMapPhotos` 撈當天 `location`）——純 EXIF、
  未關聯行程日的相片沒有標籤（`name` 為空），座標照樣精確釘點。`'itinerary'` 座標退回同樣不需反查：
  行程日的地點是使用者當初正向搜尋選好的，借座標不需要任何地理查詢。

---

## 18. 其他

| 功能 | 說明 |
| --- | --- |
| 四語系 i18n | `en` / `zh` / `zh-CN` / `jp`，預設 `zh`（next-intl） |
| 深色模式 | `next-themes` |
| CSV 匯出 | 支出 / 行程 / 結算（[src/lib/exporters/](../src/lib/exporters/)） |
| 公開唯讀分享頁 | 旅程 / 統計 / 結算 / 行程 / 清單 / 地圖 / 回顧 |
