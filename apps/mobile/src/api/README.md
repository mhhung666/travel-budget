# HTTP 邊界

`client.ts` 負責 timeout、取消、JSON envelope、runtime 驗證、錯誤及 Retry-After。`contracts.ts` 重新匯出 `@travel-budget/contracts` 的 HTTP DTO 與 runtime schema；schema 單一來源在 repository 的 `packages/contracts/src/index.ts`，OpenAPI 在 `packages/contracts/openapi.json`。

取消檢查使用 `signal.aborted`，不假設 React Native 的 `AbortSignal` 提供 `throwIfAborted()` 或 `reason`。有取消原因時保留原值；原生 signal 未提供原因時回報 `CANCELLED`。

Timeout 與取消涵蓋完整回應內容讀取；JSON 語法錯誤與傳輸中斷分開處理，避免將斷線／逾時誤報為 `INVALID_RESPONSE`。

修改契約後從 repository 根目錄執行 `pnpm contracts:generate` 與 `pnpm contracts:check`。只共用契約套件；後端授權、服務與 models 留在 `apps/web`。

`session.ts` 管理記憶體 access token、單一 refresh 與登入生命週期，透過注入的 SecureStore adapter 將 refresh token 與已驗證 user 原子保存。restore 遇到斷線／逾時且有本機身分時，使用 local 狀態提供受限草稿入口；此狀態沒有 session，request／requestAs 仍拒絕送出。Token 不放 Query cache。`requestAs(userId, …)` 供屬於特定帳號的請求（例如待確認的新增支出）使用：只在該帳號仍是目前登入者時送出，否則在送出前失敗，不會以另一個帳號的 token 送出。請求的回應不論是資料或錯誤，登入世代已更換就一律回報 `CANCELLED`（晚到的 400 不能當成「沒有寫入」的證明）。Feature hooks 使用 manager.request 並管理 query key；transport 不依賴 React、畫面或路由。

後端規格見 [後端契約](../../docs/BACKEND_CONTRACT.md)。

refresh 的 HTTP／傳輸錯誤保留 code、status、Retry-After，另標記 `ApiError.source = refresh`；不能當成原資源請求的寫入拒絕。晚到的錯誤先檢查登入世代。

B3 旅行／帳務預設 v2；auth 保留 v1。恢復用保存的 apiVersion 明確選原 endpoint，baseUrl／scope 不變；HTTP schema 仍取共用 contracts。相容與單位規則見 [B3 架構](../../docs/ARCHITECTURE.md#b3mobile-帳本與舊資料恢復)。
