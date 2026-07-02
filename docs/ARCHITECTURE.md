# 架構說明（Architecture）

> 更新日期：2026-06-29（補上通知 / Email / 排程 / Web Push、離線優先 PWA、動態牆、年度回顧）
> 對應版本：v3.4.3
> 本文件依**實際程式碼**撰寫，為架構的權威來源。**已實作功能的完整盤點**見 [FEATURES.md](./FEATURES.md)；改善建議請見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)；已完成工作（含 Supabase→MongoDB 遷移）的紀錄見 [CHANGELOG.md](./CHANGELOG.md)。

---

## 1. 技術棧總覽

| 層級 | 技術 |
| --- | --- |
| 前端框架 | Next.js 16（App Router）+ React 19 |
| 語言 | TypeScript（`strict: true`） |
| UI | Shadcn UI（Radix）+ Tailwind CSS + `next-themes`（深色模式） |
| 圖表 | Recharts |
| 國際化 | next-intl（`en` / `zh` / `zh-CN` / `jp`，預設 `zh`） |
| 資料庫 | MongoDB，透過 Mongoose ODM（連線在 `src/lib/mongodb.ts`） |
| 認證 | 自製 JWT（`jose`）+ httpOnly Cookie；密碼以 `bcryptjs` 雜湊 |
| 驗證 | Zod |
| 檔案儲存 | Cloudflare R2（S3 相容，`@aws-sdk/client-s3`）——收據 / 票券（私有）+ 頭像（公開） |
| 通知 | 站內（MongoDB 收件匣）+ Email（Resend）+ 排程（Vercel Cron）+ Web Push（VAPID `web-push`） |
| 離線 / PWA | Serwist（`@serwist/next`）service worker + TanStack Query 持久化（`idb-keyval`） |
| 資料查詢層 | TanStack React Query（查詢 / 失效 / 離線持久化） |
| 測試 | Vitest + Testing Library + jsdom（純函式邏輯，約 300 個 test case） |
| 部署 | Vercel（`next build --webpack`，見 §4.13 PWA 構建注意） |

---

## 2. 整體分層

本專案的後端主體是 **Server Actions**，而非傳統 REST API。資料流如下：

```
使用者操作（Client Component）
        │  直接呼叫
        ▼
Server Action（src/actions/*.ts，'use server'）
        │  ① getSession() 驗證登入
        │  ② getTripMembership() 驗證旅程權限
        ▼
Mongoose Models（src/models/）＋ dbConnect()（src/lib/mongodb.ts，全域快取連線）
        ▼
MongoDB
        │
        ▼  回傳
ActionResult<T>  ── { success:true, data } | { success:false, error, code }
```

### 兩條對外資料路徑

| 路徑 | 位置 | 認證 | 用途 |
| --- | --- | --- | --- |
| **Server Actions** | [src/actions/](../src/actions/) | 需登入 | App 主要資料存取，回傳 `ActionResult<T>` |
| **Public REST API** | [src/app/api/public/](../src/app/api/public/) | **無認證（刻意）** | 分享連結：未登入者用 `hash_code` 唯讀檢視旅程 |
| Exchange Rate API | [src/app/api/exchange-rates/](../src/app/api/exchange-rates/) | 無 | 匯率代理 |

> 同一個旅程頁面會依「是否登入」決定走哪條路徑：登入走 Server Action，未登入（或非成員）fallback 到 public API。此邏輯封裝在 [src/hooks/useTripData.ts](../src/hooks/useTripData.ts)。

---

## 3. 目錄結構

```
src/
├── actions/          # Server Actions（業務邏輯層）⭐
│   ├── auth / trip / expense / member / settlement / stats / itinerary
│   ├── budget / payment / checklist / activity / notification / push
│   ├── avatar / upload / map / mapShare / wrapped
│   ├── index.ts      # 統一 re-export
│   ├── types.ts      # ActionResult<T> 與 ErrorCodes
│   └── withAuth.ts   # 認證 HOC（注入已驗證 session）
├── app/
│   ├── [locale]/     # 國際化路由頁面（trips / stats / map / wrapped / settings...）
│   └── api/          # exchange-rates + public（分享）API + cron（排程）
├── components/       # 依功能分組（trips / expenses / settlement / stats / map / activity / notifications / wrapped / ui...）
├── hooks/            # useTripDetailPage / useAuth / useOnlineStatus / usePushNotifications...
│   └── queries/      # React Query 查詢 / 失效層（keys / fetcher + 各 use*Mutations）
├── i18n/             # routing + config + messages（四語系）
├── lib/              # 核心邏輯：auth / permissions / settlement / validation / mongodb /
│                     #   storage / uploads / notify / email / webpush / queryPersister...
├── models/           # Mongoose models（10 個，見 §5）
├── sw.ts             # Serwist service worker 源碼（離線快取 + Web Push handler）
├── constants/        # categories / countries / currencies / routes
└── types/            # models(DTO) / api(dto) / common
```

