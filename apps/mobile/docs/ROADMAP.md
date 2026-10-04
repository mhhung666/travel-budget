# 開發路線

登入、旅行列表與摘要、支出清單／明細與結算（唯讀，下方 A）及相應後端 API 已實作；線上新增的共用服務與 HTTP API（下方 B）已實作；B 核心功能與驗收修正已通過獨立複驗，手機新增畫面（C）尚未開始。真機與 development build 驗收仍未完成，不以 JS bundle 打包代表 MVP 完成。

| 階段          | 手機工作                                       | 後端／外部依賴                          | 驗收條件                                         |
| ------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| 1. 開發環境   | 選 App ID、development build、模擬器與真機     | 開發者帳號、裝置與簽章                  | iOS／Android 都能啟動、深淺色與四語正確          |
| 2. 登入與旅行 | API client、SecureStore、登入、旅行列表與摘要  | 裝置 session、refresh、me／trips API    | 過期／撤銷／切換帳號正確；舊 Web 登入不受影響    |
| 3. 線上記帳   | 新增支出、分攤預覽、清單與結算                 | 共用支出 service、冪等與金額契約        | 與 Web 同案例相同結果；重送不重複記帳            |
| 4. 離線核心   | SQLite outbox、前景同步、待送狀態              | 既有冪等回覆可查回                      | 斷網、重啟、逾時、token 過期、換帳號不遺失或串帳 |
| 5. 使用閉環   | 邀請／加入、註冊／重設密碼、建立旅行、帳號刪除 | 後端支援或明確可用的 Web 接續流程       | 新使用者可完成旅程生命週期；共用帳務刪除政策明確 |
| 6. Beta／上架 | 正式圖示、隱私說明、錯誤觀測、弱網與裝置測試   | App Store／Play Console、簽章、上架資料 | 兩平台驗收、舊 App 契約相容、可回滾後端部署      |
| 7. 功能擴充   | 行程、相簿／收據、原生推播、AI、統計           | 對應穩定 API 與原生套件 PoC             | 逐項訂驗收，不一次追求網站全部功能               |

已提供 [隔離本機後端與裝置操作表](LOCAL_ACCEPTANCE.md)，可重跑登入／旅行、session 失效與 JWT 自然到期、前後景、HTTP 故障、四語、大字體／深淺色及 iOS 軟體鍵盤驗收；完整真機驗收仍未完成。

「查看支出 → 線上新增 → 查看結算」依下方 A／B／C 分段交付、分段驗收；A 已通過獨立驗收；B 後端核心功能與修正已通過獨立複驗，可交接 C；完整裝置矩陣與正式建置限制見下方。登入／旅行的模擬器基線已通過；真機與 development build 驗收保留為對外測試前的門檻，不阻擋本機功能開發。附件／背景上傳／推播不要阻擋這個切片。

## 下一個切片：線上記帳交接規格

A、B 已通過核心功能獨立驗收，可進入 C；C 仍是待實作計畫，不代表手機畫面已完成。實作模型先交付 A，驗收模型核對程式、實際 HTTP／MongoDB 與兩平台操作後，再進入 B、C；不得只用實作模型的通過聲明結案。

### 範圍與使用流程

- A：旅行摘要新增「支出」「結算」入口；支出分頁清單、單筆明細、成員餘額、建議轉帳與既有還款紀錄。支援讀取 Web 已有的外幣、不同分攤及虛擬成員資料；金額沿用後端結果，隱藏附件內容與下載入口。
- B：抽出 Web／HTTP 共用新增服務，提供成員資料、均分預覽與冪等新增／結果查詢 API，先完成後端驗證。
- C：手機填寫說明、TWD 金額、分類、當地日期、付款人、分攤成員 → 後端均分預覽 → 使用者確認 → 寫入 → 清單／明細／摘要／結算更新。付款人可不參與分攤，預設本人付款、全部成員均分。
- 本輪新增限 TWD、匯率 1、勾選成員均分；外幣輸入、指定金額／比例／份數、編輯／刪除支出、登記還款、附件、AI、離線新增及背景同步留待後續。既有 Web 能力與寫入欄位必須保留。

### A：支出與結算唯讀（第一個交付）

**狀態（2026-10-03）：核心功能與 P1 修正獨立複驗通過，可進入 B；完整裝置矩陣與正式建置尚未通過。** 三個端點、共用 DTO／OpenAPI 與手機「支出清單／明細／結算」畫面已完成；以下規格保留為驗收依據。實作時的決策：

