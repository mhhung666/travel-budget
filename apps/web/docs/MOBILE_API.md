# 手機唯讀 API

已在程式碼加入 `/api/v1` 的登入、更新憑證、登出、目前使用者、旅行列表與旅行摘要。這不代表遠端環境已部署。契約以 [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts) 的 Zod schema 為單一來源；Web 與手機透過 `@travel-budget/contracts` 匯入，Web 的 `src/lib/mobile/contract.ts` 只保留薄 adapter。共用產物見 [OpenAPI](../../../packages/contracts/openapi.json)，在 repository 根目錄執行 `pnpm contracts:generate` 產生、`pnpm contracts:check` 檢查同步。

- Web Server Actions 與手機 HTTP handler 在後端共用 `credentials.ts`、`tripListRead.ts` 及既有權限／金額摘要；HTTP handler 不呼叫依賴 cookie 的 Server Action，手機 bundle 不匯入這些後端模組。
- 手機 access JWT 15 分鐘、裝置 session 絕對期限 30 天；JWT key、issuer、audience 與 Web cookie 隔離。每次授權查詢 session 撤銷／期限與目前密碼 fingerprint。
- refresh token 僅存雜湊，輪替採原子 compare-and-swap；有效舊 token 重放會撤銷該 session。原生端須合併併發 refresh，refresh 回應遺失時可能需要重新登入。
- 登出使用 refresh token，因此 access token 過期仍能撤銷；登出不影響其他裝置或原有 Web cookie。密碼變更／重設會讓手機 session 失效。
- 登入每帳號每 15 分鐘時段最多 10 次，429 提供 Retry-After。此限制不是全面的流量防護；部署時仍沿用平台流量管理。
- 成員 API 只接受 bearer，拒絕 Web cookie 或 public share code。回應白名單不包含其他人的預算、分享碼、收據／檔案 key。`budgetTotal` 只屬於 viewer。
- 日期為 `YYYY-MM-DD`，`date` query 表示手機當地日期。金額由現有服務算到分，以 TWD 回傳；`myBalance` 正為應收、負為應付。
- 旅行列表共用 Web 全列表讀取，HTTP 每頁 20 筆；DB 計算未改為游標分頁。正在旅行優先，已封存最後。分頁非快照，資料變更後從第一頁重讀。
- 原生 API 無跨來源瀏覽器 CORS；現有 Web 不遷移至此認證流程。所有成功／錯誤回應均 no-store。

新增 `20261002100000-mobile-session-expiry.js` 為 session／登入限制紀錄建立 TTL 索引。此次實作不執行遠端 migration；正式環境沿用既有 migration 流程。即使 TTL 尚未清理，授權仍會檢查 expiresAt。

測試在 `apps/web` 執行：`pnpm exec vitest run src/__tests__/mobileSession.test.ts src/__tests__/mobileTrips.test.ts src/__tests__/mobileHttp.test.ts`。目前測試使用隔離的 model mocks；實際 MongoDB、手機 SecureStore 與 iOS／Android 真機串接仍須在測試環境驗收。

尚無手機支出寫入、離線 outbox、附件上傳、推播或帳號刪除 API。

Web／後端 workspace 名稱為 `@travel-budget/web`；在根目錄可用 `pnpm --filter @travel-budget/web exec vitest run <test-path>`。依賴使用根 lockfile，版本與環境設定仍屬各 app。手機程式現在位於同 repository 的 `apps/mobile`；既有 `travel-budget-mobile` repository 已棄用。