---

## 4. 核心子系統

### 4.1 認證（[src/lib/auth.ts](../src/lib/auth.ts)）
- 登入成功後簽發 JWT（HS256，7 天效期），存於 httpOnly、`sameSite=lax` 的 `session` cookie。
- `getSession()` 於 Server Action 解析 cookie；`getSessionFromRequest()` 供 API route 使用。
- 密碼以 `bcryptjs` 雜湊後存於 `users.password`。
- **JWT_SECRET 未設定時會 fallback 到硬編碼預設值**（見改善建議 P0）。
- **變更 Email 須寄碼驗證**：`requestEmailChange` 把 6 位數碼寄到使用者填的**新信箱**（先擋掉與現用相同 / 已被他人占用），`confirmEmailChange` 驗碼通過（套用前再查一次競態）才更新 `User.email`；待驗證狀態（含 `newEmail`）存於 [EmailChangeCode](../src/models/EmailChangeCode.ts)，與重設密碼共用驗證碼基礎（6 位數 / 15 分鐘 / 5 次嘗試上限 / 只存 sha256 雜湊 / TTL 自動清除）。`updateProfile` 不再直接改 email。

### 4.2 權限（[src/lib/permissions.ts](../src/lib/permissions.ts)）
- 權限層級僅 `admin` / `member`（存於內嵌的 `Trip.members[].role`）。
- **`getTripMembership(userId, tripIdOrCode)`** 是首選：一次 `Trip.findOne` 同時「解析旅程 ID + 驗證成員身分 + 取得角色」（members 已內嵌）。
- 舊版 `getTripId` / `isMember` / `isAdmin` / `requireAdmin` 仍保留供 public API route 使用。
- **`tripIdOrCode` 慣例**：旅程識別字可以是 ObjectId 字串或公開的 `hash_code`（`[a-z0-9]{6,8}`），靠 `isValidObjectId()` 分流（24 碼 hex vs 短 hash，無歧義）。

### 4.3 結算演算法（[src/lib/settlement.ts](../src/lib/settlement.ts)）
- 貪心法：將債權人（balance > 0）與債務人（balance < 0）各自排序後配對，**最小化轉帳次數**。
- 使用 `0.01` epsilon 處理浮點誤差；金額四捨五入到小數點兩位。
- 已有測試覆蓋（[settlement.test.ts](../src/__tests__/settlement.test.ts)）。
- 同屬「純函式 + 單元測試」的計算邏輯還有 [lib/budget.ts](../src/lib/budget.ts)（`computeBudgetProgress`：預算 vs 實際，於旅程頁前端即時計算，免後端往返）、[lib/expenseSplit.ts](../src/lib/expenseSplit.ts)（`computeSplits`：均分/金額/百分比/份數四種分帳，於支出表單換算成 `splits` 的 TWD 金額；後端 `createExpense`/`updateExpense` 另有寬鬆的總和防呆）與 [lib/tripStats.ts](../src/lib/tripStats.ts)（`computeTripStats`：全團群組統計，見 §4.7）。
- **結算閉環「標記已付」**：[Payment](../src/models/Payment.ts) model 記錄實際還款（`{ from, to, amount }`，基準幣 TWD）。純函式 `applyPayments`（同 [settlement.ts](../src/lib/settlement.ts)）把還款淨額抵銷進「以支出算出的餘額」（只調整 `balance`，保留 totalPaid/totalOwed 供顯示），再交給 `calculateSettlement`。`getSettlement` 與[公開分享路由](../src/app/api/public/trips/%5Bid%5D/settlement/route.ts)都載入並回傳還款（共用 `toPaymentRecord` mapper）；登記/刪除走 [recordPayment / deletePayment](../src/actions/payment.actions.ts)，任何成員皆可（同 `deleteExpense` 信任模型）。

