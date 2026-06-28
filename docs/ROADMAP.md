# 功能藍圖（Feature Roadmap）

> 建立日期：2026-06-26（最後更新：2026-06-28）
> 對應版本：v3.4.3
> 性質：產品功能藍圖。盤點現有功能、列出可新增的功能構想，並給出優先序與落地草圖（schema / actions / UI 影響）。
> 相關文件：架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)；程式碼/基礎設施層級的改善見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)（本文件聚焦**產品功能**，與之互補）。

圖例：💎 旗艦（高價值、定義產品）　⭐ 高價值　🔹 加值/驚喜　｜　✅ 已完成
成本：S（數天）／M（一兩週）／L（需基礎設施或大改）

慣例：**已完成項目只保留「已實作」筆記**（內含與原草圖的偏離、以及尚未做的部分）；**未完成項目保留「做法」草圖**。原始草圖如需回顧，查本檔 git 歷史即可。

> **進度**：Tier 1 全數完成 — **#1 預算**、**#2 結算「標記已付」**、**#3 彈性分帳**；另完成 **#13 群組統計**、**#7 清單／待辦**、**#17 支出搜尋/篩選**。第二波導入 **Cloudflare R2 blob 儲存**，解鎖 **#4 收據附件** 與 **#11 頭像**。**#6 行程強化** 全 3 Phase 完成（活動時間軸 → 支出↔行程連結 → 票券附件 + 統計/地圖按天聚合）。第三波 **#9 通知 Phase 1（站內通知 + 鈴鐺）**、**#8 動態牆（per-trip 共享活動時間軸）** 與 **#9 Phase 2a（Email 通知，Resend）+ 2b（Vercel Cron 排程結算提醒）** 完成。以上皆已併入 `master`（Phase 2b 於 `feat/email-notifications` 分支）。**下一步**：#9 Phase 3（Web Push）、#5 離線優先 PWA、#15 年度回顧，或穿插 S 級填空。

---

## 0. 現況盤點（已完成的核心）

先標定基準線，避免重複造輪子。

| 範疇 | 已有 |
| --- | --- |
| 帳號 | 註冊 / 登入 / 登出（JWT + httpOnly cookie）、改個資、重設密碼、**頭像**（R2） |
| 旅程 | CRUD、`hashCode` 公開分享 + 加入、個別軟封存、出發地/目的地、起迄日 |
| 成員 | admin/member 兩級、**虛擬成員**（未註冊也能分帳）、虛擬↔真人連結/轉換 |
| 支出 | CRUD、多幣別 + 匯率、7 種分類、付款人、四種分帳（均分/金額/百分比/份數）、**收據附件**（R2 私有 bucket）、**搜尋/篩選**（關鍵字/分類/付款人/分帳對象/日期） |
| 結算 | 貪心法最小化轉帳次數、餘額表 + 轉帳清單、**還款登記 + 淨額結算閉環** |
| 行程 | 逐日（日序 + 標題 + Markdown 內容 + 地點）+ **活動時間軸**（票券附件、確認碼）、**支出↔行程日連結**，刪除後自動重編號 |
| 清單 | 打包清單 / 待辦，可指派成員、進度條（獨立 Checklist 集合） |
| 統計 | 個人 + **全團**分類統計、付款排行、**按行程日花費**、日期區間篩選、趨勢直方圖 |
| 地圖 | 航線 / 熱點（造訪 / 花費權重）/ 國家三模式、使用者層級公開分享（`mapShareCode`） |
| 匯出 | CSV（支出 / 行程 / 結算） |
| 通知 | **站內通知**（鈴鐺 + 未讀數）：新增支出 / 登記還款 / 成員加入；per-user 收件匣（Email / Web Push 待做） |
| 動態牆 | **活動紀錄**（per-trip 共享時間軸）：支出新增/編輯/刪除、登記還款、成員加入；旅程子頁、稽核基礎 |
| 其他 | 四語系 i18n、深色模式、PWA manifest、公開唯讀分享頁 |

**三個最刺眼的產品缺口**（皆已於 Tier 1 補上）：

1. ✅ ~~App 叫「Budget Planner」卻沒有預算/編列功能~~ → 已補上預算編列與「預算 vs 實際」（見 #1）。
2. ✅ ~~結算只「算出」誰該付誰多少，沒有「標記已付清」~~ → 已補上還款登記與淨額結算閉環（見 #2）。
3. ✅ ~~分帳只能均分~~ → 已支援均分／金額／百分比／份數四種分帳（見 #3）。

---

## Tier 1 — 補完核心、立刻有感

