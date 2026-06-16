# 改善建議（Improvements）

> 更新日期：2026-06-16（已完成 Supabase → MongoDB 遷移，相關項目已更新）
> 本文件已對照**實際程式碼**逐項驗證。架構說明見 [ARCHITECTURE.md](./ARCHITECTURE.md)。

狀態圖例：✅ 已完成　⚠️ 待處理　🟡 部分完成

---

## 已完成（驗證屬實，保留作為紀錄）

| 項目 | 狀態 | 驗證 |
| --- | --- | --- |
| **Supabase → MongoDB 遷移** | ✅ | 全面改 Mongoose；資料已搬遷（0 dropped、0 dangling ref）；`@supabase/supabase-js` 已移除 |
| anon key 暴露在前端 | ✅ | `MONGODB_URI` 無 `NEXT_PUBLIC_` 前綴，DB 憑證不再外洩（原 P0 #1） |
| Public API 的 N+1 | ✅ | splits 內嵌進 Expense，public expenses/settlement 改 `populate` 一次取得 |
| 錯誤訊息改用 error code | ✅ | actions 已無硬編碼中文錯誤字串，改回傳 `code` |
| 核心測試 | ✅ | settlement / validation / hashcode 測試 |
| 資料載入 hook | ✅ | `src/hooks/useTripData.ts` 封裝登入/public 雙路徑 |
| Server Action auth wrapper | ✅ | `withAuth` 全面採用：所有需登入的 action（trip/expense/member/settlement/stats/itinerary + auth 的 updateProfile）統一以 `withAuth` 包裝 |
| 減少 `any` | ✅ | `src/app` 與 `src/components` 的顯式 `any` 已清除（ESLint `no-explicit-any` 為 0） |

---

## P0 — 重大問題（優先修復）

### 1. ✅ JWT_SECRET 有不安全的預設 fallback
**問題**：[src/lib/auth.ts](../src/lib/auth.ts) 在 `JWT_SECRET` 未設定時 fallback 到硬編碼字串，正式環境若漏設將以已知密鑰簽發 token。
**修復（已完成）**：移除硬編碼 fallback，改為 lazy `getKey()`；`JWT_SECRET` 缺少或 `< 32` 字元時直接拋錯。`.env.example` 占位符清空並附產生指令（`openssl rand -base64 48`）。

> 註：原 P0「anon key / 無 RLS」「Public API N+1」已隨 MongoDB 遷移解決，移至上方「已完成」。
> 授權仍全在應用層（MongoDB 無 RLS 等價物），務必維持每個 action 的成員檢查。

---

## P1 — 架構改善（提升維護性）

### 2. ✅ 全面採用 `withAuth` 包裝 Server Action
**修復（已完成）**：`trip / expense / member / settlement / stats` 全部需登入的 action 改用 `withAuth`，移除重複的 `getSession()` boilerplate，統一回傳 `UNAUTHORIZED`。`auth.actions.ts` 的 `updateProfile` 亦改用；`getCurrentUser` 維持原狀（未登入回傳 `data: null` 而非錯誤，語義不同），`login/register/logout/resetPassword` 本就不需登入。

### 3. ✅ 用 Mongoose migration 管理 schema 變更
**修復（已完成）**：引入 `migrate-mongo`。設定見 [migrate-mongo-config.js](../migrate-mongo-config.js)（ESM、連線取自 `MONGODB_URI`），遷移放 [migrations/](../migrations/)，npm scripts `migrate:status/up/down/create`，並補上 baseline 遷移明文化現有索引。用法與慣例見 [MIGRATIONS.md](./MIGRATIONS.md)。`autoIndex` 維持開啟，工具與既有行為並存。

### 4. ✅ 缺少環境變數啟動驗證
**修復（已完成）**：新增 [src/lib/env.ts](../src/lib/env.ts)，用 Zod 驗證 `MONGODB_URI`、`JWT_SECRET`（min 32），缺漏即報清楚錯誤；`auth.ts` / `mongodb.ts` 改用 `getEnv()`。

### 7. ✅ 清除殘餘 `any`
**修復（已完成）**：`src/app` 與 `src/components` 的 5 處顯式 `any` 已清除——4 個 `catch (err: any)` 改為 `err: unknown` + `instanceof Error` 取訊息；`ExpenseHistogram` 的 tooltip props 以 `HistogramDataPoint` 明確標型。ESLint `no-explicit-any` 於這兩個目錄為 0。

### 5 & 8. ✅ Next.js Middleware 集中路由保護
**現況**：已有 [src/proxy.ts](../src/proxy.ts)（Next.js 16 將 `middleware` 改名為 `proxy`）統一處理：未登入存取受保護頁面導向 `/login`、已登入存取 `/login` 導向 `/trips`，並整合 next-intl 的 locale 路由。
**修復（已完成）**：`protectedRoutes` 原本漏了 `/stats`，已補上（現為 `/trips`、`/settings`、`/stats`）。`/trips/[id]` 維持不攔截，以支援未登入者用 `hash_code` 檢視分享。

---

## P2 — 擴充性（為未來鋪路）