- 游標為 `<date ms>.<createdAt ms>.<id>`，編碼最後一筆的實際儲存值並以 `$or` 取其後資料，同日同時間不漏筆；沿用既有 `{trip, date, createdAt}` 索引（migration 已建立），不新增索引。
- `readSettlement` 拆出 `readSettlementDetail` 取得以成員 id 標示的轉帳（`transactions` 只有顯示名稱，同名成員無法辨識）；`readSettlement` 回傳逐欄不變，公開結算路由不受影響。`status` 由後端判定，任何餘額未歸零即為 `outstanding`。
- 清單與明細重用 `toExpenseDto` 的取整與分攤正規化，再映射為白名單 DTO；投影排除附件、標籤與行程關聯，只 populate 顯示名稱。已不存在的付款人／成員 id 為 `null`，歷史資料缺少的原幣欄位以 TWD 補齊。
- 手機下拉更新只保留並重讀最新一頁；失去存取（401／403／404）時隱藏已快取資料，且該拒絕會一直是查詢的錯誤，不會被之後的逾時／斷線／5xx 蓋掉（見下述 P1 修正）。

**P1 撤權快取複驗通過。** 清單、明細、結算與旅行摘要透過 [accessGuard.ts](../src/features/auth/accessGuard.ts) 保留已確認的拒絕，後續逾時／斷線／5xx 不會重新顯示私人快取；成功讀取才解除。清單下拉更新不再透過 `setQueryData` 清掉拒絕；一般網路故障仍可顯示合法舊資料。

[33 個回歸測試](../src/features/auth/accessDenial.test.ts) 全數通過，涵蓋離開再返回、下拉更新、權限恢復與一般故障對照。獨立另驗 9 個真 QueryClient 案例：四種資源收到 403／404 後的重試進行中、取消與晚到回應，以及多頁刷新部分成功後失敗，皆保持隱藏。這是 QueryClient 層驗證；尚未在裝置上注入「撤銷旅行資格後再斷線」的組合故障。

獨立驗證：Web 1,849、Mobile 124（含上述 33 個）與額外 9 個邊界案例、23 個真 MongoDB 整合測試、隔離 HTTP、契約、lint／格式、Mobile check、Expo 相容性與三平台匯出皆通過。iOS／Android 重新執行英文、預設字級／淺色的完整 `ledger` 流程皆通過。本機根 `check` 仍有與乾淨 HEAD 相同的 53 個 Web 型別錯誤，正式 `build` 亦受既有型別錯誤阻擋；不能標示 CI／正式建置通過。完整四語／大字級／外觀矩陣、真機及 development build 仍待驗；證據與限制見 [本機驗收](LOCAL_ACCEPTANCE.md)。

新增共用 DTO／OpenAPI、會員 API 與手機畫面；不先重構支出寫入。端點皆在 `/api/v1`，只接受 bearer 與旅行 ObjectId：