### 1. ✅ 💎 預算編列與「預算 vs 實際」(Budgeting) — M〔已完成 2026-06-26〕
**為什麼**：直接兌現產品名稱。目前只能記錄已花的錢，無法回答「這趟還能花多少」。這是與「純分帳工具（如 Splitwise）」最大的差異化。

> **已實作**：`Trip.budget`＝`{ total, categories: [{ category, amount }] }`（基準幣 TWD，無 currency 欄位，null=未設）。預算進度由 [lib/budget.ts](../src/lib/budget.ts) `computeBudgetProgress` **前端即時計算**（旅程詳情頁本就載入 trip + 全部支出，省一次往返），故未做 `getBudgetProgress` action，只新增 [setTripBudget](../src/actions/budget.actions.ts)（admin）寫入。UI：旅程詳情頁的預算卡（總額 + 各分類進度條、超支標紅）＋ 編輯對話框。**進階（每日步調、每人預算）尚未做。**

---

### 2. ✅ 💎 結算閉環：標記「已付清」(Settle-up records) — M〔已完成 2026-06-26〕
**為什麼**：[settlement.actions.ts](../src/actions/settlement.actions.ts) 只即時計算轉帳清單，重整後狀態歸零，沒人知道「阿明到底還我錢了沒」。這是分帳 App 的核心閉環。

> **已實作**：新 model [Payment.ts](../src/models/Payment.ts)＝`{ trip, from, to, amount, note?, createdBy }`（金額基準幣 TWD）。結算抵銷抽成純函式 [lib/settlement.ts](../src/lib/settlement.ts) `applyPayments`（7 個單元測試，只淨 `balance`、保留 totalPaid/totalOwed 供顯示）；[getSettlement](../src/actions/settlement.actions.ts) 與[公開分享路由](../src/app/api/public/trips/%5Bid%5D/settlement/route.ts)皆載入還款、淨額後回傳（共用 `toPaymentRecord` mapper）。新增 [recordPayment / deletePayment](../src/actions/payment.actions.ts)（任何成員可登記/刪除，同 `deleteExpense` 信任模型）；`getPayments` 刻意併入 settlement 省一次往返。UI：結算頁建議轉帳每列「標記已付」按鈕、登記對話框（付款人→收款人下拉 + 金額 + 備註，可改金額做**部分結清**或計畫外還款）、已結清紀錄列表（公開檢視唯讀）。資料完整性：`deleteTrip` cascade、`removeMember` 孤兒參照防護皆已含 Payment。**兩個簡化**：只存 TWD（不存原幣，免歷史匯率）、以 `createdAt` 為結算時間（未做可回填 `settledAt`）。**與 #9 通知（結算提醒）的連動尚未做。**

---

### 3. ✅ ⭐ 彈性分帳（不均分）(Flexible splits) — M〔已完成 2026-06-26〕
**為什麼**：真實旅行不會永遠均分（有人沒吃那餐、有人請客、按比例）。**schema 已支援任意 `shareAmount`**，是缺明確的 UI。這是「補完既有設計」而非新建。

> **已實作**：四種模式 **均分 / 金額 / 百分比 / 份數** 的明確選單（ToggleGroup）。計算抽成純函式 [lib/expenseSplit.ts](../src/lib/expenseSplit.ts) `computeSplits`（14 個單元測試）；輸入用原幣、即時換算成 TWD 寫入 `splits[].shareAmount`；`createExpense`/`updateExpense` 加寬鬆的「總和 ≈ 金額」防呆。實際改的是 [ExpenseFormDialog.tsx](../src/components/trips/detail/dialogs/ExpenseFormDialog.tsx)（**原草圖誤指 `ExpenseForm.tsx`，該檔為未使用的舊元件**）。「我請客」用金額模式即可達成；**「逐項分帳」仍未做。**

---

## Tier 2 — 讓它成為「旅行」App（旅行情境深化）

### 4. ✅ ⭐ 收據照片 / 附件 (Receipt photos) — L（需儲存基礎設施）〔已完成 2026-06-27〕
**為什麼**：對帳、報帳的剛需，也是信任來源（「這筆是真的」）。

