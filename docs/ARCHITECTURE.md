# 架構說明（Architecture）

> 更新日期：2026-06-26（新增旅程預算、彈性分帳、結算「標記已付」、群組統計與打包清單）
> 對應版本：v3.4.3
> 本文件依**實際程式碼**撰寫，為架構的權威來源。改善建議請見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)；遷移過程見 [MIGRATION_MONGODB.md](./MIGRATION_MONGODB.md)。

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
| 測試 | Vitest + Testing Library + jsdom |
| 部署 | Vercel |

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
│   ├── index.ts      # 統一 re-export
│   ├── types.ts      # ActionResult<T> 與 ErrorCodes
│   └── withAuth.ts   # 認證 HOC（注入已驗證 session）
├── app/
│   ├── [locale]/     # 國際化路由頁面
│   └── api/          # exchange-rates + public（分享）API
├── components/       # 依功能分組（trips / expenses / settlement / stats / member / ui...）
├── hooks/            # useTripData / useAuth / useAsyncAction / useDialog / use-toast...
├── i18n/             # routing + config + messages（四語系）
├── lib/              # 核心邏輯：auth / permissions / settlement / validation / mongodb...
├── models/           # Mongoose models：User / Trip / Expense / Payment / ItineraryDay / Checklist
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
- 三種模式:**航線**（great-circle 弧線）、**熱點**（leaflet.heat，權重=行程日 `location` 出現次數）、**國家**（choropleth 點亮造訪國）。
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

---

## 5. 資料模型

Schema 定義在 [src/models/](../src/models/) 的 Mongoose model，index 於連線時自動建立（無 SQL migration）。原本 6 張關聯表收斂為 **6 個 collection**，用內嵌消除大部分 join 與 N+1：

```
User
Trip          ── 內嵌 members[]（取代 trip_members）
Expense       ── 內嵌 splits[]（取代 expense_splits）；trip / payer 為 ref
Payment       ── ref trip / from / to（結算還款，標記已付）
ItineraryDay  ── ref trip
Checklist     ── ref trip；內嵌 items[]（打包/待辦清單）
```

| Collection | 重點欄位 |
| --- | --- |
| `User` | `username`(uniq), `email`(uniq), `password`, `isVirtual`（虛擬成員，可不註冊參與分帳） |
| `Trip` | `hashCode`(uniq，分享用), `location`(Mixed), 日期, `budget`（`{ total, categories[] }`，基準幣 TWD，null=未設）；**`members[]`**=`{ user(ref), role(admin/member), joinedAt }`，並對 `members.user` 建 index |
| `Expense` | `trip`(ref,index), `payer`(ref), `amount`/`originalAmount`/`currency`/`exchangeRate`, `category`(enum), `date`；**`splits[]`**=`{ user(ref), shareAmount }`（前端依均分/金額/百分比/份數模式換算後寫入） |
| `Payment` | `trip`(ref,index), `from`(ref), `to`(ref), `amount`（基準幣 TWD）, `note`, `createdBy`(ref)；結算還款紀錄，`getSettlement` 以 `applyPayments` 淨額抵銷餘額 |
| `ItineraryDay` | `trip`(ref), `(trip,dayNumber)` 複合唯一索引；刪除日程後以 ordered `bulkWrite` 重新編號 |
| `Checklist` | `trip`(ref,index), `title`, `createdBy`(ref)；**`items[]`**=`{ text, done, assignee(ref,可 null) }`（打包/待辦清單，成員信任模型、可指派成員） |

> ⚠️ MongoDB 無外鍵 cascade：刪除 trip 時 `deleteTrip` 會手動一併刪除該 trip 的 expenses、payments、itinerary days 與 checklists；`removeMember` 也會檢查還款參照避免孤兒，並清掉清單項目對該成員的指派。
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