| 端點                                 | 最小回應／行為                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /trips/:id/expenses?cursor=...` | `{ items, nextCursor }`；每頁 20 筆，按 `date/createdAt/_id` 降冪游標，無效游標 400。下拉更新重讀第一頁，不承諾跨修改快照。 |
| `GET /trips/:id/expenses/:expenseId` | 日期、說明、分類、付款人、原幣金額／幣別／匯率、TWD 金額、各成員 TWD 分攤；驗證支出確實屬於該旅行。                         |
| `GET /trips/:id/settlement`          | 共用 `readSettlement` 的餘額、轉帳建議、既有還款與總額；明確標示建議轉帳尚未付款。                                          |

清單至少顯示日期、說明、付款人、TWD 金額，外幣支出另顯示原幣金額。DTO 明確白名單；不直接序列化 MongoDB 文件或整份 Web DTO，不輸出其他人預算、分享碼、附件 key 或私人資料。失去成員資格、跨旅行查明細與不存在資源統一回 404；不 fallback 到 public API。零支出、已結清與尚有欠款是不同狀態。

沿用 `getExpenses` 的讀取／DTO 規則、`settlementRead.ts` 與 `money.ts`；需要抽共用讀取函式時保留 Web 原有回傳與排序。結算目前會讀全部支出／還款，不把新增 HTTP 清單游標宣稱為結算查詢最佳化。手機 query key 包含環境、帳號、旅行與資源，登出／換帳號清除私人資料。

### B：共用寫入與 API（第二個交付）

**狀態（2026-10-04）：B 核心功能與 P1／P2 修正獨立複驗通過，可交接 C；正式 check／build 仍有既有型別錯誤。** 共用服務、四個端點、共用契約／OpenAPI 與測試已完成；手機端沒有新增畫面。以下規格保留為驗收依據。實作時的決策：

- `lib/expenseCreate.ts#createExpenseForActor` 接受已授權的旅行／操作者與 `createExpenseSchema` 的輸出，內含 `withTripWrite` 交易、成員／分攤／金額驗證、收據驗證、同交易提交的冪等 receipt 與通知／outbox 副作用，不 import `next/*`。Web Server Action 與 HTTP 各為 adapter：驗證登入、解析旅行與輸入、各自的快取／排程（`after` 以參數注入）與錯誤對照。重構前後 `expense.actions.test.ts` 的既有 36 個案例原樣通過；原本傳統通知路徑中未隔離的 `revalidatePath`（失敗會把已入帳回報成失敗）一併修正。
- 新增、同樣套用在 Web 的驗證：真實日曆日（V8 會把 `2026-02-31` 悄悄滾成 3 月 3 日）、分攤成員不重複、到分須為安全整數。重播與查詢的 key 不分大小寫：同一個 UUID 的任何拼法都對應同一筆結果（先找以送出的拼法儲存的 receipt，找不到再於同一旅行與操作者的 receipt 範圍內不分大小寫比對）；receipt 的 `_id` 與指紋維持升級前的格式（key 保持送出時的大小寫），見下方 P1 的修正。
- 單筆金額上限：TWD 金額與每份分攤至多 1,000,000,000.00（`MAX_EXPENSE_AMOUNT`，契約與共用服務共用）。共用取整（`roundMoney`）從約 8.8e12（2^43）起不再原樣保留分格上的值，上限留有約 8,800 倍的餘裕；超過者在契約（HTTP 400）與共用服務（Web 為 `VALIDATION_ERROR`）都於寫入前拒絕，不留 receipt。
- 成員順序＝加入時間、同刻依儲存順序、略過已不存在的帳號，與 Web `getMembers` 相同（整合測試鎖定兩者一致）；它也是均分尾差的固定順序。預覽重用 `computeSplits('equal')`，結果與請求順序無關。
- 請求欄位沿用 Web 輸入的 snake_case（預覽為 `amount`、`member_ids`），回應沿用 A 的 camelCase DTO；這是為了共用輸入驗證而刻意的不對稱。`client_request_id`、`currency: 'TWD'`、`exchange_rate: 1`、`category` 皆須明確提供；其餘欄位一律 `.strict()` 拒絕；說明 1–200 字、成員上限 100（8 KiB 內）。
- 狀態碼：任何 4xx 都代表此請求沒有寫入；409 為 `IDEMPOTENCY_CONFLICT`；429 為 `BUSY`（`TransientTransactionError` 耗盡重試、交易已中止，附 `Retry-After`）；5xx／逾時代表結果不確定，以結果查詢或同 key 重送。授權先於讀取 body；失去資格者連重播與查詢都是 404。
- `test:mobile-api`／`dev:mobile-api` 的隔離 MongoDB 改為單節點 replica set（交易需要）。使用者已開著的舊環境不是 replica set，須重啟才能使用新增 API。

**獨立複驗通過（2026-10-04）**：

- UUID 相容與冪等：舊／新 receipt 的小寫、大寫與混合拼法都能查回原結果；重送不重複入帳或產生副作用，改內容回 409，刪除後不復活。保留既有 `_id`／指紋格式，以 receipt 的原拼法驗證內容。查詢先找完全相同的 key，再於同旅行／操作者的 `_id` 索引範圍內不分大小寫比對；16 種拼法跨 Web／HTTP 併發只提交一次，索引範圍測試通過。
- 金額限制：單筆 TWD／分攤上限 1,000,000,000；原本偏移的 `10_000_000_000_000` 在預覽、HTTP 與 Web 新增均於寫入前拒絕、不留 receipt。上限邊界、隨機分攤與預覽／DB／DTO／結算一致性測試通過。