> **已實作**：導入 **Cloudflare R2**（S3 相容、無流量出口費）而非草圖預設的 Vercel Blob。基礎層 [lib/storage.ts](../src/lib/storage.ts)（server-only R2 client：`presignPut` / `presignGet` / `headObject` / `deleteObjects` / `deleteByPrefix`）+ [lib/uploads.ts](../src/lib/uploads.ts)（純函式：content-type 白名單、大小上限、`receipts/<tripId>/` 命名空間化 key —— owner 段由**伺服器**帶入，防跨 trip 寫入）+ [lib/imageCompress.ts](../src/lib/imageCompress.ts)（client 上傳前壓成 WebP，省流量）。收據存 **R2 私有 bucket**，內嵌 `Expense.attachments[]`＝`{ key, contentType, size, uploadedBy, uploadedAt }`（**存 key、不存 url**）；上傳走 presigned PUT 直傳 R2，存參照前以 **headObject** 重新驗證大小/型別（防 client 謊報）。檢視走 [getReceiptUrl](../src/actions/expense.actions.ts)（驗成員 + key 須屬本 trip → 短效簽名 GET）。`toExpenseDto` 加 `{ attachments }` 選項，**公開分享路由傳 `false`**（收據不外洩到未登入分享頁）。清理：`deleteExpense` / `deleteTrip` / 換附件皆 best-effort 刪 R2 物件。`R2_*` 六個 env 為 optional + `getR2Config()` 延遲檢查（未設定也能 boot / CI build）。UI：[ReceiptAttachments.tsx](../src/components/trips/detail/ReceiptAttachments.tsx)（上傳器 + 縮圖檢視）接進支出表單與支出卡。

### 5. ⭐ 離線優先 (Offline-first PWA) — L
**為什麼**：出國當下常常**沒網路 / 漫遊昂貴**，卻正是要記帳的時刻。已有 manifest，但無 service worker / 離線快取。
**做法**：加 service worker（`next-pwa` 或自寫 Workbox），支出建立採**樂觀 UI + 佇列**，連線恢復後同步。需處理離線時匯率（用最近一次快取值，回線再校正）。技術較深但對旅行 App 是殺手級體驗。

### 6. ✅ ⭐ 行程強化：時段、預訂、與支出連結 (Richer itinerary) — M〔Phase 1–3 全數完成；最後更新 2026-06-27〕
**為什麼**：原本行程只有「第幾天 + 標題 + 內容」。旅行者要的是**時間軸**與**訂房/機票**，以及讓支出能回溯到「第幾天」。

