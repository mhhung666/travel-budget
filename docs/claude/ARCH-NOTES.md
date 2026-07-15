# 子系統工作守則（非顯而易見的 gotchas）

> 讀者：要動對應子系統的 Claude 模型。**動哪節讀哪節**，不用全讀。
> 這裡只放「從程式碼看不出來的守則與理由」；系統結構描述的權威是 [docs/ARCHITECTURE.md](../ARCHITECTURE.md)。
> 來源：2026-07-04 由原 CLAUDE.md 抽出並修正（原文備份於 [archive/](archive/)）。

## Server Actions 與資料層

- 主後端是 [src/actions/](../../src/actions/) 的 Server Actions（`'use server'`），經 [src/actions/index.ts](../../src/actions/index.ts) re-export。回傳一律是 [src/actions/types.ts](../../src/actions/types.ts) 的 `ActionResult<T>`（`{ success: true, data }` | `{ success: false, error, code }`），**絕不 throw 過 action 邊界**；error `code` 取自 `ErrorCodes`，前端依 code 對 i18n 訊息。
- 碰 DB 前必須 `await dbConnect()`（[src/lib/mongodb.ts](../../src/lib/mongodb.ts)，連線快取在 `globalThis` 上，serverless 必需）；實務上多數 action 因先呼叫 `getTripMembership` 而免費取得。
- **無 RLS，授權全在應用層**：每個碰旅程資料的 action 都要 `getTripMembership(userId, tripIdOrCode)`（[src/lib/permissions.ts](../../src/lib/permissions.ts)）——一次 `Trip.findOne` 同時解析 ID + 驗成員 + 取角色。優先用它；`getTripId`/`isMember`/`isAdmin` 保留給 public API routes。
- **Mongo 無 FK cascade**：刪 trip 要手動刪其 expenses + itinerary days（見 `deleteTrip`）；models 用內嵌文件（`Trip.members[]`、`Expense.splits[]`）避免 N+1，新查詢也要維持「一次 populate、不 per-row 查」的精神。
- `/api` REST 是窄面：[src/app/api/public/](../../src/app/api/public/) **刻意無驗證**（hash_code 分享）；[src/app/api/exchange-rates/](../../src/app/api/exchange-rates/) 是匯率 proxy。

## tripIdOrCode 慣例

- 旅程識別字可為 ObjectId 字串**或** `hash_code`（`[a-z0-9]{6,10}`；新旅程 8 碼、碰撞後備 10 碼，上限 <12 使其永不與 12-byte ObjectId 混淆）。解析靠 `isValidObjectId(x)` 分流。
- 新端點要保留雙接受——**例外**：`/api/public/*` 刻意只收 hash_code（`getTripIdByHashCode`；拒收 ObjectId 是為了封掉繞過分享 capability 的路）。

## Auth

- 自製 JWT（`jose`）存 httpOnly `session` cookie；`SessionPayload.userId` 是 ObjectId **字串**。見 [src/lib/auth.ts](../../src/lib/auth.ts)；密碼 `bcryptjs`。
- action 包 `withAuth(...)`（[src/actions/withAuth.ts](../../src/actions/withAuth.ts)）注入保證有效的 session，或 `getSession()` + 早退 `UNAUTHORIZED`。
- `MONGODB_URI` 沒有 `NEXT_PUBLIC_` 前綴，永不進 client。全專案唯一的 `NEXT_PUBLIC_` env 是 VAPID public key。

## Schema 變更與遷移

- Schema 定義在 [src/models/](../../src/models/)，Mongoose `autoIndex` 連線時建索引。可重現的索引/回填走 migrate-mongo（[docs/MIGRATIONS.md](../MIGRATIONS.md)；`pnpm migrate:status|up|down|create`），與 autoIndex 並存（冪等、索引名對齊）。
- **改欄位形狀：先寫 migration 回填，不用讀端 fallback**。migration 要冪等 + 有 `down`；過渡性 fallback 須與 migration 同一 PR 移除。migration 只在被執行的環境生效——提醒使用者其他環境部署前要 `pnpm migrate:up`。

## R2 blob 儲存（收據 / 頭像 / 相簿）

