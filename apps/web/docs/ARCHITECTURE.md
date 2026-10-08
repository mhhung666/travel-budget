# 架構摘要

本頁保留理解現有功能所需的結構。產品能力見 [FEATURES.md](FEATURES.md)，安裝與環境設定見 [專案 README](../README.md)。

## Workspace 邊界

此應用位於 `apps/web`（`@travel-budget/web`），原生 App 位於 `apps/mobile`；兩者在同一 repository 維護、各自版本與發布。Web 仍擁有業務後端、MongoDB models、migrations 與外部服務。手機透過 HTTP 存取 `/api/v1`。跨應用文件見 [repository 入口](../../../docs/README.md)。

共用 [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts) 只包含 API DTO、Zod runtime schema 等可供原生使用的契約，透過 `@travel-budget/contracts` 匯入。它不包含 Mongoose、Server Actions 或 server SDK。Web 的 [contract.ts](../src/lib/mobile/contract.ts) 只保留薄 adapter。

依賴在根目錄使用共用 lockfile 安裝；Node.js 使用 24。Web 開發、測試、migration 與 PWA 指令在 `apps/web` 執行，或從根目錄使用 `pnpm --filter @travel-budget/web <script>`。Web 版本仍由本目錄的 `package.json.version` 注入。

## 核心資料流

Next.js App Router 與 React 組成介面，TanStack Query 負責查詢、重新整理及瀏覽器快取。主要業務操作透過 Server Actions，資料由 Mongoose 存入 MongoDB；API routes 另處理 AI 草稿、公開分享、匯率與排程等入口。

| 程式位置 | 職責 |
| --- | --- |
| [src/app](../src/app/) | 頁面、路由與 API |
| [src/components](../src/components/) | 旅程、支出、統計、相簿等介面 |
| [src/actions](../src/actions/) | 業務操作、授權與資料寫入 |
| [src/hooks](../src/hooks/) | 表單協調、查詢與快取更新 |
| [src/models](../src/models/) | 帳號、旅程、支出、還款及其他資料模型 |
| [src/lib](../src/lib/) | 分帳、權限、儲存、通知、AI 與離線同步 |
| [src/i18n](../src/i18n/) | 繁中、簡中、英文、日文 |
| [migrations](../migrations/) | 資料結構、索引與回填遷移 |

## 主要資料關係

- **旅程**：包含成員、角色、幣別設定及每位成員的私人預算；行程日、支出、還款、相簿、清單與筆記歸屬旅程。
- **支出與結算**：支出記錄付款人、原幣、匯率與各成員分攤金額；結算依餘額與已登記還款產生轉帳建議，基準幣為 TWD。
- **個人資料**：統計彙整個人分攤；飛行與住宿紀錄屬於使用者，刪除旅程只解除終身紀錄的旅程關聯。
- **檔案**：收據、票券及相簿透過 R2 儲存，資料庫保存物件 key；公開相簿使用移除位置資訊的獨立副本。

## 維護時必須保留的契約

- JWT 搭配 httpOnly cookie 驗證身分。每個旅程操作自行檢查成員與角色；Server Actions 回傳 `ActionResult<T>`，輸入由 Zod 驗證。
- 公開分享採獨立資料邊界：不輸出私人預算、收據或成員限定筆記；公開相簿不輸出位置、EXIF 或內部 key。
- 行程與跨資料集合的寫入使用交易及衝突檢查，需要支援交易的 MongoDB replica set 或 sharded cluster。刪除相關資料須明確處理，外部檔案清理由持久化工作補送。
- AI 只產生可編輯草稿，使用者確認後才走既有寫入流程；行程匯入限 admin，支出草稿限成員。三種 AI 入口共用每日使用量及成本限制；模型設定、格式相容性與正規化入口見 [AI 維護與測試](AI.md)。
- Service worker 快取頁面與資源；查詢快取及離線新增支出保存於 IndexedDB。不可快取 Server Action POST 或 API 寫入；改變持久化快取格式時須更新 `PERSIST_BUSTER`。
- 新增介面字串須補齊四語。路由不帶語系前綴，路徑使用 [routes.ts](../src/constants/routes.ts) 的 builder。
- PWA 需以 `pnpm build`（webpack）及 `pnpm start` 驗證；開發模式不啟用 service worker。

