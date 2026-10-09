# 架構摘要

本頁保留理解現有功能所需的結構。產品能力見 [FEATURES.md](FEATURES.md)，安裝與環境設定見 [專案 README](../README.md)。

## Workspace 邊界

此應用位於 `apps/web`（`@travel-budget/web`），原生 App 位於 `apps/mobile`；兩者在同一 repository 維護、各自版本與發布。Web 仍擁有業務後端、MongoDB models、migrations 與外部服務。B1 提供 `/api/v2` 帳本契約，B2 Web／B3 Mobile 已接新版帳本讀寫；B5d-1 起 Mobile 只送 v2，B5d-2 已刪除原生 `/api/v1`。跨應用文件見 [repository 入口](../../../docs/README.md)。

共用 [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts) 只包含 API DTO、Zod runtime schema 等可供原生使用的契約，透過 `@travel-budget/contracts` 匯入。它不包含 Mongoose、Server Actions 或 server SDK。Web 的 [contract.ts](../src/lib/mobile/contract.ts) 只保留薄 adapter。

依賴在根目錄使用共用 lockfile 安裝；Node.js 使用 24。Web 開發、測試、migration 與 PWA 指令在 `apps/web` 執行，或從根目錄使用 `pnpm --filter @travel-budget/web <script>`。Web 版本仍由本目錄的 `package.json.version` 注入。

## 核心資料流

Next.js App Router 與 React 組成介面，TanStack Query 負責查詢、重新整理及瀏覽器快取。主要業務操作透過 Server Actions，資料由 Mongoose 存入 MongoDB；API routes 另處理 AI 草稿、公開分享、匯率與排程等入口。

| 程式位置                             | 職責                                  |
| ------------------------------------ | ------------------------------------- |
| [src/app](../src/app/)               | 頁面、路由與 API                      |
| [src/components](../src/components/) | 旅程、支出、統計、相簿等介面          |
| [src/actions](../src/actions/)       | 業務操作、授權與資料寫入              |
| [src/hooks](../src/hooks/)           | 表單協調、查詢與快取更新              |
| [src/models](../src/models/)         | 帳號、旅程、支出、還款及其他資料模型  |
| [src/lib](../src/lib/)               | 分帳、權限、儲存、通知、AI 與離線同步 |
| [src/i18n](../src/i18n/)             | 繁中、簡中、英文、日文                |
| [migrations](../migrations/)         | 資料結構、索引與回填遷移              |

## 主要資料關係