- [src/lib/storage.ts](../../src/lib/storage.ts) 是 **server-only**，絕不從 client component import。純邏輯（型別白名單、大小上限、key 命名）在 [src/lib/uploads.ts](../../src/lib/uploads.ts)。
- **兩個 bucket 不能混**：私有 `receipts`（presigned PUT 上傳；讀取走成員限定的短效 presigned GET `getReceiptUrl`）、公開 `avatars`（穩定公開 URL）。收據不准進公開 bucket。
- 上傳直達 R2（presigned PUT），key 的擁有者段（`receipts/<tripId>/`、`avatars/<userId>/`）由**伺服器端**從 membership/session 決定。presigned PUT 管不住實際上傳內容，所以 persist 步驟必須用 `headObject` 重驗大小/型別——新增上傳流程要保留這步。
- **收據隱私契約**：`toExpenseDto` 的 `{ attachments }` 選項，public expenses route 傳 `false`——收據永不出現在未登入分享頁。
- `R2_*` env 全部 optional（[src/lib/env.ts](../../src/lib/env.ts)）；`getR2Config()` 惰性斷言，無 R2 也能 build/CI。
- **無儲存級聯**：刪 expense/trip/換頭像時刪 blob 都是 **best-effort**（失敗只 log，不讓使用者操作失敗）。新增會丟參照的路徑要沿用此模式。
- **相簿相片**（`photos/<tripId>/`，同私有 `receipts` bucket，ROADMAP #21 Phase 1）：每張兩顆物件、**共用一個 uuid**（`<uuid>.jpg` 顯示＋下載／`<uuid>_t.webp` 縮圖），故簽名一次簽兩張（`createPhotoUploadUrls`）——分兩次呼叫會讓 `_t`／`_p` 無法從 key 推導。**顯示檔刻意自帶 GPS EXIF**（見 [FEATURES.md](../FEATURES.md) §17），故公開路由絕不可簽它，只可簽消毒副本 `_p.jpg`（Phase 4 才產生，key 規則已定死）。
- **相簿讀取用 `presignGetStable` 而非 `presignGet`**：簽名時間戳對齊整點窗口，窗口內同 key 產生逐字元相同的 URL，否則 SW 的 CacheFirst（快取 key＝完整 URL）永遠 miss 且無限膨脹。**收據維持 `presignGet` 的 300s 短效，不要順手改**。

## 離線 PWA（Serwist + TanStack Query 持久化）

- Server Actions 是 POST RPC，離線快取不了，所以拆兩層：SW（[src/sw.ts](../../src/sw.ts) 編譯成 `public/sw.js`——**建置產物，gitignored，永不手改/lint**）快取 app shell / 靜態資源 / Leaflet 圖磚 / R2 圖片，導航 NetworkFirst 退 [public/offline.html](../../public/offline.html)；**SW 絕不快取 server-action POST 或 `/api/*` mutation**。
- 離線讀：TanStack Query cache 持久化到 IndexedDB（[QueryProvider](../../src/components/providers/QueryProvider.tsx) + [src/lib/queryPersister.ts](../../src/lib/queryPersister.ts)）。**快取形狀/key 變了要 bump `PERSIST_BUSTER`**。查詢預設 `networkMode: 'offlineFirst'`。
- 離線寫**只限新增支出**（編輯/刪除 online-only，`onlineManager.isOnline()` 擋）。樂觀插入用 `optimistic_<uuid>` id（[src/lib/optimisticExpense.ts](../../src/lib/optimisticExpense.ts)）；要撐過 reload，mutationFn 必須經 [src/lib/offlineMutations.ts](../../src/lib/offlineMutations.ts) `setMutationDefaults` 全域重註冊——序列化只存 key + variables，所以 **create-mutation 的 variables 必帶 `tripId`**。
- **建置陷阱**：Next 16 預設 Turbopack 會**靜默跳過** Serwist（沒錯誤、沒 sw.js），所以 `pnpm build` 是 `next build --webpack`，不准改回。SW 在 dev 停用——驗 PWA 用 `pnpm build && pnpm start`，不是 `pnpm dev`。

## Web Push

- 與離線共用同一個 SW（[src/sw.ts](../../src/sw.ts) 的 `push` + `notificationclick`）。env-gated：VAPID 三變數 optional，`getWebPushConfig()` 回 null → 靜默跳過。
- 發送在 [src/lib/webpush.ts](../../src/lib/webpush.ts)：`sendPush` best-effort、**自動清 404/410 死訂閱**；`buildPushPayload` 依收件者 `User.locale` 在地化（同 email 模板，用 `notifications` namespace）。接進 [notify()](../../src/lib/notify.ts) fan-out；push 永遠即時、無視 `notifyByEmail`。
- 訂閱＝opt-in（[PushSubscription](../../src/models/PushSubscription.ts)，`endpoint` unique，無 User 層 flag）。每個 push **必須** `showNotification`（`userVisibleOnly` 契約）；顯示後 SW `postMessage` 通知開著的分頁即時刷新鈴鐺（60s 輪詢是無 push 時的後備）。iOS Safari 要先安裝 PWA 才有 push——hook 的 `needsInstall` 負責引導。

## 行程空間分頁（trips/[id]）

