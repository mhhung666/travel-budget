# P 支出背景處理：驗收與啟用清單

更新：2026-09-16。應用程式版本以 package.json 為準。

## 目前驗收狀態（2026-09-16）

**P 驗收已結案（2026-09-16，依使用者接受決定）。** 跨項目摘要見 [專案總覽](./README.md)。

- 已驗：正式單人旅程支出新增／修改／刪除、活動紀錄、done 計數，以及 inspect 授權 200／未授權 401。
- 已修復的舊問題：09-12 離線重載遺失與後續摘要時序缺陷已由 S 修正，09-14～09-15 [正式站複驗通過](./PRODUCTION_ACCEPTANCE_2026-09-14.md#09-15-摘要時序複驗)，不再列為 P 阻擋。
- 09-16 補驗：不同操作帳號建立一筆 NT$1 測試支出，使用者確認指定收件人的 iPhone 系統推播及站內通知皆收到；全新瀏覽器 context 確認支出一筆。
- 結案決定：使用者指示「P先都給過吧 收掉」，接受其餘項目免驗並結案。部署／開關／實際排程、正式建立 DTO／逐事件 checkpoint、平台中斷恢復、延遲量測及歷史 inspect 503 追查不再列為 P 結案阻擋；未取得的證據不記為實測通過。

結案依據與各項證據狀態見下方「正式結案紀錄」。09-16 補驗段落保留結案前的測試事實與界線。以下工程交付段落的「本輪未部署」等敘述為 09-08 當時界線，非目前部署結論。

## 09-16 補驗：正式唯讀觀測與隔離失敗恢復

本輪驗證程式為 merge commit `6d9db56`；這不是 production 部署 commit 證據。

- 正式站 `/api/cron/expense-delivery?inspect=1`：首次未授權 401、授權 200；
  台灣時間 15:26 再留存一組未授權 401 與三次授權 200，皆為 pending 0、leased 0、done 4、dead 0，oldestPendingAt 為 null。
  三次授權請求耗時 4,012／1,669／713 ms，僅為 inspect 端到端觀測，不是新增支出 p50／p95。
  本次未重現 503，沒有 server trace，不能將歷史 503 標為已解決。
- P 相關 18 個測試檔共 264 項通過；另在本機獨立 MongoDB replica set 執行 29 項整合測試全部通過。
  涵蓋 claim 競爭、租約到期接手、拒絕舊 token、重試與第五次封存、交易回滾、通知去重、
  checkpoint 保留，以及 65 個模擬裝置分批與只重試失敗裝置。
- 實際 Mongoose schema 寫入事件並由 worker 處理至 done、一般查詢隱藏內部欄位已通過；
  此項不是正式 action DTO／逐事件 checkpoint 的端到端證據。
- 隔離測試使用快取的本機 MongoDB binary、loopback 專用埠及隨機 `tb_queue_verify_…` 資料庫。
  已確認測試庫清除並停止本輪 MongoDB。對外推播 transport 使用替身，未向真實收件人發送通知。

留存去敏結果：`/tmp/budget-p-acceptance-20260916/inspect-result.json`、`integration-result.json`；
暫存產物不保證永久保留。未操作正式 migration、一般 cron worker 入口或正式業務寫入。

仍待：production 部署 commit／時間、背景開關與 Cron 登錄及實際執行紀錄；
指定測試旅程／收件人／裝置的 DTO、checkpoint、站內通知與實際推播；
平台 worker 中斷／排程恢復；相同負載下新增支出改善前後 p50／p95、pending 等待時間與接受標準。
本機無 Vercel project link／VERCEL_TOKEN；本機環境設定不能作為 production 開關或 VAPID 設定證據。
**當時尚未結案；後續由使用者接受免驗結案。本機失敗恢復通過不代表平台端到端實測。**

## 09-16 續驗：正式支出與 iPhone 收件

使用者指定正式站旅程並授權新增測試支出、向指定收件人發送通知；在獨立 Chrome 視窗登入
另一個測試帳號，確認旅程有兩位成員，操作人與收件人不同。未建立或擷取收件人的登入憑證。

- 新增一筆 `P驗收 0916 背景通知 NT$1`，金額 TWD 1；畫面先顯示本機待同步，之後提示消失。
- 正式 inspect 回 200，done 由本輪先前的 4 增至 5，pending／leased／dead 仍為 0，oldestPendingAt 為 null。
  這是全站計數變化，不能單獨當成該事件 checkpoint 或排程執行證據。
- 使用者明確回覆「系統推播與站內通知都有收到」，完成指定 iPhone 實際收件驗證。
  尚未確認點擊推播導向、跨裝置重複提醒或所有裝置相容性。
- 另建只帶登入狀態、沒有既有查詢快取的全新 context，重新載入正式支出頁，確認測試描述僅一筆。
- 本輪沒有取得包含該筆支出的 POST 回應本文，不能宣稱正式建立 DTO 已核對，也沒有新增支出 p50／p95。
  本機 `.env` 的 DB 目標 DNS 解析失敗，未取得該事件的 DB checkpoint；未改用其他憑證或修改資料庫。

證據留於 `/tmp/budget-p-live-20260916/`，目錄僅限擁有者存取；不得提交含私人資料的回應檔。
測試支出暫時保留，以便後續逐事件核對。本輪未手動觸發 cron、未修改部署或環境設定。
**實際通知收件項目通過；其餘缺少證據的項目後續由使用者接受免驗，P 已結案。**

## 工程交付結論（09-08 歷史）

程式整合與本機隔離驗證已完成；**P 尚未完成正式環境驗收**。
新增支出的背景模式預設開啟，不必提供 `EXPENSE_BACKGROUND_DELIVERY`。
P 的共用 DB 索引 migration 已經使用者授權完成（見下方紀錄）。
沒有修改使用者 `.env`、push 或部署；AI 真實品質驗收依原決定暫停。
使用者已確認 Hobby、每日補送；`vercel.json` 已加入每日補撿設定，待 production 部署才生效。

## 本次交付

| 階段 | 已完成 |
| --- | --- |
| 1：worker | 固定候選與游標恢復、序列續租、每批 32 台／15 秒開始工作預算、5 次失敗上限、正常 yield 不耗失敗額度、超量封存 |
| 2：入口與資料庫 | 4 個 additive 索引 migration、readiness gate、單次 Expense insert 保存事件與工作、回應前不等待推播、post-response after、Bearer 驗證補撿入口 |
| 3：驗收及操作 | 真實 Mongoose → worker、MongoDB 候選 explain、離線重載續送／失敗對帳、optimistic 修復、推播 tag、唯讀佇列計數及部署操作清單 |

未設定參數即使用背景模式；只有明確設定 `EXPENSE_BACKGROUND_DELIVERY=off` 才使用舊通知方式。
空字串或其他值不合法；若先前已設定 off，需刪除該設定才會採用預設值。
CRON_SECRET、transaction 與必要索引檢查仍保留；不符合時在新增支出前拒絕寫入，
不會自動 migration 或靜默退回舊路徑。程式無法確認平台排程是否已登錄，仍須部署後人工驗證。
on 模式在寫入前取得姓名，省去寫入後 populate，通知與活動交由 outbox worker；
actor／trip／支出快照均為 server-owned，不採用 client 提供的背景狀態。
Schema 不預設建立歷史工作，內部事件／進度預設不列入一般查詢，也不輸出於 DTO。

## 驗證證據與界線

- Action 單元測試：只執行一次含事件的 insert；背景工作尚未開始即能回成功；
  readiness、姓名查詢及 insert 失敗不排工作；after／cache invalidation 失敗不推翻已成功支出。
  此為控制依賴的因果測試，不是 Vercel 實測 p50／p95 延遲。
- 29 項隔離 replica set 整合測試：原子 claim、舊 token、到期與第 5 次封存、transaction
  rollback、成員／刪除競爭、通知去重、checkpoint 容量、並行 CAS、65 裝置跨批及只重送失敗裝置。
  加入真實 Mongoose schema 寫入到 worker 完成、隱藏欄位、不可變事件及無效事件拒絕。
- 索引 migration 在隔離 DB 實際執行；65 裝置候選 explain 使用 `expense_push_candidates`，
  非 COLLSCAN。這不代表大資料量或多收件人的索引效益已驗收，也未實測正式 claim 的 p95。
- 6 項 hook／QueryClient 整合測試：立即顯示、成功換成真實 DTO、空快取失敗清理、shell
  rollback、並行建立互不覆蓋、JSON dehydrate／hydrate 後的離線成功與失敗續送。
  未測瀏覽器實際 IndexedDB 裝置斷電；測試不等同端到端瀏覽器／真實登入驗收。
- 推播資格／HTTP／checkpoint 的既有單元與整合測試保留；實際對外 HTTP 被替換，不寄真實通知。
  payload 帶固定事件 tag，SW 對同一仍顯示中的通知替換且不重新提醒；不是永久去重帳本。
- 完整一般測試、Prettier、lint、TypeScript、production build 通過。MongoDB opt-in 測試另跑；
  3 項 AI live eval 維持略過。build 使用明確 dummy MongoDB URI，不連共用 DB。

2026-09-08 收尾重跑：一般測試 1,290 項通過、32 項略過；29 項 MongoDB 在本機隔離
replica set 另跑全部通過，僅 3 項 AI live eval 仍暫停。合計實際通過 1,319 項。
新增 6 項環境設定測試涵蓋省略參數預設 on、明確 on／off，以及空字串／無效值拒絕。
`pnpm lint`、`pnpm format:check`、`pnpm exec tsc --noEmit`、`pnpm build` 通過；
build 明確覆寫 dummy MONGODB_URI 與 JWT_SECRET，未連共用 DB。
已確認隨機 `tb_queue_verify_…` 測試庫全部清除，臨時 MongoDB 容器停止並移除；
僅清除本次合成測試資料，沒有刪除使用者資料。

## 每日排程決定與正式啟用清單

1. **已確認：Hobby，每日一次即可**。補撿設定為 `0 12 * * *`（UTC），即台灣時間
   20:00 所在小時；保留原每日摘要 `0 13 * * *`（台灣 21:00 所在小時）。
   Hobby 不保證準點，可能於 20:00–20:59 觸發，見
   [Vercel Cron 限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)。
   此排程只在 production 部署後生效，preview 不會自動跑，見
   [Vercel Cron 啟用文件](https://vercel.com/docs/cron-jobs/quickstart)。
2. 每次補撿只跑一筆／一批；低頻排程在累積工作時可能遠超隔天才送完。
   必須依每日新增量、每事件裝置數、失敗率及 pending 最舊時間評估排空能力。
   after 只處理一批且可能中斷，不能拿正常即時路徑代替補撿容量規劃。
3. **已完成**：使用者授權 `.env` 目標 DB，已執行並驗證
   `20260907170000-expense-delivery-indexes.js`。未連帶執行其他 pending migrations。
4. 保持既有 CRON_SECRET，部署前完成第 3 步；部署後確認 Vercel 已登錄獨立 GET
   `/api/cron/expense-delivery` 每日排程；驗證 401／503 邊界與 authorized idle 回應。
   索引尚未安裝時入口預期回 503，不會自動 migration；先完成第 3 步再啟用。
5. 不必新增 `EXPENSE_BACKGROUND_DELIVERY`；此版本部署後即預設啟用。
   若需分階段驗證，可暫設 off，確認排程正常後刪除 off 並重新部署。新增一筆測試支出，
   比對回應 DTO、站內通知／活動各一次、推播結果與工作 done 狀態。
6. 在隔離 preview DB／測試訂閱製造 provider 失敗與 worker 中斷，確認排程恢復；
   不在真實使用者訂閱上注入故障。記錄建立支出 p50／p95 與最舊 pending 延遲再將 P 標成完成。

after 的執行仍受平台函式時限約束，參考 [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after)。
cron route 明確設定 maxDuration 60 秒；DB 個別時限與批次開始工作預算不是硬即時截止，
連線／已開始 HTTP／transaction／checkpoint 仍可能被平台終止，靠 lease 及持久化狀態恢復。

## 正式結案紀錄（2026-09-16）

使用者於實機收件確認後指示「P先都給過吧 收掉」。P 依此接受決定結案，從目前待驗清單移除。
以下區分實際通過與接受免驗，免驗項目不宣稱已取得正式環境證據。

| 項目 | 結案依據 |
| --- | --- |
| 單人支出 CRUD、活動紀錄與 done 計數 | 正式站實測通過（09-11～09-12） |
| inspect 授權／未授權與佇列現況 | 09-16 正式站 200／401 通過；新增後 done 5，其餘狀態 0 |
| 收件人站內通知與 iPhone 系統推播 | 09-16 使用者確認兩者皆收到 |
| 失敗重試與租約接手等隔離驗證 | 264 項相關測試與 29 項本機 MongoDB 整合測試通過 |
| production 部署 commit／時間、背景開關、Cron 登錄與實際執行紀錄 | 使用者接受免驗結案，未補齊平台證據 |
| 正式建立回應 DTO、逐事件 checkpoint | 使用者接受免驗結案，未取得正式逐事件證據 |
| 平台 worker 中斷與排程恢復 | 使用者接受免驗結案，只有本機隔離測試證據 |
| 建立支出改善前後 p50／p95、pending 延遲與接受標準 | 使用者接受免驗結案，未完成量測 |
| 歷史 inspect 503 原因 | 使用者接受免追查結案；本輪未重現，不宣稱已修復 |

未授權的測試帳號／旅程不得自行使用。一般 cron GET 會認領工作並可能寄送通知，
唯讀檢查必須使用 `?inspect=1`；不得以健康檢查之名觸發正式工作。

## 操作與回滾

### 共用 DB 執行紀錄（2026-09-07）

- 目標：直接解析 `.env` 的 MONGODB_URI，資料庫 `travel-budget`；未輸出主機或連線憑證。
  已確認沒有資料庫名稱覆寫差異，目標支援 transaction；執行前無 migration 鎖，
  兩組新唯一鍵未發現重複資料。
- 僅呼叫 `20260907170000-expense-delivery-indexes.js` 的 up，不使用全量 migrate:up。
  四個索引皆為本次新增：expense_delivery_ready、expense_event_recipient_unique、
  expense_event_unique、expense_push_candidates。
- 建立後逐一核對 key、unique、partial filter、collation、非 hidden／sparse／TTL；
  原有索引定義完全保留。未修改支出／通知／活動／訂閱的業務文件，未寄送推播。
- 驗證完成後登錄一筆 changelog，appliedAt 為 `2026-09-07T09:26:06.968Z`；
  其他 changelog 紀錄未變更。
- 現有 migrate-mongo config 的 lockTtl 為 0，套件實際不啟用鎖。本次使用獨立固定 ID 的
  臨時鎖防止相同手動流程併行，完成後只移除自己的 token 鎖；不宣稱能封鎖不遵守此鎖的 runner。
- `20260905093000-core-query-indexes.js` 仍未登錄，未在本次執行或補登；後續全量 migration
  前仍須另行盤點。此次不代表所有歷史 migration 已套用。
- 本機背景開關維持 off；沒有讀寫 Vercel 環境設定，也沒有 push／部署。

### 日常檢查

以相同 Bearer 認證請求 `/api/cron/expense-delivery?inspect=1` 可唯讀取得四種狀態計數與
oldestPendingAt，不會 claim／寄推播；聚合使用 primary、2 秒上限，逾時回 503，不偽裝為零。
此計數需要掃描符合狀態的工作，大型資料庫逾時時應另做離線統計，勿無界放寬公開入口。
不應把 secret 貼進 docs、URL 或可分享的日誌。

- pending 最舊時間持續增加：先查排程是否執行、503、VAPID 設定與處理容量，不盲目增加重試。
- dead：依 Expense 內安全的 lastError 分類（delivery_failed／worker_error／lease_expired／
  capacity／trip_missing）與 checkpoint 進度人工盤點。不要清除 checkpoint 或重建舊通知。
  本版不提供自動復活 dead 的公開 API；重送不確定結果可能重複，需個案確認後再操作。
- 回滾：關閉新寫入開關，保留新 worker 與索引讓既有工作排空，再回滾程式。
  migration down 刻意拒絕刪去重索引；不能一邊有 pending 工作一邊移除唯一鍵保護。
- 不建立 TTL：工作附在業務支出上，不能為清除 queue metadata 而刪除支出。
  每事件 checkpoint／候選最多 256；終態隨支出保存。若日後需縮短保留期，另做經授權維護。

## 不保證的事項

HTTP 已被 provider 接受、但 checkpoint 尚未保存就中斷仍有重送窗口；tag 無法阻止已關閉通知
再次顯示。accepted 不是裝置已收到。成員異動後也無法撤回已開始的 HTTP。
首次候選集合之外的新註冊裝置不補發；未配置 VAPID 時只保存站內通知／活動。
刪除中標記不是全應用程式的寫入鎖，完整跨 collection 一致性仍屬 R。
P 的通知 outbox 去重與 S 的新增支出去重是不同層級。S 已加入相同請求識別碼的安全重送，
見 [離線支出安全重送](./OFFLINE_EXPENSE_RETRY.md)；以新識別碼另建支出仍是另一個請求。
