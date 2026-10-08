# 手機 API

**待實作**：[旅程基準幣別 B0–B4 規格](../../mobile/docs/ROADMAP.md#b旅程基準幣別改造規格2026-10-08) 定義 v2 明確單位、v1 安全阻擋與共用服務改造；目前仍只有既有 v1／TWD 能力，不代表 v2 已可呼叫。

G1c 另提供成員管理 context／角色、移除、本人退出及旅行刪除，與僅管理員可讀的虛擬認領連結。共用交易／cascade／版本及最小退出 receipt 的狹義授權例外見 [G1c 契約](../../mobile/docs/BACKEND_CONTRACT.md#g1c-權限與危險操作)；Web 認領憑證流程沿用既有實作，手機只複製／分享能力連結。

已在程式碼加入 `/api/v1` 的登入、更新憑證、登出、目前使用者、旅行列表、旅行摘要、支出清單／明細與結算，以及線上新增支出所需的成員資料、均分預覽、冪等新增與結果查詢。這不代表遠端環境已部署。契約以 [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts) 的 Zod schema 為單一來源；Web 與手機透過 `@travel-budget/contracts` 匯入，Web 的 `src/lib/mobile/contract.ts` 只保留薄 adapter。共用產物見 [OpenAPI](../../../packages/contracts/openapi.json)，在 repository 根目錄執行 `pnpm contracts:generate` 產生、`pnpm contracts:check` 檢查同步。

- Web Server Actions 與手機 HTTP handler 在後端共用 `credentials.ts`、`tripListRead.ts` 及既有權限／金額摘要；HTTP handler 不呼叫依賴 cookie 的 Server Action，手機 bundle 不匯入這些後端模組。
- 手機 access JWT 15 分鐘、裝置 session 絕對期限 30 天；JWT key、issuer、audience 與 Web cookie 隔離。每次授權查詢 session 撤銷／期限與目前密碼 fingerprint。
- refresh token 僅存雜湊，輪替採原子 compare-and-swap；有效舊 token 重放會撤銷該 session。原生端須合併併發 refresh，refresh 回應遺失時可能需要重新登入。
- 登出使用 refresh token，因此 access token 過期仍能撤銷；登出不影響其他裝置或原有 Web cookie。密碼變更／重設會讓手機 session 失效。
- 登入每帳號每 15 分鐘時段最多 10 次，429 提供 Retry-After。此限制不是全面的流量防護；部署時仍沿用平台流量管理。
- 成員 API 只接受 bearer，拒絕 Web cookie 或 public share code。回應白名單不包含其他人的預算、分享碼、收據／檔案 key。`budgetTotal` 只屬於 viewer。
- 日期為 `YYYY-MM-DD`，`date` query 表示手機當地日期。金額由現有服務算到分，以 TWD 回傳；`myBalance` 正為應收、負為應付。
- 旅行列表共用 Web 全列表讀取，HTTP 每頁 20 筆；DB 計算未改為游標分頁。正在旅行優先，已封存最後。分頁非快照，資料變更後從第一頁重讀。
- 支出清單 `GET /trips/:id/expenses?cursor=` 每頁 20 筆，依 `date`、`createdAt`、`_id` 降冪；游標 `<date ms>.<createdAt ms>.<id>` 編碼最後一筆的實際儲存值，查詢以 `$or` 取其後的資料（沿用 `{trip, date, createdAt}` 索引，不新增索引或 migration；以 `_id` 破同分需記憶體排序），同日同時間也不會漏筆或重複。無效或重複的游標回 400。分頁非快照，下拉更新從第一頁重讀。
- 明細 `GET /trips/:id/expenses/:expenseId` 以旅行加支出 id 查詢，其他旅行的支出回 404。清單與明細重用 `toExpenseDto` 的到分取整與分攤正規化，再映射為明確白名單 DTO：只 populate 顯示名稱與 isVirtual，投影排除附件、標籤、行程關聯與送達狀態，不輸出登入帳號、Email 或分享碼。類別未知歸為 `other`；付款人或分攤成員參照已不存在時 id 為 `null`、名稱為空；授權清單／明細新增可選 `payerIsVirtual`、明細分攤可選 `isVirtual`（解析到的使用者旗標），不改 Web／public DTO 或 receipt，舊回應缺旗標仍可讀；不代表目前旅行成員資格。缺少原幣欄位的歷史資料以 TWD 金額、`TWD`、匯率 1 補齊。
- 結算 `GET /trips/:id/settlement` 由 `readSettlementDetail` 提供：`readSettlement` 的原有輸出不變（公開路由仍只含原欄位；Web 成員頁以 `readMemberSettlement` 保留轉帳的成員 ID），另加以成員 id 標示的 `transfers`，因為 `transactions` 只有顯示名稱而同名成員無法辨識。`suggestedTransfers` 是已扣除還款後的建議、皆未付款；`status` 為 `empty`、`settled` 或 `outstanding`，任何餘額未歸零即為 `outstanding`。每次仍讀取整個旅行的支出與還款。
- 上述端點只接受成員 ObjectId（`lib/mobile/access.ts`）：非成員、分享碼、格式錯誤、不存在與他旅行資源一律 404，授權先於讀取，失去成員資格立即生效。
- 原生 API 無跨來源瀏覽器 CORS；現有 Web 不遷移至此認證流程。所有成功／錯誤回應均 no-store。

### 線上新增支出

- **共用服務**：Web Server Action（cookie）與 HTTP（bearer）都呼叫 `lib/expenseCreate.ts` 的 `createExpenseForActor`。兩個入口只負責驗證登入、解析旅行、解析輸入與各自的快取／排程（`after` 以參數注入，服務不 import `next/*`）；成員檢查與 `withTripWrite` 交易、成員／分攤／金額驗證、收據驗證、與支出同一交易提交的冪等 receipt，以及通知／活動／outbox 副作用只有一套。提交後的副作用失敗只記錄，不會把已入帳的支出回報成失敗（原本傳統通知路徑的 `revalidatePath` 沒有隔離，已一併修正）；重播在交易前後都不重複任何副作用。
- `GET /trips/:id/expense-options` → `{ members: [{ id, displayName }], categories }`。成員依加入時間排序（同刻依儲存順序）、含虛擬成員、略過已不存在的帳號，不含登入名稱；順序與 Web 成員清單（`getMembers`）相同，並固定為均分尾差的順序。
- `POST /trips/:id/expenses/preview`，body `{ amount, member_ids }`（TWD、至多兩位小數、至多 1,000,000,000.00、成員不可重複）→ `{ amount, splits: [{ userId, displayName, shareAmount }] }`。呼叫 Web 表單使用的 `computeSplits('equal')`，結果一律依 options 順序、與請求順序無關：100 元三人為 33.34／33.33／33.33，0.01 元三人為 0.01／0／0，加總恆等於金額。唯讀：不寫資料、不保留交易，也不代表日後一定能寫入；不屬於旅行的成員回 400。
- `POST /trips/:id/expenses` 的欄位沿用 Web 輸入名稱：`client_request_id`（UUID，必填）、`payer_id`、`original_amount`、`currency`（只接受 `TWD`）、`exchange_rate`（只接受 `1`）、`description`（trim 後 1–200 字）、`category`、`date`（真實日曆日）、`splits[{ user_id, share_amount }]`（1–100 位、成員不可重複、至多兩位小數、可為 0；付款人可不在其中）。請求為 snake_case、回應為 camelCase DTO：這是為了與 Web 共用輸入驗證而刻意的不對稱。附件、標籤、行程關聯等未支援欄位一律 400，不被忽略。金額須為正值；金額與每份分攤至多兩位小數、不超過單筆上限 1,000,000,000.00（共用取整從約 8.8e12 起不再原樣保留分格上的值，上限留有餘裕），超過回 400 並不寫入；到分為安全整數。成功與重播都回 200 `{ data }`，內容與支出明細相同（白名單 DTO）。
- 不信任預覽或按鈕：服務內會再驗證付款人與分攤成員屬於旅行、加總等於金額（容差一分並把尾差分配掉）、日期為真實日曆日（V8 會把 `2026-02-31` 悄悄滾成 3 月 3 日，不能只靠格式檢查）、成員不重複、金額與每份分攤不超過單筆上限（換算後溢位也拒絕）、原始金額到分為安全整數。這些檢查同樣套用在 Web 新增。
- `GET /trips/:id/expense-requests/:clientRequestId` → `{ status: 'committed', expense }` 或 `{ status: 'not_found' }`，只查本人在此旅行的結果。`not_found` 只代表沒有 receipt，不代表同 key 的請求不在執行，應以原 key 與原內容重試。支出之後被刪除仍是 `committed`（回傳提交當時的內容，不會重新建立）。
- 狀態碼：200 已入帳（含重播）。**任何 4xx 都代表此請求沒有寫入**：400 輸入或成員／金額驗證錯誤、401、404（非成員、失去資格、分享碼、不存在；授權先於讀取 body）、409 `IDEMPOTENCY_CONFLICT`（同 key 不同內容，須查明原請求，不要換 key）、413（8 KiB）、415。429 `BUSY` 表示交易因競爭而中止、尚未提交，附 `Retry-After`，以同 key 重試。**5xx、逾時與斷線代表結果不確定**：以 `expense-requests` 查詢，或以同 key 同內容重試。回應的 `requestId` 只是診斷編號，不能取代 `client_request_id`。
- 重播前仍重新授權：失去成員資格者不能重播也不能查詢。比對的是請求內容與提交時的指紋，不依目前成員或預覽重算。receipt 與支出同一交易提交，不隨支出刪除、不設 TTL；`client_request_id` 不分大小寫，但 receipt 的 `_id` 與指紋維持升級前的格式（key 保持送出時的大小寫、指紋為 schema 解析後輸入的 SHA-256），所以舊紀錄無須遷移、也可回滾；重播與查詢先找以送出的拼法儲存的 receipt，找不到再在同一旅行、同一操作者的 receipt 範圍內不分大小寫比對（索引範圍只含該操作者在該旅行的紀錄，不隨整個 collection 變慢），所以同一個 UUID 的任何拼法（全小寫、全大寫、任意混合）都對應同一筆結果；指紋以 receipt 儲存的拼法重算，舊版本寫入的紀錄因此仍可比對。
- 同時刻同旅行的寫入透過 `withTripWrite` 的 trip fence 序列化；八個併發的相同請求只提交一次並得到相同結果。

新增 `20261002100000-mobile-session-expiry.js` 為 session／登入限制紀錄建立 TTL 索引。此次實作不執行遠端 migration；正式環境沿用既有 migration 流程。即使 TTL 尚未清理，授權仍會檢查 expiresAt。

測試在 `apps/web` 執行：`pnpm exec vitest run src/__tests__/mobileSession.test.ts src/__tests__/mobileTrips.test.ts src/__tests__/mobileHttp.test.ts src/__tests__/mobileExpenses.test.ts src/__tests__/mobileSettlement.test.ts src/__tests__/settlementRead.test.ts src/__tests__/mobileExpenseWrite.test.ts src/__tests__/expenseCreateRequest.test.ts src/__tests__/expenseAmountRange.test.ts src/__tests__/expense.actions.test.ts`。這組單元測試使用隔離的 model mocks；`expense.actions.test.ts` 同時鎖定 Web 新增沒有行為退步。`mobileReadApi.integration.test.ts` 在獨立測試 MongoDB 上驗證游標分頁、與 Web 讀取一致、歷史／外幣／虛擬成員資料與授權，需 `MONGODB_QUEUE_TEST_URI` 與 `MONGODB_QUEUE_TEST_ALLOW_WRITES=1`（CI 的真 MongoDB 工作已包含），未設定時略過。新增支出需要交易，`mobileExpenseWrite.integration.test.ts` 因此要在**單節點 replica set** 上執行，沿用其他 trip writer 整合測試的 `MONGODB_MEMBER_TEST_URI`（例如 `mongodb://127.0.0.1:27017/?directConnection=true`）與 `MONGODB_MEMBER_TEST_ALLOW_WRITES=1`，CI 的 `expense-writes` 工作會啟動 replica set 並同時執行 `tripWriters.integration.test.ts`。它驗證預覽到新增的固定順序均分、與 Web 的互讀一致、八個併發相同請求只提交一次且副作用不重複（含不同大小寫與十六種不同拼法、Web 與手機兩個入口混合）、同 key 不同內容 409、刪除或失去成員資格後的重播／查詢、以獨立建出的舊格式 receipt 與本版寫入的 receipt，在小寫、大寫與兩種混合拼法的每一種組合下的重播／查詢／409／刪除後不復活，以及以 explain 確認不分大小寫的查詢只掃該操作者在該旅行的索引範圍、單筆上限內的金額從預覽到儲存與結算逐分一致、超過上限的請求不留資料、回滾（receipt 或支出寫入失敗不留任何資料）與無效輸入不留 receipt。另可執行 `pnpm test:mobile-api`，以可丟棄的 Docker MongoDB 與 Next.js 開發伺服器驗證實際 HTTP／資料庫流程（資料庫現為單節點 replica set，涵蓋上述新增流程並以獨立計算的預期值核對儲存結果，另模擬回應遺失：伺服器仍提交、以 key 查得、重送不重複）；`pnpm dev:mobile-api` 保留環境與測試帳號供裝置連線，已開著的舊環境不是 replica set，需重啟才能使用新增 API。手機 SecureStore 與 iOS／Android 真機串接仍需操作驗收，詳見 [本機驗收流程](../../mobile/docs/LOCAL_ACCEPTANCE.md)。

手機畫面已使用上述新增端點，提供 TWD 均分預覽、確認與 SQLite 待確認恢復；現況與裝置驗收見 [手機功能](../../mobile/docs/FEATURES.md) 與 [本機驗收](../../mobile/docs/LOCAL_ACCEPTANCE.md)。D 的離線均分確認／前景待送佇列已實作；尚無附件上傳、非均分新增／金額編輯、推播或帳號刪除 API。

`dev:mobile-api` 的獨立 loopback 控制通道供 Maestro 撤銷／到期隔離帳號的 session，採每次執行的隨機憑證並隨環境關閉。它只在測試腳本內存在，不加入 Next.js routes 或共用契約，也不隨 `--lan` 對外開放。

Web／後端 workspace 名稱為 `@travel-budget/web`；在根目錄可用 `pnpm --filter @travel-budget/web exec vitest run <test-path>`。依賴使用根 lockfile，版本與環境設定仍屬各 app。手機程式現在位於同 repository 的 `apps/mobile`；既有 `travel-budget-mobile` repository 已棄用。

## E1 旅行建立／加入

新增 `POST /trips`、`POST /trips/join`、`GET /trips/:id/invitation` 與 `GET /mutation-requests/:uuid`，現行契約以共用 schema／OpenAPI 及 [Mobile 契約](../../mobile/docs/BACKEND_CONTRACT.md#e1-旅行入口與操作-receipt) 為準。`lib/tripEntry.ts` 抽離 cookie，Web／HTTP 共用交易；同帳號 UUID 的 receipt 保留終局結果，成功、成員變更與通知／動態原子提交，重播先重新授權。活動與各收件人通知使用獨立文件，整合測試涵蓋已有兩位正式成員再加入及原 UUID 重播。手機只接受有效邀請碼，Web adapter 保留 ObjectId 相容入口；已加入回成功。

migration `20261006100000-mutation-requests.js` 使用既有 Trip hashCode 唯一索引及 account:uuid 的 `_id` 唯一約束，無 TTL，rollback 不丟 receipt。隔離 `test:mobile-api` 可重跑 migration，核對真 HTTP／交易與資料庫筆數；本次未執行遠端 migration。邀請 URL 由 `APP_URL` origin 產生，只在成員明確取邀請時輸出，列表／landing DTO 不增加碼。後端先部署相容能力與必要索引，再發手機。

## E2 匿名帳號入口

已加入 `POST /auth/register`、`POST /auth/password-reset/request`、`POST /auth/password-reset/confirm`；共用契約、完整限制與狀態碼見 [Mobile E2 契約](../../mobile/docs/BACKEND_CONTRACT.md#e2-註冊與-email-驗證碼重設)。三個入口不讀 Web cookie／bearer、不建 session，成功／錯誤均 no-store。Web action 透過相同 `accountEntry.ts`；新密碼 UTF-8 上限、單次碼消耗與匿名限流同步適用兩端。

來源解析依 [Vercel request headers](https://vercel.com/docs/headers/request-headers#x-forwarded-for)，只在 Vercel 部署信任平台覆寫的單一 IP；本機／其他 hosting 不直接信任 client header。寄碼間隔預設 15 分鐘；碼錯誤滿五次鎖死後，可在上次寄碼 60 秒後更換，仍受小時／來源配額。拒絕不更換仍可用的碼或耗用寄碼配額，寄信失敗也須等待。已知／未知 Email 使用相同間隔，匿名限流不共用帳務帳號等待。migration `20261006120000-account-entry-limits.js` 確保 reset-code unique／TTL、新增計數 TTL；未執行遠端 migration。

`accountEntry.integration.test.ts` 使用 `MONGODB_MEMBER_TEST_URI` 加 `MONGODB_MEMBER_TEST_ALLOW_WRITES=1`，只建隨機獨立 DB 並清除；涵蓋正規化唯一衝突、UTF-8／空白密碼、同碼併發、第五次錯碼、到期／重寄競態、交易回滾、共用限流、Web／HTTP 互登入與舊手機憑證失效。CI 的交易工作已納入。`test:mobile-api` 另核對實際匿名 HTTP、一次重設及丟回應後登入恢復；寄信 adapter 使用 mock 或無正式寄信設定。兩平台 UI／SecureStore 由其他人驗收。

## E3 線上支出維護

新增成員 `edit-context` GET 及單筆支出 PATCH／DELETE，Web／HTTP 的 actor 邊界與交易服務集中在 `expenseMaintenance.ts`。原帳號 mutation receipt 支援 expense.update／expense.delete，回應帶 tripId／expenseId；schema／模式、版本、錯誤與恢復規則見 [Mobile E3 契約](../../mobile/docs/BACKEND_CONTRACT.md#e3-支出維護)。context 使用原始業務欄位 HMAC，unknown category 不套用列表補值，任一 Web 業務修改均使舊確認失效。沿用 E1 receipt `_id` 唯一約束及既有 blob cleanup 設施，不新增遠端 migration。

`expenseMaintenance.integration.test.ts` 使用 opt-in 隔離 replica set；CI 與 `test:mobile-api` 涵蓋 transaction rollback、終局競爭、撤權、保留歷史欄位、刪除清理、socket 丟回應與 C 重播不復活。兩平台畫面由其他人於 E 全部完成後驗收。

## E4 還款

新增成員 payment-context、還款 POST、單筆 revoke-context 與 DELETE；Web payment action 也委派共用 `paymentWrite.ts`。支援任意實際付款的到分驗證、結算／原始還款 HMAC 前條件、終局 UUID receipt、同交易活動與各自獨立 `_id` 的站內通知，測試包含第三位操作者替兩位正式成員記錄部分付款，提交後外部寄送失敗仍成功，重播／撤銷不復活或重複扣抵。完整 schema、錯誤與恢復見 [Mobile E4 契約](../../mobile/docs/BACKEND_CONTRACT.md#e4-登記與撤銷還款)。

`paymentWrite.integration.test.ts` 以 opt-in 隨機隔離 replica set 核對部分／超額／虛擬付款、同 UUID 與不同 UUID 競爭、原始變更、撤權、回滾、撤銷與 Web 共用服務；CI 已加入。`test:mobile-api` 核對真 HTTP／DB 與丟 POST／DELETE 回應，原生成員／四語畫面仍待其他人驗收。沿用 E1 receipt 與既有 payment 索引，不新增 migration／遠端操作。

## G1a 旅行資料與封存

新增 settings GET、旅行 PATCH 與個人 archive POST；成員 Bearer、嚴格 JSON／8 KiB／no-store。僅 admin 可修改資料，任何成員可封存自己；失去 admin 的新操作有終局拒絕，仍可查結果，不當作整趟旅行撤權。獨立資料／本人封存 revision、欄位、最小結果與錯誤見 [共用契約](../../mobile/docs/BACKEND_CONTRACT.md#g1a-旅行資料與個人封存)。Web／HTTP 共用 `tripManagement.ts`，沿用 receipt／父旅行交易及相片 auto 重綁，無新增 migration。`tripManagement.integration.test.ts` 已納入隔離交易 CI；裝置／真機交其他人，未部署。

## G1b 成員與虛擬成員

新增 members GET／POST 及 members/:memberId PATCH；Bearer 成員讀全名冊，管理員才可建立／更名虛擬身分，strict JSON／8 KiB／no-store。Web 虛擬建立與 HTTP 共用 memberManagement，名冊 revision、UUID receipt 及跨旅行認領的 User fence 保留權限／帳務。現任選項與結算歷史補可選虛擬旗標，不改 public DTO。詳見 [共用契約](../../mobile/docs/BACKEND_CONTRACT.md#g1b-成員與虛擬成員)；memberManagement.integration 已納入隔離交易 CI，test:mobile-api 新增真 HTTP 丟 POST／PATCH 回應、重播／撤權及 DB 筆數核對。原生 UI 由其他人驗收，未部署。

## G2a 幣別設定

成員讀取、管理員修改 `/trips/:id/currency-settings`；`/exchange-rates` 以 bearer 取得既有後端每日參考值。共用 Web 設定交易，獨立 revision、UUID receipt 與成員資格重驗；既有支出、舊 App TWD body 不改。真 HTTP 工具另覆蓋幣別設定的嚴格輸入、精度、丟回應／原 UUID 重播、衝突、降權／撤權與帳務保留。來源／缺值／回應細節集中在 [G2a 契約](../../mobile/docs/BACKEND_CONTRACT.md#g2a-旅行幣別與參考匯率)；工具不要求外部匯率供應商即時可用，上游方向／日期與失敗用隔離 mock 測試。

## G2b 外幣新增

expense-options 在同一 Trip 讀取補設定／支援 ISO 清單，preview 新形狀接原額／精確 TWD-per-unit 匯率，沿用 computeSplits 的原幣分角及 TWD 尾差；新增 adapter 放寬 currency／rate 後仍委派既有 createExpenseForActor。舊 TWD preview／body 和舊 receipt 指紋不改；原 UUID 重播不重取任何設定或匯率。輸入、上限及 SQLite 相容語意見 [G2b 契約](../../mobile/docs/BACKEND_CONTRACT.md#g2b-原幣預覽與新增)，本節補充先前 TWD 首片描述。

既有 mobileExpenseWrite.integration 加精確外幣預覽→DB／receipt、零 TWD、小／大匯率及換算上限、併發去重／改設定後重播、原匯率 409 與回滾。test:mobile-api 在自建旅行核對真 socket 丟回應、原 UUID 恢復只一筆支出／receipt、精確匯率、超額及撤權。新草稿／手機 UI 的原生操作另由其他人驗收；不新增 migration 或远端設定。

## G2c 外幣編輯

expenseMaintenance 的 context 在同一 snapshot 帶回幣別選項／精確歷史匯率及 additive recalculate，equal 保留舊 App 的 TWD 語意；PATCH 成對的 currency／exchange_rate 可明確重算外幣，省略仍為原 TWD body／指紋。backend 逐人核對既存 canonical 原幣均分與新請求的 computeSplits、換算上限；非均分或缺歷史資料保持基本編輯，所有 metadata 模式仍保留附件／標籤／行程。完整限制集中於 [G2c 契約](../../mobile/docs/BACKEND_CONTRACT.md#g2c-原幣均分編輯)。

expenseMaintenance.integration 覆蓋 JPY 小數、零 TWD、小／大 rate／換算上限、並發 UUID、副作用／receipt 去重、Web 衝突、撤權及交易回滾；test:mobile-api 在 G2b 自建隔離旅行核對真 PATCH 丟回應、原 UUID 查回／重播、DB／明細精確值及明確轉 TWD。沒有 migration 或遠端操作，iOS 另由其他人驗收。