- **`/trips/[id]` 是「行程」分頁、不是支出**（2026-07-15 重排）；支出在 `/trips/[id]/expenses`。要連到記帳畫面用 `ROUTES.TRIP_EXPENSES`，`ROUTES.TRIP_DETAIL` 只是空間落點。舊 `/trips/[id]/itinerary` 在 [next.config.ts](../../next.config.ts) `redirects()` 308 轉回落點——**頁面內 `redirect()` 在 App Router 會軟導向（回 200、網址列不變）**，別再改回去。
- 主分頁只有四顆（行程／支出／相簿／結算），隨手記＋清單是「行程」的子分頁、統計是「結算」的子分頁；分頁與子分頁**都定義在 [TripSpaceShell](../../src/components/trips/space/TripSpaceShell.tsx) 的 `tabs`**，各頁自己不畫分頁列。`TRIP_DETAIL` 是所有子路由的前綴 → 比對一律 `exact`。
- **FAB「新增支出」只在支出分頁**；但 add-expense 表單住在 shell 層，任何分頁都能 `useTripSpaceActions().openAddExpense()`（清單「記一筆」、PWA quick-add 就是這樣用）。
- 通知 / Push / Email 的導向表分散在三處（[NotificationBell](../../src/components/notifications/NotificationBell.tsx) / [webpush.ts](../../src/lib/webpush.ts) / [emailTemplates.ts](../../src/lib/emailTemplates.ts)），**改一處要三處一起改**（有測試守著）：支出語意 → `/expenses`、還款 → `/settlement`、其餘 → 落點。
- 全貌與路由表見 [docs/ARCHITECTURE.md](../ARCHITECTURE.md) §4.14。

## 旅遊地圖與分享

- 頁面在 `src/app/(app)/map/`（登入版）與 `src/app/(share)/map/`（公開分享版），元件在 [src/components/map/](../../src/components/map/)。
- **Leaflet 只能 client**：畫布一律 `dynamic(..., { ssr: false })`；[globals.css](../../src/app/globals.css) 的 `.leaflet-container { isolation: isolate; }` 不能拿掉（Leaflet z-index 200–1000 會蓋住 dialog/dropdown）。
- `User.mapShareCode` 是 trip `hash_code` 的使用者層級對應（opt-in、sparse-unique、同格式驗證）；`/map/share/*` 是公開頁（不在 `proxy.ts` protectedRoutes）。
- **公開地圖 API 去識別化契約**（[/api/public/map/[code]](../../src/app/api/public/map/%5Bcode%5D/route.ts)）：只露座標、在地化地名、**年份**（年份是刻意例外，供篩選）——絕不露旅程名稱、id、完整日期。熱點彙整到四捨五入座標。照片模式（相簿相片依 EXIF GPS 精確釘點，退關聯行程日座標，ROADMAP #21 Phase 3 起）**恆為登入限定**，`url`／`thumb_url` 由 `presignGetStable` 批次簽發，永不進公開分享。（舊的收據衍生照片模式已於 Phase 3 退役。）
- `public/geo/countries.geojson` 是**生成資產**（Natural Earth 110m 裁剪），不手改；要更新從 `nvkelso/natural-earth-vector` 重新生成。

## 國際化

- next-intl「without i18n routing」：**URL 無語系前綴、無 `[locale]` 路由段**，頁面直接在 [src/app/](../../src/app/) 下。語系：`en`/`zh`/`zh-CN`/`jp`，預設 `zh`。
- UI 語系由伺服器端讀 `NEXT_LOCALE` **cookie**（[src/i18n/config.ts](../../src/i18n/config.ts)；cookie 而非 localStorage，SSR 首繪才正確）。無 i18n middleware——[src/proxy.ts](../../src/proxy.ts) 只做 auth redirect。[src/i18n/navigation.ts](../../src/i18n/navigation.ts) 是薄 shim（re-export next/link、next/navigation），留著避免 import 大改。
- 切語言走 [setLocale](../../src/actions/locale.actions.ts) server action（寫 cookie + `router.refresh()`）。
- **新增使用者可見字串 = 四份 catalog 全加**（[src/i18n/messages/](../../src/i18n/messages/)）。
- `User.locale`（Mongo）≠ UI cookie：它是 Email/Web Push 背景發送的語系（背景讀不到 cookie），`setLocale` 會同步；留在 Mongo。

## 結算

- [src/lib/settlement.ts](../../src/lib/settlement.ts) 貪心配對最小化轉帳數；浮點比較用 `0.01` epsilon。改它必跑 [settlement.test.ts](../../src/__tests__/settlement.test.ts)。還款閉環（`applyPayments`、Payment model）見 [docs/ARCHITECTURE.md](../ARCHITECTURE.md) §4.3。