### 4.4 多幣別與匯率
- 支出存 `original_amount`/`currency`/`exchange_rate`，並換算為基準貨幣（TWD）存於 `amount`。
- 匯率經 [src/app/api/exchange-rates/](../src/app/api/exchange-rates/) 取得。

### 4.5 國際化
- next-intl，`localePrefix: 'as-needed'`（預設語系無前綴）。
- 路由經 `[locale]` 區段；訊息檔在 [src/i18n/messages/](../src/i18n/messages/)，共 `en` / `zh` / `zh-CN` / `jp` 四個。
- Server Action 錯誤回傳 **error code**（非寫死文字），前端依 code 對應 i18n 訊息。

### 4.6 旅遊地圖與分享（[src/components/map/](../src/components/map/)）
- 三種模式:**航線**（great-circle 弧線）、**熱點**（leaflet.heat，權重=造訪次數 **或** 花費——`getVisitedPlaces` 的 `weightBy`，花費權重以 `$lookup` 關聯支出且**恆為登入限定**）、**國家**（choropleth 點亮造訪國）。
- Leaflet 依賴 `window`,畫布一律以 `dynamic(..., { ssr: false })` 載入;並在 [globals.css](../src/app/globals.css) 保留 `.leaflet-container { isolation: isolate; }`,否則其 pane/control 的高 z-index 會蓋住 dialog/dropdown。
- **分享為使用者層級**:`User.mapShareCode`（opt-in、sparse-unique）是 trip `hashCode` 的對應物,格式/驗證相同。`/map/share/*` 為公開頁(不在 `proxy.ts` 的 `protectedRoutes`)。
- **公開 API [/api/public/map/[code]](../src/app/api/public/map/%5Bcode%5D/route.ts) 依約去識別化**:只露座標、在地化地名與**年份**,絕不露旅行名稱、id 或完整日期(年份是為了年份篩選的刻意例外)。熱點彙整到四捨五入座標,避免回推單日行程。
- **`public/geo/countries.geojson` 是產生的資產,勿手改**:Natural Earth 110m admin-0 瘦身版(屬性只留 `iso_a2` + 多語名、座標降到小數兩位),需更新國界/國名時自 `nvkelso/natural-earth-vector` 重新產生。只在國家模式才抓並做模組層級快取。

### 4.7 統計：個人 vs 群組
- **個人（跨旅程）**：`/stats` 頁，[getStats](../src/actions/stats.actions.ts) 彙總「我」在所有旅程的**分攤**（過濾 `splits.user = 我`），可依日期區間篩選。
- **群組（單一旅程、全團）**：`/trips/[id]/stats` 子頁，[getTripStats](../src/actions/stats.actions.ts) **不過濾** `splits.user`、金額取整筆，回傳分類彙總 + 付款排行（誰出錢最多）+ 各人分攤 + 平均每人每日。純計算在 [lib/tripStats.ts](../src/lib/tripStats.ts) `computeTripStats`；有[公開分享路由](../src/app/api/public/trips/%5Bid%5D/stats/route.ts)。
- 兩者 `categoryStats` 形狀相同，故 `ExpenseHistogram` / `CategoryStats` 元件兩邊共用。群組查詢重用 `tripKeys.stats`（已被支出 mutation invalidate）。

### 4.8 打包清單 / 待辦
- `/trips/[id]/checklists` 子頁，採**獨立 [Checklist](../src/models/Checklist.ts) 集合**（非內嵌在 Trip）：比照 `ItineraryDay` 為旅程子集合，避免每次載入 Trip 都帶清單、也避免勾選一個項目就改寫整份 Trip；清單項目 `items[]` 仍內嵌（數量有界、整批編輯，同 `Expense.splits`）。
- 權限採**成員信任模型**（任何成員可建立/編輯/勾選/刪除，同 expense/payment），非行程那種 admin-only——清單本質是協作工具。7 個 action（[checklist.actions.ts](../src/actions/checklist.actions.ts)：清單 CRUD + 項目 add/update/remove，項目更新以 `arrayFilters` 定位、避免改寫整個陣列），共用 `toChecklistDto` mapper，有[公開唯讀分享路由](../src/app/api/public/trips/%5Bid%5D/checklists/route.ts)。
- 項目可指派給成員（`assignee`）；成員被移除時 `removeMember` 會清掉其 item 指派（避免孤兒參照）。