細部設計、資料庫遷移操作與子系統注意事項已收進 [封存索引](archive/README.md)，修改相關子系統時可按需查閱。

## 手機 HTTP adapter

`src/app/api/v1` 是原生用戶端入口，`src/lib/mobile` 管理獨立 bearer session、錯誤 envelope 與 DTO 組裝；輸入與回應 schema 由 `@travel-budget/contracts` 匯入。`credentials.ts`、`tripListRead.ts` 同時供 Web Server Actions 與手機呼叫；摘要重用成員權限及 `tripShellRead`／`tripListSummary`。支出清單／明細（`lib/mobile/expenses.ts`）重用 `toExpenseDto` 與 `Expense` 索引，結算（`lib/mobile/settlement.ts`）重用 `readSettlementDetail`（`readSettlement` 的成員 id 版本，原回傳不變）；兩者先經 `lib/mobile/access.ts` 驗證成員 ObjectId，再讀資料。手機簽章與 Web cookie 隔離，MongoDB 儲存 refresh 雜湊與撤銷狀態。詳細安全邊界及 OpenAPI 見 [手機 API](MOBILE_API.md)。

新增支出只有一個寫入服務：`lib/expenseCreate.ts#createExpenseForActor` 接受已授權的旅行與操作者及 `createExpenseSchema` 的輸出，內含 `withTripWrite` 交易、成員／分攤／金額驗證、收據驗證、與支出同交易提交的冪等 receipt（`expenseCreateRequest.ts`）及通知／outbox 副作用，且不 import `next/*`。Web Server Action（`expense.actions.ts#createExpense`，cookie）與手機 HTTP（`lib/mobile/expenseWrite.ts`，bearer）是它的兩個 adapter：各自驗證登入、解析旅行與輸入、處理自己的快取／排程並對照錯誤碼。成員順序（`lib/mobile/expenseOptions.ts`）與 Web 成員清單相同，均分預覽重用 `computeSplits`，手機不複製金額演算法。

[packages/contracts/openapi.json](../../../packages/contracts/openapi.json) 是共用契約產物；在 repository 根目錄執行 `pnpm contracts:generate` 更新、`pnpm contracts:check` 檢查同步。Vercel 使用 Root Directory `apps/web`，啟用 outside-root source files 以建置共享契約；本目錄 `vercel.json` 保留既有 cron。

`lib/tripEntry.ts` 提供 E1 Web／Mobile 共用建立／加入交易。獨立 `mutationrequests` 以操作者／UUID 唯一 `_id` 保存成功／終局拒絕；建立、成員更新與站內副作用同交易；活動寫入使用獨立物件，避免 driver 回填 `_id` 汙染多收件人通知，安全亂數邀請碼使用既有唯一索引。加入先以有效碼取得旅行 fence；重播／查詢須重新核對目前成員，已移除者不能再次加入。外部通知在提交後執行、重播不排程，不影響已提交結果。Web 加入結果補讀將目前成員與刪除狀態納入同一查詢；Web 建立僅回傳已提交的旅行 ID，畫面以 ID 接續，不因提交後讀取失敗重新建立。E3 已擴充帳務 receipt／revision；E4 還款已接續同一 receipt。

## E2 共用帳號服務

`accountEntry.ts` 供 Web cookie adapter 與 `/api/v1/auth` 匿名 adapter 共用註冊／寄碼／重設規則。`accountAdapter.ts` 只取得 DB、可信來源與寄信。註冊由既有 username／Email 的不分大小寫唯一索引防併發，Web cookie 副作用失敗不推翻已建立帳號；HTTP 不建 session。寄碼配額與 reset-code 建立、密碼更新／碼消耗使用 replica-set 交易，未到期且錯碼未滿五次的碼不得更換或延長期限（含舊部署建立的碼）；鎖死碼允許在上次寄碼 60 秒後更換，仍保留小時配額，錯誤嘗試也原子提交，寄信在提交後且不印驗證碼。

