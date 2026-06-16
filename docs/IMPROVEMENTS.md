# 改善建議（Improvements）

> 更新日期：2026-06-16
> 本文件已對照**實際程式碼**逐項驗證；舊版 `improvement.md` 與 `ARCHITECTURE_REVIEW.md` 部分內容已過時，以本文件為準。
> 架構說明見 [ARCHITECTURE.md](./ARCHITECTURE.md)。

狀態圖例：✅ 已完成　⚠️ 待處理　🟡 部分完成

---

## 已完成（驗證屬實，保留作為紀錄）

| 項目 | 狀態 | 驗證 |
| --- | --- | --- |
| Supabase client 重複建立 | ✅ | 全專案僅 `src/lib/supabase.ts` 一處 `createClient`；`permissions.ts` 已改 import 共用單例 |
| `getExpenses()` 的 N+1 查詢 | ✅ | 已改為 `.in('expense_id', ids)` 一次撈出再記憶體 join |
| Server Action auth wrapper | 🟡 | `withAuth` 已建立，但**只有 `itinerary.actions.ts` 採用**；其餘 6 個 action 檔仍各自手寫 `getSession()` |
| 錯誤訊息改用 error code | ✅ | actions 已無硬編碼中文錯誤字串，改回傳 `code` |
| 核心測試 | ✅ | 已有 settlement / validation / hashcode 測試（非僅 sample） |
| 資料載入 hook | ✅ | `src/hooks/useTripData.ts` 已存在並封裝登入/public 雙路徑 |
| 減少 `any` | 🟡 | `src/app` 與 `src/components` 仍約 9 處 `: any` |

---

## P0 — 重大問題（優先修復）

### 1. ⚠️ 以 anon key 直接操作資料庫，且未啟用 RLS
**問題**：所有 Server Action 都用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（前端可見）操作 DB。授權全靠應用層 JWT，DB 端無 Row Level Security 防護——任何人拿 anon key 直呼 Supabase API 即可繞過應用層讀寫資料。
**修復（擇一或併用）**：
- Server Action 改用 `SUPABASE_SERVICE_ROLE_KEY`（不帶 `NEXT_PUBLIC_`，不外洩）；或
- 於 Supabase 啟用並正確設定 RLS 政策（依 `trip_members` 判斷成員/管理員）。
> 註：因採自製 JWT 而非 Supabase Auth，RLS 無法直接用 `auth.uid()`，導入前需評估認證整合方式。

### 2. ⚠️ JWT_SECRET 有不安全的預設 fallback
**問題**：[src/lib/auth.ts](../src/lib/auth.ts) 在 `JWT_SECRET` 未設定時 fallback 到硬編碼字串，正式環境若漏設將以已知密鑰簽發 token。
**修復**：缺少或過短時直接拋錯，禁止 fallback（搭配 P6 的 env 驗證）。

### 3. ⚠️ Public API 仍有 N+1 查詢
**問題**：[api/public/.../expenses/route.ts](../src/app/api/public/trips/[id]/expenses/route.ts) 與 `settlement/route.ts` 仍用 `Promise.all` 對每筆 expense 逐一查 splits（與已修好的 `getExpenses()` 相反）。
**修復**：比照 Server Action，一次 `.in('expense_id', ids)` 撈出後記憶體分組。

---

## P1 — 架構改善（提升維護性）

### 4. 🟡 全面採用 `withAuth` 包裝 Server Action
6 個 action 檔仍各自重複手寫登入檢查。將 `trip / expense / member / settlement / stats / auth` 逐步改用 `withAuth`，消除 boilerplate 並統一未登入行為。

### 5. ⚠️ Schema 不該內嵌於程式碼
`INIT_SQL` 以字串存在 [src/lib/supabase.ts](../src/lib/supabase.ts)，無法版控 migration 或追蹤變更。
**修復**：改用 `supabase/migrations/`（Supabase CLI `db diff`），移除 `INIT_SQL`。

### 6. ⚠️ 缺少環境變數啟動驗證
**修復**：新增 `src/lib/env.ts`，用 Zod 在啟動時驗證 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`JWT_SECRET`（min 32）等，缺漏即報清楚錯誤。

### 7. 🟡 清除殘餘 `any`
為頁面 handler 的 `data` 參數與 `currentUser` state 補上明確型別（`User | null` 等），約 9 處。

### 8. ⚠️ 引入 Next.js Middleware 集中路由保護
目前無 `src/middleware.ts`，受保護路由的導向散落各頁。建議在 middleware 統一處理：未登入存取 `/trips`、`/settings`、`/stats` 時導向 `/login`。

---

## P2 — 擴充性（為未來鋪路）

### 9. ⚠️ 評估 Public API 的安全性
`/api/public/*` 完全無認證，知道 trip 數字 ID 即可讀取費用、成員、結算等資料。
**修復**：分享端點只接受 `hash_code`（拒絕純數字 ID）；敏感資料考慮需登入；加上 rate limiting。

### 10. ⚠️ 引入 Client 端資料快取（React Query / SWR）
目前每次操作後 `await reload()` 重撈全部資料，無 cache、無 optimistic update。導入 TanStack Query 可獲得背景重新驗證、樂觀更新、去重與 retry。

### 11. 🟡 頁面元件職責過重
`trips/[id]/page.tsx` 同時承擔資料載入、多個 dialog 狀態、handler、權限判斷與渲染。建議拆為 container / presentational，搭配 `useTripData` 等 hook。

### 12. 補強測試覆蓋（依序）
`lib/permissions.ts`（安全）→ `actions/*`（核心業務）→ 關鍵元件。settlement / validation / hashcode 已覆蓋。

---

## P3 — 開發體驗

### 13. ⚠️ 統一刪除確認 UI
[trips/[id]/page.tsx](../src/app/[locale]/trips/[id]/page.tsx) 仍用原生 `confirm()`，與其他操作的 Dialog 風格不一致。改用統一的 `ConfirmDialog`。

### 14. Loading Skeleton 取代單一 spinner，提升載入體感。

### 15. Toast 訊息全面走 i18n（勿硬編碼）。

---

## 建議路線圖

```
立即（P0）
  ├── #1 anon key / RLS 安全強化
  ├── #2 JWT_SECRET 移除 fallback
  └── #3 修掉 Public API N+1

短期（P1）
  ├── #4 全面採用 withAuth
  ├── #5 Schema 改 migration 管理
  ├── #6 env 啟動驗證
  └── #8 導入 Middleware

中期（P2）
  ├── #9 Public API 安全評估
  ├── #10 React Query
  └── #11 頁面元件拆分

長期（P3）
  └── #13~15 UI/體驗一致性
```

---

## 值得保留延續的好設計
- `ActionResult<T>` 統一回傳格式
- Zod 集中驗證所有輸入
- `getTripMembership` 把權限檢查收斂成單次查詢
- 虛擬成員（`is_virtual`）支援未註冊者參與分帳
- 四語系 i18n 架構完善
- 簡潔的 admin/member 兩級權限