> **已實作（Phase 1 — 活動時間軸）**：`ItineraryDay` 內嵌 `activities[]`＝`{ time?, endTime?, title, type, location?, note?, confirmationCode? }`（比照 [Checklist](../src/models/Checklist.ts) `items` 內嵌、每項自動 `_id`；additive、`default []`，**無遷移**）。`type`＝景點/餐飲/交通/住宿/活動/其他（獨立列舉，非 EXPENSE_CATEGORIES）。整個陣列由 `updateItineraryDay` **覆寫**（同 `splits` 取捨，未開逐項 action）；[activitySchema](../src/lib/validation.ts) 以 `HH:mm` 正則驗證、空字串/省略統一轉 null。輕量版**訂位/票券**（確認碼 + 起迄時間）已收進來。純函式 [sortActivities](../src/lib/itineraryActivities.ts)（有時間者升冪、無時間殿後）+ 單元測試。UI：[ItineraryDayCard](../src/components/trips/detail/itinerary/ItineraryDayCard.tsx) 時間軸 + [ActivityListEditor](../src/components/trips/detail/itinerary/ActivityListEditor.tsx) 編輯器接進對話框，另有手機友善的單一活動快速新增（[ActivityFormDialog](../src/components/trips/detail/itinerary/ActivityFormDialog.tsx)、卡片上直接「新增活動」、編輯器可依時間排序）。**隱私決策**：[公開分享路由](../src/app/api/public/trips/%5Bid%5D/itinerary/route.ts) 回傳活動但**抹掉 `confirmationCode`**（訂位碼敏感，比照收據不外洩到公開頁）。markdown export 帶出活動清單。四語系。
>
> **已實作（Phase 2 — 支出↔行程連結）**：`Expense.itineraryDay`（nullable ref，additive 無遷移）。[create/updateExpense](../src/actions/expense.actions.ts) 接受 `itinerary_day_id` 並驗證該行程日**屬同一 trip**（比照 payer/split 的成員歸屬檢查，防跨團指向）。共用 [toExpenseDto](../src/lib/dto.ts) mapper 帶出 `itinerary_day_id`。**孤兒防護**：`deleteItineraryDay` 把參照此日的支出 `itineraryDay` 清為 null（比照 `removeMember` 清 checklist 指派；重編號不動 `_id`，故僅刪除需清）。UI：支出表單「關聯行程日」下拉（行程日經 React Query 與行程頁共用快取載入，省一次往返）+ 支出卡 `Day N` 標籤。四語系 + dto 測試。
>
> **已實作（Phase 3 — 票券附件 + 按天聚合）**：
> ① **活動票券附件**：`Activity.attachments[]`（內嵌，形狀同 `Expense.attachments`＝`{ key, contentType, size, uploadedBy, uploadedAt }`，additive 無遷移）。檔案存 **R2 私有 receipts bucket** 的新命名空間 `itinerary/<tripId>/`（與收據共用 bucket、前綴不同）——擴 [uploads.ts](../src/lib/uploads.ts)（`UploadKind` 加 `'itinerary'`、`itineraryKeyPrefix` / `isItineraryKeyForTrip`，沿用收據的型別白名單與 8MB 上限）。上傳走新 [createItineraryUploadUrl](../src/actions/upload.actions.ts) 的 presigned PUT，存參照前以 **headObject** 重新驗證 size/type（防 client 謊報）。檢視走 [getItineraryAttachmentUrl](../src/actions/itinerary.actions.ts)（驗成員 + key 須屬本 trip 票券前綴 → 短效簽名 GET）。**覆寫式 diff**：activities 整批覆寫（同 splits 取捨），故附件以 R2 `key` 為穩定身分跨整天 diff——新 key 驗證、舊 key 沿用（保留 uploadedBy/At）、被移除的 key 在 `updateItineraryDay` / `deleteItineraryDay` best-effort 刪 R2；`deleteTrip` cascade 也 `deleteByPrefix('itinerary/<tripId>/')`。**漏洩防護**：公開 itinerary 路由不回傳 attachments（比照 confirmationCode）。UI：[ReceiptAttachments.tsx](../src/components/trips/detail/ReceiptAttachments.tsx) 抽出通用 `AttachmentThumb` / `AttachmentUploader`（吃 `getUrl` + `createUploadUrl` 回呼），收據 / 票券各為薄包裝；票券上傳器接進 [ActivityListEditor](../src/components/trips/detail/itinerary/ActivityListEditor.tsx) 每列、縮圖顯示於 [ItineraryDayCard](../src/components/trips/detail/itinerary/ItineraryDayCard.tsx)。
> ② **統計按天聚合**：[computeTripStats](../src/lib/tripStats.ts) 用 Phase 2 的 `Expense.itineraryDay` 連結加出 `dailySpend`（每行程日 total/count，依 dayNumber 升冪，未關聯支出歸入最後的 null 桶；完全無行程日時為空陣列，前端不渲染卡片）+ 單元測試。[getTripStats](../src/actions/stats.actions.ts) 與公開 stats 路由多載一次行程日（共用 [toTripStatsInputs](../src/lib/dto.ts) mapper），UI 新增 [DailySpendCard](../src/components/stats/DailySpendCard.tsx) 與付款排行並排。
> ③ **地圖按天聚合**：[getVisitedPlaces](../src/actions/map.actions.ts) 加 `weightBy: 'visits' | 'spend'`——'spend' 時以 `$lookup` 關聯支出、加總金額作為熱點權重。地圖熱點模式加「造訪次數 / 花費」切換（[TripMapView](../src/components/map/TripMapView.tsx)）；**花費權重恆為登入限定**（公開地圖去識別化契約不外洩金額），且城市數 / 國家點亮仍以造訪次數集為準，不受切換影響。

### 7. ✅ 🔹 打包清單 / 待辦 (Packing & checklist) — S〔已完成 2026-06-26〕
**為什麼**：低成本、高頻使用的旅行小工具，黏著度高。

> **已實作**：採**獨立 [Checklist](../src/models/Checklist.ts) 集合**（非草圖的 `Trip.checklists` 內嵌）——比照 [ItineraryDay](../src/models/ItineraryDay.ts) 為旅程子集合，避免每次載入 Trip 都帶清單、也避免勾選一個項目就改寫整份 Trip；清單項目 `items[]` 仍內嵌（數量有界、整批編輯，同 `Expense.splits`）。權限採**成員信任模型**（任何成員可建立/編輯/勾選/刪除，同 expense/payment），而非行程那種 admin-only——清單本質是協作。7 個 action（[checklist.actions.ts](../src/actions/checklist.actions.ts)：清單 CRUD + 項目 add/update/remove，項目更新以 `arrayFilters` 定位、避免改寫整個陣列）+ [公開唯讀分享路由](../src/app/api/public/trips/%5Bid%5D/checklists/route.ts) + [useChecklists / useChecklistMutations](../src/hooks/queries/)（共用 `toChecklistDto` mapper）。可**指派項目給成員**（assignee）；資料完整性：`deleteTrip` cascade、`removeMember` 時清掉該成員的 item 指派（避免孤兒參照）。UI：旅程詳情頁新增「清單」入口 + 獨立子頁，清單卡含進度條、勾選、指派下拉、即時新增/刪除。**清單範本複用尚未做。**

