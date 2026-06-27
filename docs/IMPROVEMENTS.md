# 改善建議（Improvements）

> 更新日期：2026-06-17
> 本文件已對照**實際程式碼**逐項驗證。架構說明見 [ARCHITECTURE.md](./ARCHITECTURE.md)。
> 先前的 P0–P3（#1–#12，含 Supabase→MongoDB 遷移、`withAuth`、migration、env 驗證、proxy 路由保護、Public API hash_code 強化、React Query、頁面拆分、刪除確認 / Skeleton / i18n toast）皆已完成並合併，紀錄見 git 歷史。本文件只保留**尚未處理**與**新發現**的項目。

狀態圖例：✅ 已完成　⚠️ 待處理　🟡 部分完成

---

## 延續未竟（先前項目的剩餘部分）

### A. 🟡 Public API 限流（Rate limiting）
**問題**：`/api/public/*` 是「知道 `hash_code` 即可檢視」的未登入端點，目前無任何速率限制，易被枚舉 / 爬取。
**現況**：刻意未做——Serverless（Vercel）下記憶體式限流形同虛設（各 instance 各自計數），須外部儲存。
**建議**：導入 Upstash Redis（`@upstash/ratelimit` + `@upstash/redis`）以 IP（或 `hash_code`）為 key 做滑動視窗限流，套在 8 條公開路由與 `/api/exchange-rates`。屬基礎設施決策，待確認方案後再做。

### B. 🟡 補強 `actions/*` 測試覆蓋
**現況**：`lib/`（settlement / validation / hashcode / permissions / histogram，102 tests）已覆蓋；`actions/*`（核心業務）尚未測。
**建議**：對 `expense / member / settlement / trip` actions 加測試。因 DB 依賴重，兩條路可選：(1) mock `@/models` 與 `dbConnect`（如 permissions.test.ts 的作法）；(2) 用 `mongodb-memory-server` 做整合測試，能順帶驗證 Mongoose schema / index 行為。建議優先涵蓋授權分支（非成員 / 非 admin 被拒）與分帳金額計算。

---

## 新發現

### C. ✅ 缺少 CI（lint / test / build 未在 PR 把關）
**問題**：`.github/workflows/` 不存在；專案以 PR 流程協作（見 git 歷史的 merge commit），但 lint、`test:run`、`build`、`format:check` 全靠手動，迴歸容易溜進 master。
**修復（已完成）**：新增 [.github/workflows/ci.yml](../.github/workflows/ci.yml)，於 PR 與 push 到 master 觸發 `pnpm install --frozen-lockfile` → `lint` → `format:check` → `test:run` → `build`（build 帶 dummy `MONGODB_URI`/`JWT_SECRET` 以通過 env 驗證，建置期不連 DB）。同 ref 重複觸發以 `concurrency` 自動取消舊跑。前置工作：先以 `pnpm format` 一次性格式化全庫（107 檔），讓 `format:check` 能納入把關。

### D. ✅ Public API 錯誤訊息硬編碼且中英混雜
**問題**：主 actions 早已改回傳 error `code`，但 `/api/public/*` 仍直接回傳**明文字串**，且中英文混用（`'旅行不存在'`、`'Trip not found'`、`'獲取支出列表失敗'`、`'Member is not virtual'` 並存）。前端無法據此 i18n，且風格不一致。
**修復（已完成）**：新增 [src/lib/publicApiError.ts](../src/lib/publicApiError.ts)，定義公開 API 專用的結構化錯誤碼 `PublicApiError`（較 actions 的 6 個通用 `ErrorCodes` 更細，涵蓋 link/convert 虛擬成員流程：`INVALID_CREDENTIALS`、`USERNAME_TAKEN`、`ALREADY_MEMBER` 等）與 `apiError(code, status)` helper。全部 8 條公開路由改回傳 `{ error: <code> }`。消費端：GET 路由的 [fetcher.ts](../src/hooks/queries/fetcher.ts) 只看狀態碼不受影響；link/convert 兩個 dialog 與 link-virtual 頁面改以錯誤碼對應 i18n 文案，新增 `member.convertVirtual.errors.*` 至四語系 catalog。
**備註**：樣板收斂（重複的 `try/catch` + 404 + DTO 映射）見項目 E，未在本次處理。

