# HTTP 邊界

`client.ts` 負責 timeout、取消、JSON envelope、runtime 驗證、錯誤及 Retry-After。`contracts.ts` 重新匯出 `@travel-budget/contracts` 的 HTTP DTO 與 runtime schema；schema 單一來源在 repository 的 `packages/contracts/src/index.ts`，OpenAPI 在 `packages/contracts/openapi.json`。

取消檢查使用 `signal.aborted`，不假設 React Native 的 `AbortSignal` 提供 `throwIfAborted()` 或 `reason`。有取消原因時保留原值；原生 signal 未提供原因時回報 `CANCELLED`。

Timeout 與取消涵蓋完整回應內容讀取；JSON 語法錯誤與傳輸中斷分開處理，避免將斷線／逾時誤報為 `INVALID_RESPONSE`。

修改契約後從 repository 根目錄執行 `pnpm contracts:generate` 與 `pnpm contracts:check`。只共用契約套件；後端授權、服務與 models 留在 `apps/web`。

`session.ts` 管理記憶體 access token、單一 refresh 與登入生命週期，透過注入的 SecureStore adapter 保存 refresh token。Token 不放 Query cache。Feature hooks 使用 manager.request 並管理 query key；transport 不依賴 React、畫面或路由。

後端規格見 [後端契約](../../docs/BACKEND_CONTRACT.md)。