---

## Tier 3 — 協作與社交（多人旅行的黏著度）

### 8. ✅ ⭐ 活動紀錄 / 動態牆 (Activity feed) — M〔已完成 2026-06-28〕
**為什麼**：多人共編時「誰改了什麼」目前不可見。也是稽核基礎。

> **已實作**：新 collection [ActivityLog](../src/models/ActivityLog.ts)＝`{ trip, actor, actorName, type, meta }`（timestamps 只 createdAt）。與 #9 通知的**對照取捨**：通知是 **per-user fan-out 收件匣**，動態牆是 **per-trip 單筆共享**——一個事件存一筆、全體成員共看同一份時間軸、走 getTripMembership 授權（非個人收件匣）；且**包含觸發者本人**（「誰改了什麼」當然含你自己，通知才排除自己）。`actorName` 去正規化（事件當下快照、讀取免 populate），`meta` 為型別相依結構化資料、文案在前端依**檢視者語系**即時組出（i18n `activity` 命名空間）。寫入工具 [lib/activity.ts](../src/lib/activity.ts) `logActivity()`＝**best-effort**（失敗只記 log、不 throw 進主 action，比照 notify / R2 清理）。**五個觸發點**：`createExpense`(expense_added)、`updateExpense`(expense_updated)、`deleteExpense`(expense_deleted)、`recordPayment`(payment_recorded)、`joinTrip`(member_joined)——前三者是 #9 沒有的「誰改了什麼」稽核值（與 #9 共用的三點之外再擴 update/delete）。Action [getActivityLog](../src/actions/activity.actions.ts)（成員可檢視全團、上限 50 筆、不分頁），共用 [toActivityLogDto](../src/lib/dto.ts) mapper。**型別命名**：行程子系統已有不同概念的 `ActivityType`/`Activity`（景點/餐飲…），故動態牆型別一律 `ActivityLog*` 避免衝突。**資料完整性**：`deleteTrip` cascade `ActivityLog.deleteMany`；`removeMember` 刻意**不清**動態牆（稽核性質、actorName 已快照故顯示無虞）。UI：獨立子頁 [/trips/[id]/activity](../src/app/%5Blocale%5D/trips/%5Bid%5D/activity/page.tsx)（比照 settlement/stats）+ [ActivityFeed](../src/components/activity/ActivityFeed.tsx) 時間軸 + 旅程詳情頁導覽按鈕；相對時間格式化抽出共用 [lib/relativeTime.ts](../src/lib/relativeTime.ts)（鈴鐺與動態牆共用）。React Query 掛 `tripKeys.activity`，支出/還款 mutation 一併 invalidate。四語系 + dto 測試。

### 9. ⭐ 通知 (Notifications) — L（需基礎設施）〔Phase 1 站內通知 ✅ ・ Phase 2a Email ✅ ・ Phase 2b 排程結算提醒 ✅（皆 2026-06-28）；Web Push 待做〕
**為什麼**：「有人新增支出」「該還錢了」「行程更新」需要被動推送。