### E. ✅ Public API 路由樣板重複
**問題**：8 條公開路由各自重複「`await params` → `getTripIdByHashCode` → 404 → `try/catch` → 手寫 DTO 映射」。GET 端點的 DTO 映射（snake_case 化）也與 actions 的 `toExpenseDto` 等邏輯平行維護，易漂移。
**修復（已完成）**：
1. **樣板包裝**：新增 [src/lib/withPublicTrip.ts](../src/lib/withPublicTrip.ts)——`withPublicTrip(handler, { tripParam?, logLabel? })`，統一 `await params`、以 `getTripIdByHashCode` 解析 hash_code（仍只認 hash_code、拒 ObjectId）、查無回 `NOT_FOUND` 404、攔截例外記錄並回 `INTERNAL_ERROR` 500，再把解析好的 `tripId` 注入 handler。全部 8 條路由（含 `tripParam: 'tripId'` 的 link-virtual 與兩條 POST link/convert）改用之。測試見 [withPublicTrip.test.ts](../src/__tests__/withPublicTrip.test.ts)。
2. **DTO 共用**：新增 [src/lib/dto.ts](../src/lib/dto.ts)，把 `toExpenseDto` / `toTripDto`（含結構化 input 型別）從 `'use server'` 的 [expense.actions.ts](../src/actions/expense.actions.ts) / [trip.actions.ts](../src/actions/trip.actions.ts) 抽出，actions 與公開 expenses / trip 路由共用同一映射，消除平行實作。順帶修正公開 expenses 原本漏帶 `trip_id`（前端本就以 `Expense` 型別消費）、移除無人讀取的 `payer_username`。測試見 [dto.test.ts](../src/__tests__/dto.test.ts)。

### F. ✅ 結構化日誌（取代裸 `console.*`）
**問題**：全專案約 43 處 `console.error/​log`，無層級、無結構、Serverless 上難以查詢；生產環境也可能噴出未脫敏資訊。
**修復（已完成）**：新增 [src/lib/logger.ts](../src/lib/logger.ts)——極簡 isomorphic logger（`debug/info/warn/error`），依 `NODE_ENV` 切換輸出：production 每筆一行 JSON（`{ level, time, message, meta }`，方便日誌平台解析、debug 不輸出），其餘環境為人類可讀單行。Error 會攤平成可序列化物件。將全庫 45 處 `console.error` 改為 `logger.error`，是唯一直接呼叫 `console` 的地方（呼應既有的 `no-console` 規則，只放行 warn/error）。之後若接 Sentry / Axiom 只需改 logger 一處。測試見 [logger.test.ts](../src/__tests__/logger.test.ts)。

### G. 🟡 支出列表無上限（潛在效能）
**問題**：`getExpenses`（[expense.actions.ts](../src/actions/expense.actions.ts)）與公開 expenses 路由皆 `Expense.find({ trip })` 全量載入 + 雙 `populate`。一般旅行筆數有限尚可，但長期 / 大型旅行無分頁保護。
**建議**：先觀察實際資料量再決定。若需要，加上 `limit` + 游標分頁（以 `date`/`_id`），前端配合無限捲動；屬「為未來鋪路」，非當前痛點。

### H. ✅ 安全標頭（Security headers）
**問題**：[next.config.ts](../next.config.ts) 與 [proxy.ts](../src/proxy.ts) 都未設置安全標頭（CSP、`X-Frame-Options` / frame-ancestors、`Referrer-Policy`、`X-Content-Type-Options` 等）。
**修復（已完成）**：在 [next.config.ts](../next.config.ts) 的 `headers()` 對所有路由加上 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`X-DNS-Prefetch-Control: on`，以及 `Content-Security-Policy: frame-ancestors 'none'`（防點擊劫持，與 `X-Frame-Options` 互補）；`Strict-Transport-Security`（HSTS，2 年 + includeSubDomains）只在 production 送出。**完整 CSP（`default-src`/`script-src`…）刻意未上**——需配合 Leaflet 圖磚、R2 圖片/PDF、next-themes 內嵌腳本與 Radix 內嵌樣式實測，列為後續；目前的 CSP 僅含 `frame-ancestors`，不限制其他資源故不會誤擋既有功能。

---

## 建議優先序

```
高（低成本、高效益）
  ├── C  CI workflow（lint/test/build 把關）  ✅
  ├── D  Public API 錯誤碼統一  ✅
  └── H  安全標頭  ✅

中
  ├── B  actions/* 測試
  ├── E  Public API 樣板收斂  ✅
  └── F  結構化 logger  ✅

待基礎設施 / 視資料量
  ├── A  Public API 限流（需 Upstash 等外部儲存）
  └── G  支出分頁
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
- React Query 查詢/失效層集中於 [src/hooks/queries/](../src/hooks/queries/)
