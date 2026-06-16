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
| 減少 `any` | 🟡 | `src/app` 與 `src/components` 仍約 9 處 `: any` |

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

### 3. 🟡 用 Mongoose migration 管理 schema 變更
目前 schema 在 [src/models/](../src/models/)，index 於連線時建立——對小專案足夠。若日後需要可重現的結構變更與資料 backfill，可引入 `migrate-mongo` 之類工具管理 migration。

### 4. ⚠️ 缺少環境變數啟動驗證
**修復**：新增 `src/lib/env.ts`，用 Zod 驗證 `MONGODB_URI`、`JWT_SECRET`（min 32），缺漏即報清楚錯誤。

### 7. 🟡 清除殘餘 `any`
為頁面 handler 的 `data` 參數與 `currentUser` state 補上明確型別（`User | null` 等），約 9 處。

### 5 & 8. ✅ Next.js Middleware 集中路由保護
**現況**：已有 [src/proxy.ts](../src/proxy.ts)（Next.js 16 將 `middleware` 改名為 `proxy`）統一處理：未登入存取受保護頁面導向 `/login`、已登入存取 `/login` 導向 `/trips`，並整合 next-intl 的 locale 路由。
**修復（已完成）**：`protectedRoutes` 原本漏了 `/stats`，已補上（現為 `/trips`、`/settings`、`/stats`）。`/trips/[id]` 維持不攔截，以支援未登入者用 `hash_code` 檢視分享。

---

## P2 — 擴充性（為未來鋪路）

### 6. ⚠️ 評估 Public API 的安全性
`/api/public/*` 完全無認證，知道 trip 的 ObjectId 或 `hash_code` 即可讀取費用、成員、結算等資料。
**修復**：分享端點只接受 `hash_code`（拒絕直接以 ObjectId 存取）；敏感資料考慮需登入；加上 rate limiting。

### 7. ⚠️ 引入 Client 端資料快取（React Query / SWR）
目前每次操作後 `await reload()` 重撈全部資料，無 cache、無 optimistic update。導入 TanStack Query 可獲得背景重新驗證、樂觀更新、去重與 retry。

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
