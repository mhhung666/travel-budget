# 架構說明（Architecture）

> 更新日期：2026-06-16
> 對應版本：v3.4.3
> 本文件依**實際程式碼**撰寫，為架構的權威來源。改善建議請見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)。

---

## 1. 技術棧總覽

| 層級 | 技術 |
| --- | --- |
| 前端框架 | Next.js 16（App Router）+ React 19 |
| 語言 | TypeScript（`strict: true`） |
| UI | Shadcn UI（Radix）+ Tailwind CSS + `next-themes`（深色模式） |
| 圖表 | Recharts |
| 國際化 | next-intl（`en` / `zh` / `zh-CN` / `jp`，預設 `zh`） |
| 資料庫 | Supabase（PostgreSQL），透過 `@supabase/supabase-js` |
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
Supabase Client（src/lib/supabase.ts，單例）
        ▼
PostgreSQL（Supabase）
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
├── lib/              # 核心邏輯：auth / permissions / settlement / validation / supabase...
├── constants/        # categories / countries / currencies / routes
└── types/            # models / api(dto) / common / database.types
```

---

## 4. 核心子系統

### 4.1 認證（[src/lib/auth.ts](../src/lib/auth.ts)）
- 登入成功後簽發 JWT（HS256，7 天效期），存於 httpOnly、`sameSite=lax` 的 `session` cookie。
- `getSession()` 於 Server Action 解析 cookie；`getSessionFromRequest()` 供 API route 使用。
- 密碼以 `bcryptjs` 雜湊後存於 `users.password`。
- **JWT_SECRET 未設定時會 fallback 到硬編碼預設值**（見改善建議 P0）。

### 4.2 權限（[src/lib/permissions.ts](../src/lib/permissions.ts)）
- 權限層級僅 `admin` / `member`（存於 `trip_members.role`）。
- **`getTripMembership(userId, tripIdOrCode)`** 是首選：一次查詢同時「解析旅程 ID + 驗證成員身分 + 取得角色」。
- 舊版 `getTripId` / `isMember` / `isAdmin` / `requireAdmin` 仍保留供 API route 使用。
- **`tripIdOrCode` 慣例**：旅程識別字可以是數字 ID 或公開的 `hash_code` 字串，靠 `/^\d+$/` 分流。

### 4.3 結算演算法（[src/lib/settlement.ts](../src/lib/settlement.ts)）
- 貪心法：將債權人（balance > 0）與債務人（balance < 0）各自排序後配對，**最小化轉帳次數**。
- 使用 `0.01` epsilon 處理浮點誤差；金額四捨五入到小數點兩位。
- 已有測試覆蓋（[settlement.test.ts](../src/__tests__/settlement.test.ts)）。

### 4.4 多幣別與匯率
- 支出存 `original_amount`/`currency`/`exchange_rate`，並換算為基準貨幣（TWD）存於 `amount`。
- 匯率經 [src/app/api/exchange-rates/](../src/app/api/exchange-rates/) 取得。

### 4.5 國際化
- next-intl，`localePrefix: 'as-needed'`（預設語系無前綴）。
- 路由經 `[locale]` 區段；訊息檔在 [src/i18n/messages/](../src/i18n/messages/)，共 `en` / `zh` / `zh-CN` / `jp` 四個。
- Server Action 錯誤回傳 **error code**（非寫死文字），前端依 code 對應 i18n 訊息。

---

## 5. 資料模型

Schema 目前以字串常數 `INIT_SQL` 內嵌於 [src/lib/supabase.ts](../src/lib/supabase.ts)（須手動於 Supabase SQL Editor 執行；RPC 在 [supabase/rpc_functions.sql](../supabase/rpc_functions.sql)）。

```
users ──< trip_members >── trips
                              │
                  ┌───────────┼───────────┐
              expenses    itinerary_days   (location: JSONB)
                  │
            expense_splits
```

| 資料表 | 重點欄位 |
| --- | --- |
| `users` | `username`(uniq), `email`(uniq), `password`, `is_virtual`（虛擬成員，可不註冊參與分帳） |
| `trips` | `hash_code`(uniq，分享用), `location`(JSONB), 日期 |
| `trip_members` | `(trip_id,user_id)` uniq, `role`(admin/member) |
| `expenses` | `payer_id`, `amount`/`original_amount`/`currency`/`exchange_rate`, `category`(CHECK 約束), `date` |
| `expense_splits` | `expense_id`, `user_id`, `share_amount`（每人分攤金額） |
| `itinerary_days` | `(trip_id,day_number)` uniq；刪除日程用 RPC `delete_and_renumber_itinerary_day` 重新編號 |

---

## 6. 關鍵慣例（給開發者）

1. **不要在 Server Action 邊界丟出例外**——一律轉成 `ActionResult<T>`。
2. **所有授權都在應用層**：anon key client 無 RLS，每個碰旅程資料的 action 都必須自行驗證成員身分。
3. **`/api/public/*` 刻意不做登入檢查**，請勿「修正」。
4. **`tripIdOrCode` 雙重接受**數字 ID 或 hash_code，新端點請延續。
5. **DB 存取盡量批次化**，避免 N+1（近期 commit 的主軸）。
6. 路由字串用 [src/constants/routes.ts](../src/constants/routes.ts) 的 builder，勿硬編碼。
7. 新增使用者可見字串時，**四個語系訊息檔都要補**。
