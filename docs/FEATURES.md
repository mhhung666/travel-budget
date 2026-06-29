# 功能總覽（Features）

> 更新日期：2026-06-29
> 本文件盤點**已實作**的所有產品功能，並附上各功能的關鍵實作筆記（schema / actions / UI / 取捨）。
> 規劃中、尚未動工的構想見 [ROADMAP.md](./ROADMAP.md)；系統架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)。

旅行記帳是一個多人旅程的記帳與分帳 App。以下依使用情境分組，列出每項功能與其落地細節。

---

## 1. 帳號與成員

| 功能 | 說明 |
| --- | --- |
| 註冊 / 登入 / 登出 | 自製 JWT（`jose`）+ httpOnly cookie，密碼以 `bcryptjs` 雜湊 |
| 修改個資 / 重設密碼 | 設定頁；重設碼存於 [PasswordResetCode](../src/models/PasswordResetCode.ts) |
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

**預算（💎 旗艦功能，兌現「Budget Planner」名稱）**：`Trip.budget` = `{ total, categories: [{ category, amount }] }`（基準幣 TWD，無 currency 欄位，null = 未設）。預算進度由純函式 [lib/budget.ts](../src/lib/budget.ts) `computeBudgetProgress` **前端即時計算**（旅程詳情頁本就載入 trip + 全部支出，省一次往返），故未做 `getBudgetProgress` action，只有 [setTripBudget](../src/actions/budget.actions.ts)（admin）寫入。UI：旅程詳情頁的預算卡（總額 + 各分類進度條、超支標紅）+ 編輯對話框。*進階（每日步調、每人預算）尚未做。*

---

## 3. 支出與分帳

| 功能 | 說明 |
| --- | --- |
| 支出 CRUD | 付款人、日期、7 種分類、備註 |
| 多幣別 + 匯率 | 存原幣 + 匯率，換算 TWD 寫入 `amount` |
| 四種分帳 | 均分 / 金額 / 百分比 / 份數 |
| 收據附件 | R2 私有 bucket（見 §7） |
| 支出 ↔ 行程日連結 | `Expense.itineraryDay`（見 §5） |
| 搜尋 / 篩選 | 關鍵字 / 分類 / 付款人 / 分帳對象 / 日期區間 |

**彈性分帳**：四種模式的明確選單（ToggleGroup）。計算抽成純函式 [lib/expenseSplit.ts](../src/lib/expenseSplit.ts) `computeSplits`（14 個單元測試）；輸入用原幣、即時換算成 TWD 寫入 `splits[].shareAmount`；`createExpense` / `updateExpense` 加寬鬆的「總和 ≈ 金額」防呆。實作於 [ExpenseFormDialog.tsx](../src/components/trips/detail/dialogs/ExpenseFormDialog.tsx)。「我請客」用金額模式即可達成；*「逐項分帳」尚未做。*

**搜尋 / 篩選**：純前端篩選——純函式 [lib/expenseFilters.ts](../src/lib/expenseFilters.ts) `filterExpenses` / `countActiveFilters`（關鍵字 + 分類 + 付款人 + 分帳對象 + 日期區間，AND 結合；19 個單元測試）。[TripExpenses.tsx](../src/components/trips/detail/TripExpenses.tsx) 加搜尋框 + 可收合的進階篩選面板（含啟用條件數 badge 與「清除」、結果筆數提示）。長列表採**純前端漸進渲染**（預設 20 筆 +「顯示更多」）——**伺服端游標分頁刻意延後**（見 [IMPROVEMENTS.md](./IMPROVEMENTS.md) G）。

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
| 打包清單 / 待辦 | 獨立 [Checklist](../src/models/Checklist.ts) 集合、進度條 |
| 指派成員 | 每個項目可指派 assignee |