> **已實作（Phase 1 — 站內通知）**：新 collection [Notification](../src/models/Notification.ts)＝`{ user(收件者), trip, tripName, type, actor, actorName, meta, read }`——**per-user 收件匣**（跨旅程的個人視角，比照 getStats，不走 getTripMembership），**去正規化顯示欄位**（tripName/actorName 為事件當下快照、讀取免 populate）+ `meta` 為型別相依結構化資料；additive 無遷移。fan-out 寫入工具 [lib/notify.ts](../src/lib/notify.ts) `notify()`＝**best-effort**（失敗只記 log、絕不 throw 進主 action，比照 R2 清理取捨）；純函式 `selectNotificationRecipients`（排除觸發者本人/虛擬成員/去重）抽出 + 8 個單元測試。三個觸發點：`createExpense`（`expense_added` → 通知其他成員）、`recordPayment`（`payment_recorded` → 通知還款雙方）、`joinTrip`（`member_joined` → 通知既有成員）。Actions [notification.actions.ts](../src/actions/notification.actions.ts)：getNotifications / getUnreadNotificationCount / markNotificationRead / markAllNotificationsRead（皆限定 `user: session.userId`，無法讀寫他人通知）。**訊息文案在前端依收件者語系即時組出**（i18n `notifications` 命名空間 + meta），後端不存預先算好的字串。UI：navbar 鈴鐺 [NotificationBell](../src/components/notifications/NotificationBell.tsx)——未讀 badge（[useUnreadNotificationCount](../src/hooks/queries/useNotifications.ts) 輪詢 60s + 視窗 focus 重抓）、Popover 清單（開啟才載入）、點擊標記已讀並導向旅程/結算頁、「全部已讀」。資料完整性：`deleteTrip` cascade、`removeMember` 清該成員在此 trip 的通知。四語系。**與 #8 動態牆共用這 3 個觸發點**（未來 ActivityLog 可掛同處）。
>
> **已實作（Phase 2a — Email 基礎層）**：導入 **Resend**。env 加 optional `RESEND_API_KEY` / `RESEND_FROM` / `APP_URL` + `getResendConfig()` 延遲檢查（**比照 R2 模式**：未設定也能 boot / CI build，回 null 時整個 Email fan-out 靜默跳過）。寄信封裝 [lib/email.ts](../src/lib/email.ts) `sendEmail()`＝**best-effort 永不 throw**（比照 notify / R2 清理）。模板 [lib/emailTemplates.ts](../src/lib/emailTemplates.ts) `buildNotificationEmail()`：**站內通知靠前端依檢視者語系渲染，但 Email 由伺服端寄出**，故須在伺服端用收件者語系以 next-intl `createTranslator` 算出文案（新 `email` i18n 命名空間，四語系；後端不存預先算好的字串）——為此 `User` 新增 `notifyByEmail`（opt-out，預設開）+ `locale`（寄信語系，預設 app 預設、設定頁存檔時帶入當前 UI 語系）兩欄（additive + 讀取端 default，**無遷移**）。接進 [notify.ts](../src/lib/notify.ts)：站內通知寫入後，對 `notifyByEmail !== false` 且有信箱的收件者並行寄信（沿用既有 3 觸發點，零新觸發）。設定頁加「通知設定」卡（Email 開關、樂觀更新）+ [updateNotificationPrefs](../src/actions/auth.actions.ts) action。連結用 `APP_URL` 組絕對 URL（payment 導向結算頁、其餘導向旅程頁），HTML 模板對使用者字串做 escape。**簡化**：採全域開關（未做 per-type 偏好）；收件者 locale 靠設定頁帶入（未在註冊/登入時自動擷取）。單元測試：email 模板渲染（各 type × 語系、連結、escape）。
>
> **已實作（Phase 2b — 排程結算提醒）**：受保護的 cron route [/api/cron/settlement-reminder](../src/app/api/cron/settlement-reminder/route.ts)（GET，以 `CRON_SECRET` 驗 `Authorization: Bearer`——Vercel 觸發 cron 時自動帶；**未設定 secret 一律拒絕**，避免公開觸發）+ [vercel.json](../vercel.json) 每週一 01:00 UTC（台灣 09:00）排程。純函式聚合 [lib/settlementReminder.ts](../src/lib/settlementReminder.ts) `computeSettlementDigests`（重用 [settlement.ts](../src/lib/settlement.ts) `applyPayments` 抵銷已登記還款，把每趟未結清淨額**彙整成每位使用者跨旅程的待結清清單**；**個別軟封存**（member.archivedAt 非 null）的旅程不提醒該成員；< epsilon 視為已結清；5 個單元測試）。新模板 [buildSettlementReminderEmail](../src/lib/emailTemplates.ts)（依收件者語系列出各旅程 + 應收/應付標籤 + 結算頁連結；新 `email.settlementReminder` i18n 四語系）。route 批次撈全部 trip/expense/payment 記憶體分組計算（規模大可改游標分頁），對**真人 + 有信箱 + `notifyByEmail !== false`** 的收件者各寄一封（沿用 [email.ts](../src/lib/email.ts) best-effort + env-gated，Resend 未設定則整支跳過）；回傳 `{ usersNotified, emailsSent }` 供觀測。**簡化**：只寄 Email（未做對應站內通知類型）、提醒含應收方（非僅債務人）。
>
> **做法（Phase 3 待做）**：Web Push（VAPID + `PushSubscription` model + service worker，建議與 #5 離線優先共用 SW）。輪詢式 badge 屆時可換成 SSE / Web Push 即時推送。

### 10. 🔹 支出留言 / 旅程聊天 (Comments) — M
**為什麼**：對某筆支出有疑問時，就地討論勝過群組訊息。
**做法**：`Comment`（`{ trip, expenseId?, author, body, at }`），支出卡片展開可留言。

### 11. 🔹 頭像 + 第三方登入 (Avatar & OAuth) — M〔頭像 ✅ 2026-06-27；OAuth 未做〕
**為什麼**：個人化辨識（頭像）+ 降低註冊摩擦（OAuth）。