`accountentryattempts` 以 HMAC key 原子保存滑動時窗與冷卻，註冊／寄碼來源共用限流、Email 與驗碼另限；寄碼間隔對齊 15 分鐘有效期，避免匿名請求換掉仍可使用的碼，鎖死碼的 60 秒例外仍受每小時五次配額限制。已知／未知 Email 的碼期限與錯誤計數一併保存於 HMAC 計數文件，確保恢復例外回應一致。拒絕不消耗寄碼配額或延長原期限，未知 Email 使用同樣間隔與計數；寄信失敗亦須等原期限後再寄。可信來源只解析 Vercel 覆寫的單一 IP header；其他部署保留帳號／Email 限制。Email 共用驗碼額度被耗盡的定向阻斷仍未解決，後續防護見 [E2 契約](../../mobile/docs/BACKEND_CONTRACT.md#e2-註冊與-email-驗證碼重設)。契約及 migration 見 [手機 API](MOBILE_API.md#e2-匿名帳號入口)。

## E3 支出維護服務

Web update／delete action 抽成 `expenseMaintenance.ts` 的 actor service，保留進階欄位與附件驗證；Mobile adapter 使用同模組的嚴格 basic／equal 操作。`withTripWriteInDatabase` 與既有 writer 共用 parent fence／snapshot transaction，context 與 HMAC token 取自原始 BSON，前條件、expense／comment／retirement／活動及 E receipt 在交易內處理。對 body 不同的 UUID 衝突不覆蓋原結果；終局拒絕也同交易，receipt 讀取對其 tripId 重授權。

清理與快取在提交後，失敗不推翻已寫入／刪除；E receipt 與既有 C creation receipt 均不隨資源刪除移除。詳細契約見 [Mobile E3](../../mobile/docs/BACKEND_CONTRACT.md#e3-支出維護)。

## E4 共用還款服務

`paymentWrite.ts` 抽離 Web cookie，Web／Mobile 共用金額到分、成員及 trip fence／snapshot 交易；`calculateSettlementDetail` 抽出原結算計算供兩種讀取使用。Mobile context 與 HMAC 在同一快照產生，payment／終局 receipt／一次活動及站內通知同交易；重播先重授權，不重做副作用，撤銷保留建立 receipt。提交後外部通知／快取失敗不推翻成功；Web 不再因 populate 失敗回報已提交為失敗。沿用既有索引與 schema，沒有新增 migration；完整 API 與邊界見 [E4](../../mobile/docs/BACKEND_CONTRACT.md#e4-登記與撤銷還款)。

## G1a 旅行管理

`tripManagement.ts` 抽出 Web update／archive action 的旅行修改與本人封存，Mobile settings／PATCH／archive adapter 共用同一 parent fence／snapshot transaction。地點／date-only／部分日期與 auto 相片重綁規則保留；Mobile 比較原始旅行資料 HMAC 或本人封存 HMAC，再於交易寫入資料及 E receipt。重播先檢查目前成員資格，降權不推翻原成功，新編輯的降權保存可查拒絕；結果查詢沿用 `readTripMutation`。提交後讀取／快取不推翻成功。契約見 [G1a](../../mobile/docs/BACKEND_CONTRACT.md#g1a-旅行資料與個人封存)。

## G1b 成員管理

`memberManagement.ts` 共用 Web 虛擬建立與 Mobile 全名冊／建立／更名；父旅行交易重新授權管理員及比對名冊 HMAC，User／membership／receipt 原子提交。更名寫入 User fence 與跨旅行認領競爭，保留所有帳務參照；已提交 Web cache 失敗仍成功。`settlementRead` 只在內部 detail 攜帶虛擬旗標索引，public／Web DTO 明確排除，成員 HTTP mapper 才輸出可選旗標。端點／恢復規則見 [G1b 契約](../../mobile/docs/BACKEND_CONTRACT.md#g1b-成員與虛擬成員)。