### 4.9 Blob 儲存 / 上傳（Cloudflare R2）
- 收據（#4）與頭像（#11）的檔案存於 **Cloudflare R2**（S3 相容、無流量出口費）。[lib/storage.ts](../src/lib/storage.ts) 為 **server-only** 的 R2 client 包裝（`presignPut` / `presignGet` / `headObject` / `deleteObjects` / `deleteByPrefix` / `avatarPublicUrl`）；純邏輯（content-type 白名單、大小上限、key 命名空間）抽在 [lib/uploads.ts](../src/lib/uploads.ts)（可單元測試、client-safe）。
- **兩個 bucket**：私有 `receipts`（上傳走 presigned PUT、檢視走成員驗證後的短效 presigned GET）＋ 公開 `avatars`（上傳走 presigned PUT、對外以穩定公開 URL 顯示，免每次簽名）。
- **上傳流程**：瀏覽器先用 [lib/imageCompress.ts](../src/lib/imageCompress.ts) 壓成 WebP → 向 server action（`createReceiptUploadUrl` / `createAvatarUploadUrl`）要 presigned PUT → **直傳 R2**（大檔不過 server action）→ 回存參照（收據併入 `createExpense`/`updateExpense`，頭像走 `setAvatar`）。**owner 段（`receipts/<tripId>/`、`avatars/<userId>/`）由伺服器帶入**、client 無法指定，防跨 trip/user 寫入；存參照前以 **`headObject`** 重新驗證大小/型別（presigned PUT 無法限制 client 真正送出的內容）。
- **隱私**：收據為私有，`toExpenseDto` 的 `{ attachments }` 選項對**公開分享路由關閉**（收據不外洩到未登入分享頁）；頭像為低敏感、走公開 bucket。
- **環境變數**：六個 `R2_*` 在 [lib/env.ts](../src/lib/env.ts) 設為 **optional**，`getR2Config()` 於實際用到時才嚴格檢查 → 未設定 R2 也能 boot / CI build。
- **清理（無 cascade）**：`deleteExpense` / `deleteTrip` 刪收據物件、`setAvatar` / `removeAvatar` 刪舊頭像，皆 **best-effort**（刪不掉的孤兒不擋住使用者操作，只記 log）。

> 完整附件 / 上傳細節（票券附件 `itinerary/` 命名空間、通用 UI 元件）見 [FEATURES.md §7](./FEATURES.md)。

### 4.10 通知系統（站內 / Email / 排程 / Web Push）

四種通道共用同一套 fan-out（[lib/notify.ts](../src/lib/notify.ts) `notify()`，**best-effort 永不 throw 進主 action**）與三個觸發點（`createExpense` / `recordPayment` / `joinTrip`）。所有對外文案皆**依收件者語系在伺服端 / 前端在地化**（不存預先算好的字串）。

- **站內**（[Notification](../src/models/Notification.ts) model）：per-user 收件匣 + navbar 鈴鐺未讀數（去正規化 tripName/actorName，讀取免 populate）。純函式 `selectNotificationRecipients`（排除觸發者 / 虛擬成員 / 去重）有單元測試。
- **Email**（Resend，env-gated）：[lib/email.ts](../src/lib/email.ts) `sendEmail()` best-effort；模板 [lib/emailTemplates.ts](../src/lib/emailTemplates.ts) 以 next-intl `createTranslator` 用收件者 `User.locale` 算文案。`expense_added` 改**每日彙整**（站內仍即時），`recordPayment` / `joinTrip` 即時。
- **提醒還款（手動）**：結算頁的被欠款者可按「提醒還款」，[remindPayment](../src/actions/payment.actions.ts) action 伺服端重算結算確認對方確有欠款後，即時寄出提醒 Email（取代原本的每週結算提醒 cron）。
- **排程**（Vercel Cron，受 `CRON_SECRET` 保護）：[/api/cron/expense-digest](../src/app/api/cron/expense-digest/route.ts)（每日）。聚合純函式 [lib/expenseDigest.ts](../src/lib/expenseDigest.ts) 有單元測試。
- **Web Push**（VAPID，env-gated）：[PushSubscription](../src/models/PushSubscription.ts) model（**訂閱本身即 opt-in**）。[lib/webpush.ts](../src/lib/webpush.ts) `sendPush` best-effort、回 404/410 就地刪失效訂閱。**與離線 PWA 共用同一個 service worker**（§4.12）。推播一律即時、不看 `notifyByEmail`。