> **已實作（頭像）**：`User.avatarUrl`（存 R2 **公開** avatars bucket 的穩定 URL）。新增 [setAvatar / removeAvatar](../src/actions/avatar.actions.ts)（key 須屬 `avatars/<userId>/`、headObject 驗證後寫入；換/移除時 best-effort 刪舊物件），共用 #4 的上傳基礎（presigned PUT + 壓縮）。`getCurrentUser` 與 `getMembers` 帶出 `avatar_url`。UI：設定頁 [AvatarUploader](../src/components/AvatarUploader.tsx)（壓成 512px WebP 上傳）、Navbar 與成員清單顯示頭像（無則退回首字母）。頭像走**公開 bucket**（穩定 URL、免每次簽名），與收據的私有 bucket 分流。

**做法（OAuth 待做）**：Google 登入可用 Auth.js 或自建，與現有自製 JWT 並存。

### 12. 🔹 常用旅伴 (Travel companions) — S
**為什麼**：常和同一群人出遊，每次重加很煩。
**做法**：`User.companions: [userId]`，建旅程時一鍵帶入；也能快速複製上一趟的成員名單。

---

## Tier 4 — 洞察與驚喜（留存與分享傳播）

### 13. ✅ ⭐ 群組統計（非僅個人）(Group insights) — M〔已完成 2026-06-26〕
**為什麼**：[stats.actions.ts](../src/actions/stats.actions.ts) 只算「我」的分攤。團隊視角缺席：誰花最多、全團分類佔比、每日花費曲線、平均每人每日。

> **已實作**：不在跨旅程的 `getStats` 加 scope（那是個人、跨旅程視角），而是新增**單一旅程的全團**統計，比照 settlement 開獨立子頁 [/trips/[id]/stats](../src/app/%5Blocale%5D/trips/%5Bid%5D/stats/page.tsx)。計算抽成純函式 [lib/tripStats.ts](../src/lib/tripStats.ts) `computeTripStats`（9 個單元測試）：全團分類彙總（**不過濾 splits.user**、金額為整筆）、付款排行（誰出錢最多）+ 各人分攤、平均每人每日（採旅程起迄日，未設則退用支出最早～最晚日）。新增 [getTripStats](../src/actions/stats.actions.ts) action + [公開分享路由](../src/app/api/public/trips/%5Bid%5D/stats/route.ts)，共用 [dto.ts](../src/lib/dto.ts) `toTripStatsInputs` mapper。前端 [useTripStats](../src/hooks/queries/useTripQueries.ts) **重用既有 `tripKeys.stats`**（本就被支出 mutation invalidate，零額外接線）；UI 重用既有 `ExpenseHistogram` / `CategoryStats`（categoryStats 形狀與個人 StatsData 相同），另加付款排行卡。按行程日花費（`dailySpend`）已於 #6 Phase 3 補上。**逐項分帳、群組 PDF（#14）尚未做。**

### 14. 🔹 PDF 行程/結算報告 (PDF reports) — M
**為什麼**：目前只有 CSV。一份漂亮的「旅程結算單 / 行程手冊」PDF 很適合分享與報帳。
**做法**：既有 [src/lib/exporters/](../src/lib/exporters/) 已抽象化，新增 PDF exporter（`@react-pdf/renderer` 或伺服端 puppeteer）。

### 15. 🔹 年度旅行回顧 (Travel Wrapped) — M
**為什麼**：年底「我的旅行回顧」（幾國/幾城/總里程/總花費/最常吃的分類）是高傳播性的留存功能，且資料（地圖 + 支出）都已具備。
**做法**：彙整既有資料成可分享圖卡，串接既有 `mapShareCode` 公開分享機制。

### 16. 🔹 地圖強化 (Map enhancements) — S~M
**為什麼**：地圖已有三模式，但缺彙總洞察與相片情境。
**做法**：地圖疊統計（造訪 N 國 M 城）、航段**里程加總**、（連動 #4）相片釘點。多為前端聚合。**按天花費熱點權重已於 #6 Phase 3 補上。**

### 17. ✅ 🔹 支出搜尋 / 篩選 / 分頁 (Search, filter, paginate) — S〔已完成 2026-06-28〕
**為什麼**：長旅程支出一多就難找。亦呼應 [IMPROVEMENTS.md](./IMPROVEMENTS.md) 項目 G（支出無上限）。