獨立重跑通過 Web 2,006、Mobile 135（131 Vitest＋4 Node）、真 replica set 174 個案例（B 111＋trip writers 63）、隔離 HTTP、frozen install、契約、lint／格式、Mobile check 與三平台匯出；上次留下的 5 個獨立真 DB 邊界測試也全數通過。根 `check` 的 53 個 Web 型別錯誤與先前乾淨基線逐項相同，正式 `build` 仍受既有型別錯誤阻擋，不能標示 CI／正式建置通過。B 沒有新增畫面，本輪未跑 Maestro；429 真實競爭、C 的代理丟棄回應／App 重啟仍未驗。證據見 [本機驗收](LOCAL_ACCEPTANCE.md)。

目前 `expense.actions.ts#createExpense` 已有交易、成員檢查、收據驗證、通知與冪等；`expenseCreateRequest.ts` 已以「旅行＋操作者＋client_request_id」保存結果，並拒絕同 key 不同內容。必須重用，不能為手機另建第二套帳務或 receipt collection。

1. 抽出可接受明確 actor／trip／已驗證輸入的後端服務；Web cookie adapter 與 HTTP bearer adapter 分別驗證登入，共用同一服務。保留 `withTripWrite` 的交易內成員檢查、支出與 receipt 原子提交、附件驗證、既有通知／活動紀錄語意。Next cache／排程留在適當 adapter；提交後副作用失敗不得把已入帳回報成未入帳，重播不得重複產生副作用。
2. 新增 `GET /trips/:id/expense-options`，只回成員 ID／顯示名稱與必要分類資料，包含既有虛擬成員；不回整份 User／Trip。
3. 新增 `POST /trips/:id/expenses/preview`，輸入 TWD 金額與有序分攤成員，呼叫既有 `computeSplits`／`allocateMoney` 回傳可確認的 TWD 分攤。固定採 options 成員順序處理尾差；手機不複製金額演算法。預覽不寫資料，不保留交易，也不代表日後一定能寫入。
4. 新增 `POST /trips/:id/expenses`；欄位為 `client_request_id`（必填 UUID）、`payer_id`、`original_amount`、`currency`（TWD）、`exchange_rate`（1）、`description`、`category`、`date`、`splits`（`user_id/share_amount`）。嚴格拒絕本輪不支援的欄位；使用既有 service 正規化與驗證金額／分攤／成員，不能信任預覽或前端按鈕。初次與重播均可沿用現有 200 `{ data }` envelope。
5. 新增 `GET /trips/:id/expense-requests/:clientRequestId` 查回目前操作者的已提交結果；有權限但尚無 receipt 回 `{ status: 'not_found' }`，已提交回 `{ status: 'committed', expense }`。沒有 receipt 不代表另一請求不在執行，只能用原 key／payload 重試。曾入帳後遭刪除仍視為已提交，不重新建立。

HTTP 明訂 400 輸入錯誤、401 session 失效、404 無權或不存在、409 同 key 不同內容、413 body 過大、429 等待重試與 5xx 不確定結果；保留 no-store 與既有 8 KiB 上限。金額須有限、正值、至多兩位小數、不超過單筆上限 1,000,000,000 且換算到分不超安全整數範圍；成員不可重複，至少一位，date-only 必須是真實日期。回應中的 `requestId` 是診斷編號，不能取代冪等 `client_request_id`。結果重播前仍須重新授權；不得依可變成員／預覽重新計算已提交 payload 的 fingerprint。

### C：手機新增與不確定結果恢復（第三個交付）

- 新增 `features/expenses`／`features/settlement` 與薄路由；沿用 session manager、Query 與語意色彩。金額以文字編輯，提交前嚴格驗證，禁止 `parseFloat` 默默接受多餘字元。date-only 不轉成 UTC 後取日。金額／成員變動立即使舊預覽失效；請求亂序不得讓舊預覽覆蓋新輸入。
- 按確認時凍結 payload 並產生一次 UUID，防雙擊；401 refresh 重送、手動重試與結果查詢一律沿用該 UUID／payload。只有服務端明確確認成功才顯示已儲存；重讀失敗顯示更新失敗，不要求重新記帳。
- 為了涵蓋「已入帳但回應遺失＋App 重啟」，本階段需最小 SQLite 待確認紀錄：送出前先持久化環境、帳號、旅行、UUID、payload 與狀態，寫入失敗就不發 HTTP。透過 Expo 相容安裝方式加入 `expo-sqlite`，不存 token；資料獨立於 Query cache。這項是對原路線的前移，完整離線 outbox 仍留在階段 4。
- App 恢復後以同帳號／環境查回結果，使用者可用原請求重試；不確定期間鎖定該筆 payload，不另開新 UUID 取代。提交前的一般草稿可編輯／放棄，本輪不保證未送出草稿跨重啟保存。登出／session 到期停止恢復操作並隱藏資料；換帳號不可讀取或重送前帳號紀錄，同帳號回來可繼續。舊帳號晚到回應不能更新新帳號畫面或誤刪紀錄。
- 明確收到提交前驗證失敗時可回到編輯，修正後視為新提交；409 必須查明原請求，不可自動換 UUID。成功／查回成功後才移除待確認紀錄；本機清理失敗可再次查回，不能再次新增。已撤銷旅行權限且無法查回者保留未確認狀態與提示，不假稱寫入失敗或清空。
- 此紀錄只保障使用者在線確認過的提交；離線禁止首次送出，不提供離線建立、批次自動重送或背景排程。取消請求／離開畫面不代表伺服器未寫入，不得因此清除待確認紀錄。
- 四語完整、iOS／Android 數字鍵盤可收起且可提交、安全區域、大字體／深淺色、可讀標籤；loading／empty／error／retry／離線提示均具備。Web 預覽仍不開放登入或降低憑證儲存保護。