採**獨立 Checklist 集合**（非內嵌在 Trip）：比照 ItineraryDay 為旅程子集合，避免每次載入 Trip 都帶清單、也避免勾一個項目就改寫整份 Trip；項目 `items[]` 仍內嵌（數量有界、整批編輯）。權限採**成員信任模型**（任何成員可建立 / 編輯 / 勾選 / 刪除）。7 個 action（[checklist.actions.ts](../src/actions/checklist.actions.ts)，項目更新以 `arrayFilters` 定位）+ [公開唯讀分享路由](../src/app/api/public/trips/%5Bid%5D/checklists/route.ts)。資料完整性：`deleteTrip` cascade、`removeMember` 清掉該成員的 item 指派。*清單範本複用尚未做。*

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
| 站內通知（鈴鐺） | 新增支出 / 登記還款 / 成員加入 | per-user 收件匣 + 未讀數 |
| Email（Resend） | 同上 | 新增支出改**每日彙整**；還款 / 加入即時 |
| 排程提醒（Vercel Cron） | 每週結算提醒 + 每日支出摘要 | best-effort、env-gated |
| Web Push | 同站內三觸發點 | 瀏覽器推播、共用離線 SW |

**站內通知**：collection [Notification](../src/models/Notification.ts) = `{ user(收件者), trip, tripName, type, actor, actorName, meta, read }`——**per-user 收件匣**（去正規化顯示欄位、讀取免 populate）。fan-out 工具 [lib/notify.ts](../src/lib/notify.ts) `notify()` = **best-effort**（失敗只記 log、絕不 throw 進主 action）；純函式 `selectNotificationRecipients`（排除觸發者本人 / 虛擬成員 / 去重，8 個單元測試）。三觸發點：`createExpense` / `recordPayment` / `joinTrip`。Actions [notification.actions.ts](../src/actions/notification.actions.ts) 皆限定 `user: session.userId`。**文案在前端依收件者語系即時組出**（i18n `notifications` 命名空間 + meta）。UI：navbar 鈴鐺 [NotificationBell](../src/components/notifications/NotificationBell.tsx)（未讀 badge 輪詢 60s + 視窗 focus 重抓、Popover 清單、點擊標記已讀並導向）。資料完整性：`deleteTrip` cascade、`removeMember` 清該成員通知。

**Email（Resend）**：env-gated（`RESEND_API_KEY` / `RESEND_FROM` / `APP_URL` optional，`getResendConfig()` 回 null 則整支靜默跳過）。[lib/email.ts](../src/lib/email.ts) `sendEmail()` = best-effort 永不 throw。模板 [lib/emailTemplates.ts](../src/lib/emailTemplates.ts) 在伺服端用收件者語系以 next-intl `createTranslator` 算文案（`email` i18n 命名空間，四語系）。為此 `User` 加 `notifyByEmail`（opt-out，預設開）+ `locale`（寄信語系）。連結用 `APP_URL` 組絕對 URL，HTML 模板對使用者字串做 escape。

**排程（Vercel Cron）**：兩支受 `CRON_SECRET` 保護的 route（驗 `Authorization: Bearer`，未設 secret 一律拒絕）——
- [/api/cron/settlement-reminder](../src/app/api/cron/settlement-reminder/route.ts)（每週一 01:00 UTC）：純函式 [lib/settlementReminder.ts](../src/lib/settlementReminder.ts) `computeSettlementDigests`（重用 `applyPayments` 抵銷已登記還款，彙整每位使用者跨旅程的待結清清單；軟封存的旅程不提醒、5 個單元測試）。
- [/api/cron/expense-digest](../src/app/api/cron/expense-digest/route.ts)（每天 13:00 UTC）：`expense_added` 即時 Email 太頻繁，改每日彙整（站內鈴鐺仍即時，只略過即時 Email）。為「排除收件者自己加的」於 `Expense` 加 `createdBy`。純函式 [lib/expenseDigest.ts](../src/lib/expenseDigest.ts) `computeExpenseDigests`（5 個單元測試）。

> **Vercel Hobby cron 上限 2 個 job**：結算提醒（每週）+ 支出摘要（每日）剛好用滿（見 [vercel.json](../vercel.json)）。