> **已實作**：純前端篩選——抽出純函式 [lib/expenseFilters.ts](../src/lib/expenseFilters.ts) `filterExpenses` / `countActiveFilters`（`ExpenseFilters`＝關鍵字 + 分類 + 付款人 + 分帳對象 + 日期區間，AND 結合；19 個單元測試）。支出列表 [TripExpenses.tsx](../src/components/trips/detail/TripExpenses.tsx) 加搜尋框（比對描述 + 付款人、大小寫不敏感）+ 可收合的進階篩選面板（分類 / 付款人 / 分帳對象下拉 + 起迄日，含啟用條件數 badge 與「清除」、結果筆數提示）。篩選狀態收進 [useTripDetailPage](../src/hooks/useTripDetailPage.ts)（取代原本單一的 `filterMemberId`，並把舊有的「分帳對象」篩選保留為其中一維、另新增「付款人」維度）。長列表採**純前端漸進渲染**（預設 20 筆 +「顯示更多」，條件變動時重置）——**未動資料層**：依 IMPROVEMENTS G「先觀察資料量」，且詳情頁本就需全量支出算預算，故**伺服端游標分頁刻意延後**。四語系。

### 18. 🔹 自訂分類 / 標籤 (Custom tags) — S
**為什麼**：固定 7 類不夠用（簽證、保險、紀念品…）。
**做法**：`Trip.customCategories` 或自由 `Expense.tags: string[]`，統計可按 tag 聚合。

---

## 橫向基礎設施（一次投資、多項解鎖）

許多功能卡在同一批外部相依——值得一起決策（呼應 [IMPROVEMENTS.md](./IMPROVEMENTS.md) 項目 A 對 Upstash 的判斷）：

| 基礎設施 | 解鎖的功能 | 候選 |
| --- | --- | --- |
| **Blob 儲存** ✅ | #4 收據、#11 頭像、#6 票券附件（已解鎖）、#16 相片釘點 | **Cloudflare R2**（已採用，私有收據 + 公開頭像兩 bucket） |
| **即時 / 推播** | #8 動態牆即時化、#9 通知 | SSE、Pusher / Ably、Web Push |
| **Email / 排程** | #9 Email 通知 + 排程結算提醒（已解鎖）、邀請信 | **Resend**（已採用，env-gated）+ **Vercel Cron**（已採用，每週結算提醒） |
| **Redis（外部狀態）** | 公開 API 限流（IMPROVEMENTS A） | Upstash |

> 都遵守現有約定：DB 存取走 Mongoose + `dbConnect()`，業務邏輯走 server actions 回傳 `ActionResult<T>`，新使用者字串**四語系都要補**，新識別碼沿用 `hashCode` 格式（見 [hashcode.ts](../src/lib/hashcode.ts)）。

---

## 建議落地順序

```
第一波（補完核心、無新基礎設施）✅ 全數完成
  ├── 1  預算 vs 實際        ✅
  ├── 3  彈性分帳            ✅
  └── 2  結算「標記已付」     ✅（閉環核心流程）

第二波（旅行情境 + 一次性基礎設施）✅ 全數完成
  ├── 13 群組統計           ✅（純查詢層、無新基礎設施）
  ├── 4  收據照片  ┐ ✅ 導入 Cloudflare R2 blob 儲存
  ├── 11 頭像      ┘ ✅（OAuth 未做）
  └── 6  行程強化   ✅ Phase 1 活動時間軸 ・ Phase 2 支出↔行程連結 ・ Phase 3 票券附件 + 統計/地圖按天聚合

第三波（協作與留存）← 進行中
  ├── 9  通知      ✅ Phase 1 站內通知 + 鈴鐺 ・ Phase 2a Email（Resend）・ Phase 2b 排程結算提醒（Vercel Cron）　｜　Phase 3 Web Push 待做
  ├── 8  活動紀錄  ✅ 動態牆（per-trip 共享時間軸、5 觸發點、稽核基礎）
  ├── 5  離線優先（旅行殺手級體驗）
  └── 15 年度回顧（傳播）

隨手可做（S，穿插填空）
  ├── 7  清單              ✅（獨立 Checklist 集合、成員協作、可指派）
  ├── 17 搜尋 / 篩選        ✅（純前端篩選 + 漸進渲染；伺服端分頁依 IMPROVEMENTS G 延後）
  └── 12 旅伴 ・ 18 標籤 ・ 16 地圖統計
```

**下一步建議**：#9 Phase 2a（Email）與 2b（Vercel Cron 排程結算提醒）皆完成。接續可（a）做 **#9 Phase 3 Web Push**（建議與 #5 共用 service worker）；或（b）做 **#5 離線優先 PWA**（旅行殺手級體驗）或 **#15 年度回顧**（傳播）；期間可穿插 S 級填空（#12 旅伴、#16 地圖統計、#18 標籤）。

---

> 本文件為構想清單，實作前各項仍需獨立設計（schema 遷移、i18n、測試）。歡迎在此增刪、調整優先序，再逐項開票動工。