### 驗收模型的檢查清單

| 檢查面向        | 通過條件                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A：資料與權限   | 清單跨頁穩定，明細與結算對照 Web／DB 相同；跨旅行、非成員、撤銷資格皆拒絕；零支出／已結清／有欠款、外幣與非均分既有資料正確。                                            |
| B：金額與交易   | 100 元三人固定順序為 33.34／33.33／33.33，0.01 元三人總和仍為 0.01；付款人可不分攤。無效日期、重複／外團成員、非有限或過大金額皆拒絕。交易中途失敗不留下支出或 receipt。 |
| B：冪等與副作用 | 真 MongoDB replica set 上，同 UUID 八個併發只產生一筆與相同結果；同 UUID 改 payload 為 409；刪除後重播不復活；撤銷成員後重播不能取得資料；通知／活動事件不因重播新增。   |
| C：不確定結果   | 代理先讓後端提交再丟棄回應；重試與強制關閉／重開 App 後均找回原支出，DB 始終一筆。原有代理只會在轉送前斷線，必須新增一次性、限定目標寫入的丟回應模式。                   |
| C：登入與隔離   | 寫入遇 401 可 refresh 後以原 key 重送；refresh 失敗保留待確認紀錄並要求登入；A→B→A 不串資料、不替 A 送出；取消、逾時與晚到回應正確。                                     |
| 原生操作        | iOS／Android 實際 API 完成「列表→明細→新增→結算」；新畫面四語、鍵盤、大字體／深淺色通過，既有登入／旅行／session 核心流程無回歸。                                        |
| Web 相容        | Web 新增、附件、外幣／四種分攤、離線重送與既有通知流程測試仍通過；Web 新增可在手機讀取，手機新增可在 Web 讀取，金額一致。                                                |

各交付先跑 affected tests；跨 Web／Mobile／contracts 的最終交付執行根目錄 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm test:run`、`pnpm build`、`pnpm export:check`。契約變動跑 `pnpm contracts:generate`／`pnpm contracts:check`；Native 套件變動另跑 Expo 相容性檢查。擴充 `test:mobile-api` 的隔離真 DB 測試、既有 transaction 測試及 Maestro suite；標示跳過／未執行項目，不能把 mock 或 bundle export 當裝置證據。

交接只需提供完成階段、必要設計決策、實際測試結果／私人暫存證據位置、未完成項目。更新本文件與既有 FEATURES／ARCHITECTURE／API／LOCAL_ACCEPTANCE 中受影響的內容，以及根 `changelog.md`（每日 1–3 點）；不新增逐輪報告。驗收結論分為通過、需修正、受環境限制未驗，未驗項目不計通過。不自行 commit／push／升版；使用者要求提交時再依受影響 App 的實際行為判斷版本。

登入已沿用網站帳號／密碼。目前仍需決定：正式 App ID 與商店擁有者、API 測試環境、第一批測試帳號、首版是否必須包含照片。這些資訊在對應階段確認即可。

公開發布前核對當時的帳號刪除／隱私規定；目前尚無刪除帳號 API，不能只在手機隱藏資料當作帳號刪除。[Apple 帳號刪除說明](https://developer.apple.com/support/offering-account-deletion-in-your-app/)、[Google Play 說明](https://support.google.com/googleplay/android-developer/answer/13327111)。