**Web Push（VAPID）**：env-gated（`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY`，`getWebPushConfig()` 回 null 則跳過）。公鑰是**唯一帶 `NEXT_PUBLIC_` 的 env**（瀏覽器 `pushManager.subscribe` 需要、非機密）。model [PushSubscription](../src/models/PushSubscription.ts) = `{ user, endpoint(unique), keys, userAgent }`——**訂閱本身即 opt-in**（無 User 層開關）。[lib/webpush.ts](../src/lib/webpush.ts)：`buildPushPayload`（依收件者語系在地化、**重用 `notifications` 命名空間**）+ `sendPush`（best-effort、回 404/410 就地刪失效訂閱）。接進 `notify()` fan-out（沿用 3 觸發點；**推播一律即時、不看 `notifyByEmail`**——推播的 opt-in 是有沒有訂閱）。**與離線 PWA 共用同一個 service worker**（[src/sw.ts](../src/sw.ts) 的 `push` / `notificationclick` handler）。訂閱管理 [push.actions.ts](../src/actions/push.actions.ts) + [usePushNotifications](../src/hooks/usePushNotifications.ts) + 設定頁通知卡（iOS 加主畫面引導 `needsInstall` + 已訂閱裝置列表）。**鈴鐺即時化**：每次推播後 SW `postMessage` 開啟分頁 → [useNotificationPushSync](../src/hooks/queries/useNotifications.ts) invalidate（60s 輪詢保留為無推播使用者的 fallback）。**iOS Safari 須先「加入主畫面」（standalone）才支援推播**。

---

## 9. 統計

| 範疇 | 說明 |
| --- | --- |
| 個人（跨旅程） | `/stats`，彙總「我」在所有旅程的分攤，可依日期區間篩選 |
| 群組（單一旅程、全團） | `/trips/[id]/stats`，全團分類佔比、付款排行、平均每人每日 |
| 按行程日花費 | `dailySpend`（每行程日 total/count） |
| 趨勢直方圖 | `ExpenseHistogram` |

**個人**：[getStats](../src/actions/stats.actions.ts) 過濾 `splits.user = 我`。**群組**：[getTripStats](../src/actions/stats.actions.ts) **不過濾** `splits.user`、金額取整筆，純計算在 [lib/tripStats.ts](../src/lib/tripStats.ts) `computeTripStats`（9 個單元測試）+ [公開分享路由](../src/app/api/public/trips/%5Bid%5D/stats/route.ts)。兩者 `categoryStats` 形狀相同，`ExpenseHistogram` / `CategoryStats` 元件兩邊共用；群組查詢重用 `tripKeys.stats`。**按天花費**：`dailySpend` 用 §5 的 `Expense.itineraryDay` 連結加總（未關聯支出歸入最後的 null 桶），UI [DailySpendCard](../src/components/stats/DailySpendCard.tsx)。

---

## 10. 旅遊地圖與分享

三種模式 + 使用者層級公開分享：

| 模式 | 說明 |
| --- | --- |
| 航線 | great-circle 弧線 |
| 熱點 | leaflet.heat，權重 = 造訪次數 **或** 花費（登入限定） |
| 國家 | choropleth 點亮造訪國 |

- **Leaflet 為 client-only**：畫布一律 `dynamic(..., { ssr: false })`，並在 [globals.css](../src/app/globals.css) 保留 `.leaflet-container { isolation: isolate; }`。
- **分享為使用者層級**：`User.mapShareCode`（opt-in、sparse-unique，同 trip `hashCode` 格式 / 驗證）。`/map/share/*` 為公開頁。
- **公開 API [/api/public/map/[code]](../src/app/api/public/map/%5Bcode%5D/route.ts) 依約去識別化**：只露座標、在地化地名與**年份**，絕不露旅行名稱 / id / 完整日期。熱點彙整到四捨五入座標。
- **花費權重熱點**（[getVisitedPlaces](../src/actions/map.actions.ts) `weightBy: 'visits' | 'spend'`）以 `$lookup` 關聯支出加總；**花費權重恆為登入限定**（公開地圖去識別化契約不外洩金額）。
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

## 14. 其他

| 功能 | 說明 |
| --- | --- |
| 四語系 i18n | `en` / `zh` / `zh-CN` / `jp`，預設 `zh`（next-intl） |
| 深色模式 | `next-themes` |
| CSV 匯出 | 支出 / 行程 / 結算（[src/lib/exporters/](../src/lib/exporters/)） |
| 公開唯讀分享頁 | 旅程 / 統計 / 結算 / 行程 / 清單 / 地圖 / 回顧 |
</content>
</invoke>