> 全部 env（`RESEND_*` / `CRON_SECRET` / `VAPID_*`）皆 optional，比照 R2 模式——未設定則該通道靜默跳過，不影響其他通道與 CI build。詳見 [FEATURES.md §8](./FEATURES.md)。

### 4.11 動態牆（活動紀錄）

[ActivityLog](../src/models/ActivityLog.ts) model = `{ trip, actor, actorName, type, meta }`。**與通知的取捨**：通知是 per-user fan-out 收件匣；動態牆是 **per-trip 單筆共享**（一個事件存一筆、全體共看、走 `getTripMembership` 授權、**包含觸發者本人**）。五個觸發點（expense add/update/delete + payment_recorded + member_joined）比通知多了「誰改了什麼」的稽核值。寫入 [lib/activity.ts](../src/lib/activity.ts) `logActivity()` best-effort。`deleteTrip` cascade；`removeMember` 刻意不清（稽核性質、actorName 已快照）。

### 4.12 離線優先 PWA（Serwist + React Query 持久化）

因讀寫都走 Server Actions（POST RPC，**離線無法執行也無法被 SW 正常快取**），離線支援拆兩層：

- **Service worker**（[src/sw.ts](../src/sw.ts) → 建置產出 `public/sw.js`，gitignore）：`defaultCache` + Leaflet 圖磚 / R2 圖片 CacheFirst、導覽 NetworkFirst、靜態 [offline.html](../public/offline.html) fallback；**明確不快取 server-action POST / `/api/*` 變更**。同時承載 §4.10 Web Push 的 `push` / `notificationclick` handler。
- **離線讀取**：TanStack Query 快取持久化到 IndexedDB（[lib/queryPersister.ts](../src/lib/queryPersister.ts) + [QueryProvider](../src/components/providers/QueryProvider.tsx)，query defaults `networkMode:'offlineFirst'`，`PERSIST_BUSTER` 版本碼）。
- **離線寫入**（僅支出建立，編輯 / 刪除維持線上限定）：樂觀 UI（[lib/optimisticExpense.ts](../src/lib/optimisticExpense.ts)）+ 暫停 mutation 佇列重放（[lib/offlineMutations.ts](../src/lib/offlineMutations.ts) `setMutationDefaults` 全域重註冊 `mutationFn`，故 reload 後仍能重放；create mutation **變數須帶 `tripId`**）。

> **構建注意**：Serwist 用 webpack plugin，Next 16 預設 Turbopack **不會觸發它**（不產 `sw.js`）→ `build` script 為 `next build --webpack`，**勿改回**。SW 在 dev 停用，PWA 測試走 `pnpm build && pnpm start`。

### 4.13 年度回顧（Travel Wrapped）

純彙整、**無新 model**。純函式 [lib/yearInReview.ts](../src/lib/yearInReview.ts) `computeYearInReview`（地理 / 花費兩種年份口徑，12 個單元測試）+ [getYearInReview](../src/actions/wrapped.actions.ts)。UI 圖卡以 html-to-image 匯出 PNG。**分享串接既有 `mapShareCode`**，公開路由 [/api/public/wrapped/[code]/[year]](../src/app/api/public/wrapped/%5Bcode%5D/%5Byear%5D/route.ts) **只露地理 + 年份、不含金額**（守住 mapShareCode 去識別化契約）。

---

## 5. 資料模型

Schema 定義在 [src/models/](../src/models/) 的 Mongoose model，index 於連線時自動建立（`autoIndex`；可重現的結構 / 資料變更另走 migrate-mongo，見 [MIGRATIONS.md](./MIGRATIONS.md)）。原本的關聯表收斂為 **11 個 collection**，用內嵌消除大部分 join 與 N+1：

```
User              ── 帳號 / 虛擬成員 / 頭像 / 通知偏好 / mapShareCode
PasswordResetCode ── 重設密碼驗證碼
EmailChangeCode   ── 變更 Email 的新信箱驗證碼（含 newEmail）
Trip              ── 內嵌 members[]（取代 trip_members）；budget
Expense           ── 內嵌 splits[] + attachments[]；trip / payer / itineraryDay 為 ref
Payment           ── ref trip / from / to（結算還款，標記已付）
ItineraryDay      ── ref trip；內嵌 activities[]（含票券 attachments[]）
Checklist         ── ref trip；內嵌 items[]（打包 / 待辦清單）
Notification      ── ref user（收件者）；per-user 通知收件匣
ActivityLog       ── ref trip；per-trip 共享動態牆
PushSubscription  ── ref user；Web Push 訂閱（endpoint uniq）
```