### 6. 🟡 評估 Public API 的安全性
**問題**：`/api/public/*` 是「知道分享資訊即可檢視」的端點，原本同時接受 ObjectId 與 `hash_code`，等於開了一條繞過 `hash_code` 的旁路（ObjectId 含可預測的時間戳前綴，且會出現在各種回應的 `id` 欄位中）。
**修復（已完成）**：
- 新增 [`getTripIdByHashCode`](../src/lib/permissions.ts)，所有公開端點改為**僅接受 `hash_code`、明確拒絕 ObjectId**（8 條路由：trip / expenses / settlement / members / itinerary / convert-member / link-member / link-virtual）。「分享能力 == 知道 hash_code」。以 [permissions.test.ts](../src/__tests__/permissions.test.ts) 鎖定拒絕 ObjectId 的行為。
- **新 trip 的 hash_code 預設由 6 碼增為 8 碼**（碰撞 fallback 10 碼），枚舉難度 ×1300（36⁶→36⁸）。長度刻意維持 `< 12`，避免被誤判為 ObjectId。既有 6 碼舊資料仍相容（`isValidHashCode` 放寬為 `{6,10}`）。
- **可撤銷分享連結**：新增 admin-only 的 [`regenerateHashCode`](../src/actions/trip.actions.ts) action —— 重新產生 `hash_code`，使所有舊 `/join` 與 `/api/public` 連結立即失效（成員不受影響，他們依成員身分而非 hash_code 解析）。UI 在旅行設定頁的分享區，附二次確認對話框（[RegenerateShareCodeDialog](../src/components/trips/detail/dialogs/RegenerateShareCodeDialog.tsx)），四語系字串齊備。重產生後會把目前 URL 換成新碼以維持頁面可用。
**刻意未做**：
- *讀取端點需登入* — 與設計衝突。`/api/public/*` 本就是「未登入也能用 `hash_code` 檢視分享」的核心功能（見 [CLAUDE.md](../CLAUDE.md)），不在此加 session 檢查。
- *Rate limiting* — 需基礎設施決策。Serverless（Vercel）下記憶體式限流形同虛設（各 instance 各自計數），須改用 Upstash / Vercel KV 等外部儲存；待確認方案後再做。

### 7. ✅ 引入 Client 端資料快取（TanStack Query）
**修復（已完成）**：導入 `@tanstack/react-query`，於 locale layout 加 [QueryProvider](../src/components/providers/QueryProvider.tsx)（staleTime 30s、gcTime 5min、retry 1、不在 focus 時 refetch）。新增 [src/hooks/queries/](../src/hooks/queries/) 查詢層：
- `keys.ts` 集中 query key 工廠（`['trip', tripId, ...]`），`fetcher.ts` 封裝「先試 Server Action，遇 UNAUTHORIZED/FORBIDDEN 再 fallback 公開 `/api/public`」的雙路徑 queryFn。
- 查詢：`useCurrentUser / useTrips / useTrip / useMembers / useExpenses / useSettlement / useItinerary / useStats / useExchangeRates`，與 `useTripMembership`（衍生 isMember/isAdmin）。
- mutation：`useExpenseMutations / useMemberMutations / useTripMutations / useItineraryMutations`，成功後 **invalidate 相關 query**（如改支出 → expenses + settlement + stats；改成員 → members + detail + expenses + settlement + list），以背景重新驗證取代過去的 `reload()` / `loadData()` 全量重撈。
- 六個頁面（trips 列表、trip 詳情、settlement、itinerary、settings、stats）全面改用上述 hooks；移除已無用的 `useTripData`。跨頁切換 tab 現可命中快取、自動去重。
**備註**：尚未導入 per-item 樂觀更新（目前以 invalidate 後背景 refetch 為主，足夠且最不易出錯）；公開「認領虛擬成員」流程因會改變登入 session，仍刻意保留 `window.location.reload()`。

### 8. 🟡 頁面元件職責過重
`trips/[id]/page.tsx` 同時承擔資料載入、多個 dialog 狀態、handler、權限判斷與渲染。建議拆為 container / presentational，搭配 `useTripData` 等 hook。

### 9. 補強測試覆蓋（依序）
`lib/permissions.ts`（安全）→ `actions/*`（核心業務）→ 關鍵元件。settlement / validation / hashcode 已覆蓋。可考慮對 Mongoose 層加整合測試（連線測試 DB）。

---

## P3 — 開發體驗

### 10. ⚠️ 統一刪除確認 UI
[trips/[id]/page.tsx](../src/app/[locale]/trips/[id]/page.tsx) 仍用原生 `confirm()`，與其他操作的 Dialog 風格不一致。改用統一的 `ConfirmDialog`。

### 11. Loading Skeleton 取代單一 spinner，提升載入體感。

### 12. Toast 訊息全面走 i18n（勿硬編碼）。

---

## 建議路線圖

```
立即（P0）
  └── #1 JWT_SECRET 移除 fallback

短期（P1）
  ├── #2 全面採用 withAuth
  ├── #3 （視需要）Mongoose migration 管理
  ├── #4 env 啟動驗證
  └── #5 導入 Middleware

中期（P2）
  ├── #6 Public API 安全評估
  ├── #7 React Query
  ├── #8 頁面元件拆分
  └── #9 補強測試覆蓋

長期（P3）
  └── #10~12 UI/體驗一致性
```

---

## 值得保留延續的好設計
- `ActionResult<T>` 統一回傳格式
- Zod 集中驗證所有輸入
- `getTripMembership` 一次 `Trip.findOne` 收斂權限檢查（members 內嵌）
- splits/members 內嵌，載入支出不再 N+1
- 虛擬成員（`isVirtual`）支援未註冊者參與分帳
- 四語系 i18n 架構完善
- 簡潔的 admin/member 兩級權限