- **旅程**：包含成員、角色、幣別設定及每位成員的私人預算；行程日、支出、還款、相簿、清單與筆記歸屬旅程。
- **支出與結算**：支出記錄付款人、原幣、匯率與各成員分攤金額；結算依餘額與已登記還款產生轉帳建議，B1 模型可固定旅程基準幣別，缺欄位的舊資料為 TWD；Web 已支援讀寫既有非 TWD 帳本，新建開關仍關閉。規則與交易隔離見 [B1 API](MOBILE_API.md#b1-基準幣別契約)。
- **個人資料**：統計彙整個人分攤；飛行與住宿紀錄屬於使用者，刪除旅程只解除終身紀錄的旅程關聯。
- **檔案**：收據、票券及相簿透過 R2 儲存，資料庫保存物件 key；公開相簿使用移除位置資訊的獨立副本。

## 維護時必須保留的契約

- JWT 搭配 httpOnly cookie 驗證身分。每個旅程操作自行檢查成員與角色；Server Actions 回傳 `ActionResult<T>`，輸入由 Zod 驗證。
- 公開分享採獨立資料邊界：不輸出私人預算、收據或成員限定筆記；公開相簿不輸出位置、EXIF 或內部 key。
- 行程與跨資料集合的寫入使用交易及衝突檢查，需要支援交易的 MongoDB replica set 或 sharded cluster。刪除相關資料須明確處理，外部檔案清理由持久化工作補送。
- AI 只產生可編輯草稿，使用者確認後才走既有寫入流程；行程匯入限 admin，支出草稿限成員。支出文字／收據草稿入口由伺服器啟用 v2 帳本授權，支援既有非 TWD 旅行，仍先核對成員與收據 key 歸屬、不寫帳務；三種 AI 入口共用每日使用量及成本限制；模型設定、格式相容性與正規化入口見 [AI 維護與測試](AI.md)。
- Service worker 快取頁面與資源；查詢快取及離線新增支出保存於 IndexedDB。不可快取 Server Action POST 或 API 寫入；改變持久化快取格式時須更新 `PERSIST_BUSTER`。
- 新增介面字串須補齊四語。路由不帶語系前綴，路徑使用 [routes.ts](../src/constants/routes.ts) 的 builder。
- PWA 需以 `pnpm build`（webpack）及 `pnpm start` 驗證；開發模式不啟用 service worker。

細部設計、資料庫遷移操作與子系統注意事項已收進 [封存索引](archive/README.md)，修改相關子系統時可按需查閱。

## B2 Web 帳本與恢復

旅程頁首、支出／四種分攤、本人預算、結算與部分還款均使用回應的 `ledger.baseCurrency`，包含 JPY 在內一律保留兩位帳本小數。匯率是每一單位原幣換得多少基準幣；原幣等於基準時固定 1。參考匯率共用後端日快照，Web 表單以 GET `/api/exchange-rates` 取得可由 SW 快取的公開快照，再復用共用純函式換算基準；日期不同或缺值不推導，快取保留公布日期，缺離線快取時顯示失敗。一般成員可記帳／代記還款與設定本人預算；幣別設定只供管理員修改，不能改建立時固定的基準。只修改支出說明／分類／日期時保留原額、原幣、完整匯率、分攤及附件／標籤／行程關聯。

跨旅行統計、金額排序／分頁及年度回顧按帳本幣別分組，不加總混合幣別。旅行列表、跨旅行統計與年度回顧的子文件單位驗證按幣別批次查詢，每批固定兩次索引探查，仍逐一核對成員預算；年度回顧也檢查所有目前名冊成員的預算，任一單位與旅程基準不符便拒絕整頁帳務讀取，與 stats 相同。讀取 action 保留 LEDGER_DATA_INVALID 等帳本錯誤碼，不轉為可重試的 INTERNAL_ERROR。CSV／Markdown 欄位明示基準及原幣／匯率，JSON 支出匯出使用 `{ version: 2, ledger, expenses }`，空匯出也保留單位；結算輸出帶單位。年度回顧 PNG 依目前選取幣別輸出。既有 PDF 是行程閱讀器，沒有帳務金額，不新增帳務 PDF。結算與旅行統計首版只顯示基準，不換算成第三種幣別。

Web 畫面只透過在 v2 context 執行的 Server Action 身分（`withLedgerAuth`，如 `getLedger*`、`createLedgerExpense`）及 `/api/public/v2/trips/:code/*` 分享 adapter；舊版 bundle 用的 v1 Server Action 身分已於 B5d-3 刪除。舊公開路徑 `/api/public/trips/*` 已於 B5e 刪除（404）。AI 草稿與行程匯入 route 也在 v2 context 讀旅行（行程匯入於 B5e 補上，非 TWD 旅行不再回 500）。共用服務只有一套 v2 路徑：v1 分支已於 B5 後續整理移除，`lib/ledger.ts` 不再提供版本判斷，沒有 context 時需要單位的讀寫直接回 `LEDGER_DATA_INVALID`，不會退回 v1；不接受 header 切換單位。無版本的 receipt 是 v1 留下的，查詢或重送都回 `CLIENT_UPGRADE_REQUIRED`。寫入的首次回應即是保存的終局（含 `ledger`），重播結果與首次相同。新版公開財務讀取使用唯一 URL 與 no-store，避免舊 service worker 回傳 TWD 快取；公開輸出仍不含私人預算、收據 key 或私人 revision。11 組公開 v2 route 使用中立 handler（唯讀快照 `lib/publicTripReads.ts`、匿名認領 `lib/publicMemberClaims.ts`），以 `withPublicLedgerV2` 在帳本 context 執行，不讀 session。PWA 離線佇列中缺 `contractVersion` 的舊紀錄（舊 bundle 存的 v1 body）只解碼列出、不再送出，也不計入本機預估，僅能由使用者匯出或明確捨棄。

建立／加入、修改／刪除支出、登記／撤銷還款及預算／幣別設定先將固定 UUID、原 body、版本、單位及 revision 存入帳號／環境隔離的 IndexedDB，才查詢原 receipt；只有 `not_found` 重送相同操作。不明結果保留，透過全域恢復提示補查，不換 UUID 或讓使用者捨棄。明確的寫入拒絕（包含服務驗證前拒絕）先將 journal 終局保存為 rejected，再解除旅行保留，允許使用者修正並重新確認。手動恢復被拒時，保留四語說明直到使用者關閉提示；關閉不刪除 journal，結果不明仍可補查。receipt 補查的拒絕不能推斷原寫入失敗。C 新增只呼叫一次寫入 action，由服務先查原 receipt，再於交易內核對，避免瀏覽器重複補查。終局衝突重讀後須再次確認；支出、設定與結算各有 HMAC revision。修改／刪除活動與 receipt 同交易，重播不增加紀錄。設定使用同一 `actor:UUID` receipt 唯一 namespace，其 Web 專用 operation 為 `budget.set`／`currency.set`。

同旅行的 Web C 支出佇列與新版操作共用原子寫入保留紀錄；結果未知不自動到期，只在終局落盤後釋放；若頁面在落盤與釋放之間關閉，下一筆操作依相同 UUID 的已保存終局解除保留。伺服器要求的等待期限按帳號保存，receipt 補查／C 送出也遵守；保存期限失敗仍保留記憶體期限。登出停止目前世代，原 UUID 與終局歷史保留給原帳號，以便恢復並解除中斷的保留紀錄。query cache 的 `PERSIST_BUSTER` 更新為帳本版，C outbox 在淘汰舊讀取快取前恢復；舊 C body／UUID 保留供匯出或明確捨棄，不再送出。雙分頁留下較舊讀取快取時，使用其後已保存且同單位的提交基線恢復摘要；較新的快取不被舊基線覆蓋。

新版未送出支出草稿的 key 包含 origin／帳號／旅行／單位／版本。舊未分帳號 LocalStorage 草稿留在原 key，顯示不含內容的提示，**不自動載入或改寫**，避免跨帳號顯示；已確認 outbox 照原 UUID 恢復。非 TWD 新增需連線，斷線可保留未確認表單，不降級為 TWD。其他操作只在確認後持久化，不新增離線授權。

非 TWD 建立仍由伺服器能力及 `ENABLE_NON_TWD_LEDGER` 控制，預設關閉。B3 Mobile 已實作；B4 獨立 Web／iPhone／iPad 操作、PWA 升級矩陣及精確 DB 核對仍待完成；Android 延後。工程檢查與剩餘驗收集中於 [B 交接](../../mobile/docs/LOCAL_ACCEPTANCE.md#b-基準幣別驗收b1b2b3-實作交接)。

## 手機 HTTP adapter

`src/app/api/v2` 是原生用戶端入口（`/api/v1` 已於 B5d-2 刪除），`src/lib/mobile` 管理獨立 bearer session、錯誤 envelope 與 DTO 組裝；輸入與回應 schema 由 `@travel-budget/contracts` 匯入。`credentials.ts`、`tripListRead.ts` 同時供 Web Server Actions 與手機呼叫；摘要重用成員權限及 `tripShellRead`／`tripListSummary`。支出清單／明細（`lib/mobile/expenses.ts`）重用 `toExpenseDto` 與 `Expense` 索引，結算（`lib/mobile/settlement.ts`）重用 `readSettlementDetail`（`readSettlement` 的成員 id 版本，原回傳不變）；兩者先經 `lib/mobile/access.ts` 驗證成員 ObjectId，再讀資料。手機簽章與 Web cookie 隔離，MongoDB 儲存 refresh 雜湊與撤銷狀態。`/api/v2` 帳本 route 經 `lib/mobile/ledgerHttp.ts` 回應，每個 method 明確宣告輸出 schema 與單位模式（`trip` 注入目前旅行 ledger、`service` 保留服務的逐列／receipt ledger、`none` 為無 ledger 的身分回應），不依 URL 推斷。auth／me 入口經 `lib/mobile/auth.ts`；同一 session、限流與單次 refresh 輪替。24 個會員業務 route 只選 v2 輸出 schema，登入驗證、讀參數與服務呼叫集中在 `lib/mobile/operations.ts` 的具名操作；`lib/mobile` 不再有 v1 分支，B5e 已移除無呼叫服務與舊公開路徑，共用 `lib/*` 的非 v2 分支保留作後續整理。詳細安全邊界及 OpenAPI 見 [手機 API](MOBILE_API.md)。

新增支出只有一個寫入服務：`lib/expenseCreate.ts#createExpenseForActor` 接受已授權的旅行與操作者及 `createExpenseSchema` 的輸出，內含 `withTripWrite` 交易、成員／分攤／金額驗證、收據驗證、與支出同交易提交的冪等 receipt（`expenseCreateRequest.ts`）及通知／outbox 副作用；v2 合法請求的業務驗證拒絕也在 parent fence 交易內保存終局 receipt，已有提交／拒絕優先重播，未知故障仍回滾，不改 v1。且不 import `next/*`。Web Server Action（`expense.actions.ts#createLedgerExpense`，cookie）與手機 HTTP（`lib/mobile/expenseWrite.ts`，bearer）是它的兩個 adapter：各自驗證登入、解析旅行與輸入、處理自己的快取／排程並對照錯誤碼。成員順序（`lib/mobile/expenseOptions.ts`）與 Web 成員清單相同，四模式預覽重用 `computeLedgerSplits`，HTTP 先以共用契約嚴格驗證數值，手機不複製金額演算法；完整預覽與歷史資料決策見 [G3a-1 契約](../../mobile/docs/BACKEND_CONTRACT.md#g3a-1-進階分攤預覽)。

[packages/contracts/openapi.json](../../../packages/contracts/openapi.json) 是共用契約產物；在 repository 根目錄執行 `pnpm contracts:generate` 更新、`pnpm contracts:check` 檢查同步。Vercel 使用 Root Directory `apps/web`，啟用 outside-root source files 以建置共享契約；本目錄 `vercel.json` 保留既有 cron。

`lib/tripEntry.ts` 提供 E1 Web／Mobile 共用建立／加入交易。獨立 `mutationrequests` 以操作者／UUID 唯一 `_id` 保存成功／終局拒絕；建立、成員更新與站內副作用同交易；活動寫入使用獨立物件，避免 driver 回填 `_id` 汙染多收件人通知，安全亂數邀請碼使用既有唯一索引。加入先以有效碼取得旅行 fence；重播／查詢須重新核對目前成員，已移除者不能再次加入。外部通知在提交後執行、重播不排程，不影響已提交結果。Web 加入結果補讀將目前成員與刪除狀態納入同一查詢；Web 建立僅回傳已提交的旅行 ID，畫面以 ID 接續，不因提交後讀取失敗重新建立。E3 已擴充帳務 receipt／revision；E4 還款已接續同一 receipt。

## E2 共用帳號服務

`accountEntry.ts` 供 Web cookie adapter 與 `/api/v2/auth` 匿名 adapter 共用註冊／寄碼／重設規則。`accountAdapter.ts` 只取得 DB、可信來源與寄信。註冊由既有 username／Email 的不分大小寫唯一索引防併發，Web cookie 副作用失敗不推翻已建立帳號；HTTP 不建 session。寄碼配額與 reset-code 建立、密碼更新／碼消耗使用 replica-set 交易，未到期且錯碼未滿五次的碼不得更換或延長期限（含舊部署建立的碼）；鎖死碼允許在上次寄碼 60 秒後更換，仍保留小時配額，錯誤嘗試也原子提交，寄信在提交後且不印驗證碼。

`accountentryattempts` 以 HMAC key 原子保存滑動時窗與冷卻，註冊／寄碼來源共用限流、Email 與驗碼另限；寄碼間隔對齊 15 分鐘有效期，避免匿名請求換掉仍可使用的碼，鎖死碼的 60 秒例外仍受每小時五次配額限制。已知／未知 Email 的碼期限與錯誤計數一併保存於 HMAC 計數文件，確保恢復例外回應一致。拒絕不消耗寄碼配額或延長原期限，未知 Email 使用同樣間隔與計數；寄信失敗亦須等原期限後再寄。可信來源只解析 Vercel 覆寫的單一 IP header；其他部署保留帳號／Email 限制。Email 共用驗碼額度被耗盡的定向阻斷仍未解決，後續防護見 [E2 契約](../../mobile/docs/BACKEND_CONTRACT.md#e2-註冊與-email-驗證碼重設)。契約及 migration 見 [手機 API](MOBILE_API.md#e2-匿名帳號入口)。

## E3 支出維護服務

Web update／delete action 抽成 `expenseMaintenance.ts` 的 actor service，保留進階欄位與附件驗證；Mobile adapter 使用同模組的嚴格 basic／equal 操作。`withTripWriteInDatabase` 與既有 writer 共用 parent fence／snapshot transaction，context 與 HMAC token 取自原始 BSON，前條件、expense／comment／retirement／活動及 E receipt 在交易內處理。對 body 不同的 UUID 衝突不覆蓋原結果；終局拒絕也同交易，receipt 讀取對其 tripId 重授權。Web v2 更新先核對既有 receipt，資源被刪除的新更新保存 RESOURCE_GONE；已提交重播不依賴資源或附件繼續存在。更新成功的 revision 從交易內實際保存的 BSON 計算，與下一次讀取一致。

清理與快取在提交後，失敗不推翻已寫入／刪除；E receipt 與既有 C creation receipt 均不隨資源刪除移除。詳細契約見 [Mobile E3](../../mobile/docs/BACKEND_CONTRACT.md#e3-支出維護)。

## E4 共用還款服務

`paymentWrite.ts` 抽離 Web cookie，Web／Mobile 共用金額到分、成員及 trip fence／snapshot 交易；`calculateSettlementDetail` 抽出原結算計算供兩種讀取使用。Mobile context 與 HMAC 在同一快照產生，payment／終局 receipt／一次活動及站內通知同交易；重播先重授權，不重做副作用，撤銷保留建立 receipt。提交後外部通知／快取失敗不推翻成功；Web 不再因 populate 失敗回報已提交為失敗。結算及還款確認頁的讀取使用授權、子資料驗證與 HMAC 同一份只讀 snapshot，不遞增父旅行 fence；真正寫入仍使用原 fence 與最新 revision 核對。沿用既有索引與 schema，沒有新增 migration；完整 API 與邊界見 [E4](../../mobile/docs/BACKEND_CONTRACT.md#e4-登記與撤銷還款)。

## G1a 旅行管理

`tripManagement.ts` 抽出 Web update／archive action 的旅行修改與本人封存，Mobile settings／PATCH／archive adapter 共用同一 parent fence／snapshot transaction。地點／date-only／部分日期與 auto 相片重綁規則保留；Mobile 比較原始旅行資料 HMAC 或本人封存 HMAC，再於交易寫入資料及 E receipt。重播先檢查目前成員資格，降權不推翻原成功，新編輯的降權保存可查拒絕；結果查詢沿用 `readTripMutation`。提交後讀取／快取不推翻成功。契約見 [G1a](../../mobile/docs/BACKEND_CONTRACT.md#g1a-旅行資料與個人封存)。

## G1b 成員管理

`memberManagement.ts` 共用 Web 虛擬建立與 Mobile 全名冊／建立／更名；父旅行交易重新授權管理員及比對名冊 HMAC，User／membership／receipt 原子提交。更名寫入 User fence 與跨旅行認領競爭，保留所有帳務參照；已提交 Web cache 失敗仍成功。`settlementRead` 只在內部 detail 攜帶虛擬旗標索引，public／Web DTO 明確排除，成員 HTTP mapper 才輸出可選旗標。端點／恢復規則見 [G1b 契約](../../mobile/docs/BACKEND_CONTRACT.md#g1b-成員與虛擬成員)。

## G1c 存取管理

`tripAccess.ts` 在父旅行交易內核對最新 HMAC／角色，角色寫入共用 Web 服務；移除／退出與刪除分別復用 `memberRemoval`／`tripDeletion` 的交易內業務，保留帳務或完整 cascade 的界線不變。角色／移除／刪除 Web action 的提交後 revalidate 失敗仍成功。最小成功退出／刪除 receipt 以操作者 UUID 保留、可於資格消失後讀／重播，沒有延伸其他 receipt 的撤權邊界。認領連結 adapter 重新授權 admin／虛擬成員，仍由 Web public 身分服務驗證對方憑證與遷移帳務。端點與邊界見 [G1c 契約](../../mobile/docs/BACKEND_CONTRACT.md#g1c-權限與危險操作)。

## G2a 幣別設定與參考匯率

`currencySettings.ts` 將既有 Web 正規化與父旅行交易抽為共用服務；`tripManagement.ts` 用獨立 currency HMAC 檢查版本、重新授權 admin，與 `trip.currency` receipt 原子提交，既有支出與已確認內容不回溯更新。Web cache revalidate 失敗不把已提交操作回報失敗。`referenceRates.ts` 共用既有 Frankfurter 每日代理，Web public 與 Mobile bearer adapter 維持各自 envelope／no-store 邊界，沒有新增供應商或 remote 設定。端點、缺值與恢復規則見 [G2a 契約](../../mobile/docs/BACKEND_CONTRACT.md#g2a-旅行幣別與參考匯率)。