| Collection | 重點欄位 |
| --- | --- |
| `User` | `username`(uniq), `email`(uniq), `password`, `isVirtual`（虛擬成員，可不註冊參與分帳）, `avatarUrl`（R2 公開頭像 URL）, `notifyByEmail`（Email opt-out，預設開）, `locale`（寄信語系）, `mapShareCode`（sparse-uniq，公開地圖 / 回顧分享碼） |
| `PasswordResetCode` | 重設密碼用的一次性驗證碼 |
| `EmailChangeCode` | 變更 Email 用的一次性驗證碼（`user`(uniq), `newEmail`, `codeHash`, `expiresAt`(TTL), `attempts`） |
| `Trip` | `hashCode`(uniq，分享用), `location`(Mixed), 日期, `budget`（`{ total, categories[] }`，基準幣 TWD，null=未設）；**`members[]`**=`{ user(ref), role(admin/member), joinedAt, archivedAt? }`，並對 `members.user` 建 index |
| `Expense` | `trip`(ref,index), `payer`(ref), `createdBy`(ref，≠payer，供摘要排除自己), `itineraryDay`(ref,可 null), `amount`/`originalAmount`/`currency`/`exchangeRate`, `category`(enum), `date`；**`splits[]`**=`{ user(ref), shareAmount }`；**`attachments[]`**=`{ key, contentType, size, uploadedBy(ref), uploadedAt }`（R2 物件 key，不存 url） |
| `Payment` | `trip`(ref,index), `from`(ref), `to`(ref), `amount`（基準幣 TWD）, `note`, `createdBy`(ref)；結算還款紀錄，`getSettlement` 以 `applyPayments` 淨額抵銷餘額 |
| `ItineraryDay` | `trip`(ref), `(trip,dayNumber)` 複合唯一索引；**`activities[]`**=`{ time?, endTime?, title, type, location?, note?, confirmationCode?, attachments[] }`；刪除日程後以 ordered `bulkWrite` 重新編號 |
| `Checklist` | `trip`(ref,index), `title`, `createdBy`(ref)；**`items[]`**=`{ text, done, assignee(ref,可 null) }`（成員信任模型、可指派成員） |
| `Notification` | `user`(收件者,ref,index), `trip`, `tripName`/`actorName`（去正規化快照）, `type`, `actor`, `meta`, `read`；per-user 收件匣 |
| `ActivityLog` | `trip`(ref,index), `actor`, `actorName`（快照）, `type`, `meta`；per-trip 共享動態牆（只 createdAt） |
| `PushSubscription` | `user`(ref), `endpoint`(uniq), `keys`, `userAgent`；Web Push 訂閱（訂閱本身即 opt-in） |

> ⚠️ MongoDB 無外鍵 cascade：刪除 trip 時 `deleteTrip` 會手動一併刪除該 trip 的 expenses、payments、itinerary days、checklists、notifications、activity logs，並 best-effort 刪除該 trip 在 R2 的收據 / 票券物件；`removeMember` 也會檢查還款參照避免孤兒，並清掉清單項目對該成員的指派與其在此 trip 的通知。
> ID 一律為 ObjectId 字串，從 JWT、DTO 到前端 props 一致。

---

## 6. 關鍵慣例（給開發者）

1. **不要在 Server Action 邊界丟出例外**——一律轉成 `ActionResult<T>`。
2. **所有授權都在應用層**：MongoDB 無 RLS，每個碰旅程資料的 action 都必須自行驗證成員身分（用 `getTripMembership`）。
3. **存取 DB 前先 `await dbConnect()`**；多數 action 因 `getTripMembership` 內部已連線而免費取得。
4. **`/api/public/*` 刻意不做登入檢查**，請勿「修正」。
5. **`tripIdOrCode` 雙重接受** ObjectId 字串或 hash_code，新端點請延續（`isValidObjectId` 分流）。
6. **善用內嵌避免 N+1**：splits/members 已內嵌，用一次 `populate` 取代逐筆查詢。
7. **刪除有關聯的文件要手動 cascade**（無外鍵），例如刪 trip 要連帶刪 expenses/itinerary。
8. 路由字串用 [src/constants/routes.ts](../src/constants/routes.ts) 的 builder，勿硬編碼。
9. 新增使用者可見字串時，**四個語系訊息檔都要補**。
