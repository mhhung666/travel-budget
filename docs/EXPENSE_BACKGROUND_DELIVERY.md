# 支出背景通知：實作進度與接續設計

> 更新日期：2026-09-06

> 2026-09-07 最新整合與驗收狀態見 [EXPENSE_DELIVERY_ACCEPTANCE.md](./EXPENSE_DELIVERY_ACCEPTANCE.md)。
> 本文件保留各階段歷程；三階段整合已完成，正式啟用仍須排程決定及 migration／部署驗收。

## P 整合階段 2（2026-09-07；預設關閉）

已加入 `EXPENSE_BACKGROUND_DELIVERY=off|on`（預設 off），範例見 `.env.example`。
on 時新增入口先確認 CRON_SECRET、transaction 支援、4 個必要索引，再以單次 Expense insert
保存不可變事件及初始工作狀態。User 顯示名稱在寫入前一次讀取，成功後直接組回應，不再 populate。
同一 outbox 事件不呼叫舊 notify／logActivity，避免無去重鍵的雙份紀錄。

回應後使用 Next.js `after` 嘗試一批背景工作；註冊 callback、執行 worker 或 cache invalidation
失敗不改寫已成功的支出結果。after 受平台執行時限約束，**不是獨立排程替代品**。
參考 [Next.js after 文件](https://nextjs.org/docs/app/api-reference/functions/after)。

新增 `/api/cron/expense-delivery`，只接受 CRON_SECRET Bearer 驗證，單次處理一筆／一批、
route maxDuration 60 秒，失敗回 503 且不暴露 DB／provider 原始錯誤。關閉新寫入開關後，
此入口仍可排空已存在的工作。未新增 vercel.json 排程，不自動呼叫遠端入口。

新增 `20260907170000-expense-delivery-indexes.js` migration：queue ready、站內通知去重、
活動去重、user + _id 候選查詢共 4 索引。事前檢查所有同名索引相容性；已存在則保留，
不回補歷史通知、不刪業務資料、無 TTL。down 刻意拒絕移除去重保護，回滾採 off 並排空。
migration 僅已編寫，**未對 `.env`／共用 DB 執行**；不得直接 migrate:up 連帶執行未盤點的舊 migration。

啟用順序：確認排程頻率與平台方案 → 盤點 migration status／目標 DB → 安裝並驗證索引 →
部署 off 版本及設定受保護補撿排程 → 確認排程能執行 → 開 on → 驗證新增回應及補送。
readiness 成功在同一程序／Db 快取；刪索引後既有工作會由 worker fail-closed 重試，
部署期間不得移除必要索引。

## P 整合階段 1（2026-09-07）

已串接持久化 runner 與單工 worker：站內交易 → 固定候選初始化／重讀 → 每批最多
32 裝置／15 秒開始工作預算 → checkpoint → 游標 CAS → 完成／退避／續跑。
批次前續租，批次內透過序列化 checkpoint read 每 15 秒檢查續租，不使用背景 interval。
DB 佇列與 checkpoint 操作也加上 2 秒 driver／server 時限與 majority 寫入。

- 正常已保存且向前推進的 yield 退還一次 claim 額度；零進度、例外及程序中斷仍消耗
  失敗額度，避免有限批次使 256 台裝置提早耗盡 5 次上限，也避免無進度無限迴圈。
- retry 在同一次 fail 原子更新中重設同一候選清單的游標／失敗旗標並增加 revision；
  不清掉 accepted／expired checkpoint，不重新發現裝置。
- 完成政策：僅首次持久化的裝置集合屬於該事件；之後註冊的裝置不補歷史通知。
  當下不符資格的裝置略過；所有候選巡覽完且無失敗才完成。VAPID 未配置則僅完成
  站內通知／活動紀錄，沿用既有「未配置不寄推播」語義。
- 超過容量封存為 capacity；旅程已不存在／刪除中封存為 trip_missing；不默默算成功。
  對外請求及 checkpoint 的不確定窗口仍可能重送，不能宣稱 exactly-once。

本階段仍未接入 action／HTTP route／排程，不操作共用 DB。新增 runner／worker 的
23 項單元測試，一般測試 1,240 項通過；隔離 replica set 另驗證 65 裝置跨批、重試去重、
yield 額度 CAS 與原有併發／生命週期情境。啟用及 production-like 驗收留待後續階段。

## 已完成

- 新增支出重用 server Trip 快照，通知及活動紀錄並行、等待完成且隔離失敗。
- `sendPush` 回傳逐裝置 `accepted`／`expired`／`failed`，區分未配置、無裝置與前置查詢失敗。
- 過期裝置清理失敗獨立標記，不應因此重新寄送；結果不包含 endpoint、金鑰或推播內容。
- 原呼叫端仍可忽略回傳結果，不改變目前寄送流程；尚未接入自動重試。
- 內嵌工作佇列的儲存層已完成：原子認領、token 與有效期限驗證、續租、退避重試、5 次上限、
  最後一次 lease 到期封存。使用 MongoDB `$$NOW`，不依賴各 worker 本機時鐘。
  模組不自行連線／建索引，尚未加入 Expense schema、action 或排程，部署不會啟用佇列。
- 事件快照與站內紀錄去重模組已完成（尚未接入 action）：固定事件識別碼、當下金額／描述／名稱／
  成員與時間；從有效 lease 對應的 Expense 讀取快照並核對旅程／建立者。不是使用目前編輯後的支出值。
- 站內通知與活動紀錄以 partial unique index + `$setOnInsert` 去重，重跑不覆蓋已讀狀態或原始文案。
  索引缺失／定義不相容時拒絕初始化；模組不自行建立索引。非預期錯誤向上傳遞，供 worker 重試。
- 收件者為當時與目前成員交集，排除本人、虛擬與已不存在使用者；此模組不發 Email 或 Web Push。
- 站內紀錄、原始收件者清單與 `recordsPersistedAt` 完成標記改為同一 transaction；失敗整批回滾。
  已完成紀錄不重建，保留使用者之後刪除通知的意圖；移除後重新加入者也不補發先前排除的紀錄。
- 交易對 Expense／Trip／候選 User 寫入 fence 計數，與刪除／成員異動競爭時由交易衝突重試，
  不是只依賴可能過時的 snapshot read。交易最後再核對 lease，途中到期則整批回滾。
- **已接入的入口防護**：`deleteTrip` 在平行清理子資料前，先等待 `expenseDeliveryDeleting=true`
  寫入；事件交易遇此標記即跳過。清理失敗保留標記，管理員可重試刪除，不需回補既有 Trip。

`accepted` 只代表推播服務接受請求，不保證裝置已顯示通知；`processed` 也不代表全部成功，
worker 必須查看每個裝置的結果。一般失敗不直接判定為可重試，例如 403 可能需要修正設定。

## 接續整合方案（尚未啟用）

1. 採用內嵌 outbox：將 `initialExpenseDeliveryState()` 與事件快照在建立 Expense 的同一次 insert
   保存，避免「支出成功、事件遺失」。儲存層刻意不提供事後 enqueue API。
   快照建構／驗證模組已完成；仍需接入 schema 與 action 的同次寫入，且不回補歷史通知。
2. claim／lease／重試的儲存層已完成；worker 仍須有批次及執行時間上限、heartbeat 與失效退出。
   單次 lease 60 秒；失敗後退避 30／60／120／240 秒，第 5 次失敗封存。這是儲存層預設值，
   實際重試延遲仍取決於排程頻率。每次 claim／到期封存僅操作一筆。
3. 站內通知與活動紀錄的唯一鍵 upsert、收件者交集已完成；仍須正式索引 migration 與啟用順序。
   既有無 `deliveryEventKey` 的紀錄不受 partial index 影響，也不自動回補事件識別碼。
   舊版即時通知與新版 worker 不可同時處理同一事件，否則舊紀錄沒有 key，仍會產生重複。
   交易只包含 DB 操作，嚴禁把 Email／Push 放入可能自動重跑的交易 callback。
4. 裝置寄送結果逐筆保存；不要因一個裝置失敗，就重送已接受的裝置。網路逾時或「服務已接受、
   尚未保存結果即中斷」仍有不確定窗口，不能宣稱端到端 exactly-once。需另定推播去重策略。
5. 有限次數的退避重試、失敗封存與可觀測計數；錯誤記錄不可包含訂閱密鑰或完整 endpoint。
6. request 後背景觸發僅用於降低正常情況延遲；持久化事件仍須由獨立排程補撿，不能只靠記憶體 Promise。

## 尚待使用者決定

目前 `vercel.json` 只有每日支出摘要排程，沒有背景通知 worker。需先確認：

- 重試可接受隔天補送，或需要分鐘級恢復？
- 如需新增排程，其部署方案是否支援所需頻率？確認後才新增排程／必要設定。

未變更 Vercel 設定、未新增應用程式環境變數、未執行共用資料庫 migration。Trip schema 新增
可選刪除標記，無預設值／無索引／無歷史回補。outbox 儲存層已完成
隔離 MongoDB 併發驗證；事件快照及站內去重已完成獨立模組，schema／action／索引 migration／寄送 worker 仍需整合。目前 P 不符合
「回應不等待推播、失敗可重試且去重」的完成條件。

內嵌工作與支出使用同一文件，是基於 MongoDB 單文件原子寫入的設計；這不代表對外推播也具原子性。
參考 [MongoDB 原子性文件](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)。

## 驗證

`webpushDelivery.test.ts` 覆蓋停用、無裝置、MongoDB 查詢失敗、混合裝置結果、404／410 清理失敗、
網路失敗、429／403，以及結果不含訂閱秘密。測試使用 mock，不寄送真實推播。

`expenseDeliveryQueue.test.ts` 的 4 項、`expenseDeliveryEvent.test.ts` 的 7 項、
`expenseEventStore.test.ts` 的 7 項單元測試，以及 `expenseDeliveryQueue.integration.test.ts`
的 22 項真實 MongoDB 測試已通過。隔離測試使用本機一次性 Docker MongoDB 8.0.29 replica set，涵蓋：

- 12 個同時 claim 只成功一個。
- 到期接手前後，舊 token 都不能完成、續租或回報失敗。
- 續租與完成後不可再次完成。
- 退避間隔與 5 次失敗上限。
- 最後一次 lease 到期，併發封存只成功一次。
- 歷史支出／未到期／已完成／已封存工作不認領。
- 支出刪除後，舊 worker 不會重新建立支出。
- 12 個同時重跑事件，只建立每位收件者一筆通知及一筆活動紀錄。
- 保留已讀狀態與新增當下文案，不受支出編輯／旅程改名影響。
- 移除／虛擬／不存在／新加入成員不收到歷史事件通知。
- 模擬第二位收件者寫入失敗，全部紀錄及完成標記回滾；重試完整寫入。
- 無效 lease、支出不存在或旅程不存在時不新增紀錄。
- 快照與支出旅程／建立者不符時拒絕處理。
- 保留舊通知／活動紀錄；缺少唯一索引時拒絕啟動去重模組。
- 已完成事件再重跑，不復活使用者已刪除的通知／活動紀錄。
- 未列入首次完成收件者的人，重新加入旅程後不補發紀錄。
- 取得 Expense 保護後、取得 Trip 保護前移除成員／標記刪除：重試看到新狀態，不誤送。
- fan-out 中途 lease 到期：所有站內紀錄與完成標記回滾。
- worker 先取得保護時，移除成員／標記旅程刪除會等交易結束，再清理，不留下重建通知。

重跑（URI 必須是可寫的隔離 replica set；不讀 `.env`，不回退到應用程式 URI）：

```sh
MONGODB_QUEUE_TEST_URI='mongodb://127.0.0.1:27017/?directConnection=true' \
MONGODB_QUEUE_TEST_ALLOW_WRITES=1 \
pnpm exec vitest run src/__tests__/expenseDeliveryQueue.integration.test.ts
```

測試只使用隨機新建的 `tb_queue_verify_…` 資料庫，結束後刪除此測試庫，不使用 URI 中的資料庫名。
測試現在會拒絕 standalone MongoDB；須先在隔離容器以 `--replSet` 啟動並完成 `rs.initiate()`。
不能對共用庫執行這些初始化命令；本次只在 agent 新建的隔離容器內操作。
兩個參數都沒設時略過；只設定其中一個時拒絕執行。這些參數僅用於測試，不需加入 Vercel。
本次測試庫已清理、本次容器已移除，沒有寄送推播或修改共用庫。

一般完整測試的 MongoDB 情境預設略過，22 項 MongoDB 測試另以以上方式單獨執行通過。
一般完整測試 1,063 項通過、25 項略過（22 項 MongoDB、3 項 AI）；TypeScript 與 lint 通過。

**仍待驗證**：正式查詢資料量下的 claim 索引效益、應用程式完整生命週期、對外通知去重、
失敗後人工處理／保留期限。沒有新增 TTL，避免刪除業務支出。租約 fencing 只保護資料庫狀態，
無法撤銷舊 worker 已開始的 HTTP 推播；刪除支出也不能保證取消已送出的請求。

**交易與生命週期界線**：`persist` 使用 snapshot read concern、majority write concern，交易重試／
執行期限為 10 秒。Expense／Trip／User 的 fence 必須是真正修改，不可改成 no-op；單靠交易 snapshot
read 不保證讀到最新資格。參考 [MongoDB 交易的 stale read 與寫入保護](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/#in-progress-transactions-and-stale-reads)。

目前刪除支出是先刪 Expense、保留過往通知／稽核紀錄；本次不改此語義。移除成員原本即先 `$pull`
Trip 成員、再刪其通知，能與 Trip fence 排序。刪除 Trip 已補 parent-first 標記，再平行清理。
此標記目前只阻止新的背景事件，**不是全應用程式的旅程寫入封鎖**；既有其他新增／編輯流程與刪除
並行的整體一致性，仍屬 R 的未完成範圍。新增入口檢查順序有 action 單元測試，實際背景交易的
競爭情境在隔離 DB 驗證，尚未執行完整真實登入 API 到 worker 的驗收。

啟用 worker 前須確認目標 DB 支援 transaction（replica set／sharded cluster），並評估 fence 額外
寫入與交易成本；本次沒有查驗或變更 `.env` 指向的共用環境。對外推播仍須串接逐裝置完成紀錄、
失效處理與去重；站內完成標記不能視為已推播。唯一索引不保證對外寄送 exactly-once。

## 逐裝置進度儲存層（2026-09-06，尚未啟用）

新增 `expensePushCheckpoint.ts`，將裝置 ObjectId 作為 Expense 內嵌 checkpoint 的 key，
僅保存 `accepted`／`expired` 與 DB 時間。不保存 endpoint、金鑰、推播內容或 provider 原始錯誤。
這是儲存層，不會呼叫現行 `sendPush`、查訂閱或自動略過裝置；尚無實際 worker。

- read／record 都要求有效 lease 與站內 `recordsPersistedAt`；read 回 null 表示必須停止。
- 首次 terminal 結果及時間不可覆寫；claim 接手會保留進度。failed／不確定結果不記成完成。
- 不使用 upsert；到期／舊 token／已完成／已刪支出不可寫入，也不會重建支出。
- 每筆支出最多 256 個裝置 checkpoint，併發寫入也受原子上限保護，避免內嵌文件無限制增長。
  record 回 false 必須停止／重新判斷，不能視為寄送完成；超限需後續 worker 的人工處理策略。
- accepted 只代表 provider 接受；expired 的訂閱清理失敗應分開處理，不應重新寄送。

未來 worker 須先依目前成員／使用者／訂閱資格取得可寄裝置，再排除 checkpoint 中的裝置；
每個 HTTP 完成後立刻保存，不能等待整批才保存。read 不是 HTTP 鎖，途中仍可能失去 lease、
被移除成員或刪除旅程。HTTP 已接受但 checkpoint 尚未保存的中斷窗口仍可能重送，不能宣稱 exactly-once。
正式啟用前仍需寄送器介面、續租、批次／時間限制、超限處理、索引 migration 與 action 的原子事件接入。

本階段驗證：新增 7 項單元測試；隔離 replica set 的整合測試共 24 項通過，含進度接手、
重複回報不覆寫與 12 個併發寫入爭取最後一個容量。一般完整測試 1,070 項通過、27 項略過
（24 項 MongoDB 另跑通過、3 項 AI 依原規劃暫停）；TypeScript 通過。
測試庫已清理，未讀取 `.env`、未修改共用 DB、未寄送真實推播；不需新增環境參數或執行 migration。

## 逐裝置批次執行層（2026-09-06，尚未啟用）

新增 `expensePushExecutor.ts`，以注入介面串接 read／record／prepare，逐台執行並立即保存
accepted／expired。重跑會略過已有 checkpoint 的裝置；failed 保持可重試。現行 `sendPush`
及新增支出路徑不變，這仍不是可啟用的完整 worker。

- 候選裝置先去重、驗證 ID，並以既有 checkpoint 與全部候選的聯集檢查 256 台上限。
  超限在任何 HTTP 前回 capacity；這是保守判定，包含後續資格查詢可能略過的候選。
- 每台 prepare 前後都重讀有效租約／進度；prepare 的正式 adapter 必須重查旅程、真人成員、
  首次站內完成收件者與訂閱歸屬。skip 僅略過該裝置，stop／disabled 則停止整批。
- 每個 terminal 結果立即 await 保存；保存拒絕即停止，儲存／prepare／寄送例外向上拋出，
  不會誤報成功或繼續寄下一台。HTTP 成功後保存失敗仍有重送窗口。
- 預設每批最多走訪 32 個去重裝置、20 秒時間預算；包含已完成／不符資格的裝置。
  超時不再開始下一個 HTTP，但已回傳的 terminal 結果仍嘗試保存。
  這不是硬性執行期限，不會取消已開始的 HTTP；正式 adapter 仍須 transport timeout 與續租。
- exhausted 只表示本次候選快照走訪完畢，**不能直接呼叫 queue.complete**。
  yielded 必須由 worker 依進度選出下一批；retry 表示本批有失敗；其他非 exhausted 狀態也不能
  視為整筆完成。不得每次固定取相同前 32 台造成後續裝置飢餓。

本批新增 22 項 mock 單元測試，未新增 DB 操作或實際 HTTP adapter。尚待接入有界訂閱查詢、
目前資格查詢、單裝置寄送器、worker 續租與完整工作結束判定，再決定排程及正式啟用。
不需新增 `.env` 參數或執行 migration；沒有改動共用 DB 或寄送真實推播。

本批一般完整測試 1,092 項通過、27 項略過（24 項 MongoDB opt-in 本批未重跑、3 項 AI 暫停）；
TypeScript、Prettier、lint 與 `git diff --check` 通過。

## 單裝置 HTTP 傳送層（2026-09-06，尚未啟用）

新增 `expensePushTransport.ts` 的 `sendExpensePushDevice`：接收已授權的一個訂閱、已本地化
payload 與 VAPID 設定，使用 web-push 的 `generateRequestDetails` 產生加密 body／簽章，
再由 Node HTTPS 傳送。不呼叫既有多裝置 `sendPush`，也不修改現行新增支出流程。

- 預設 HTTP 總時間上限 5 秒，可由呼叫端指定 1–10,000 毫秒整數；非 socket 閒置逾時。
  到期會 destroy request／response 並回 failed，持續收到資料也不延長期限。
  時限從 HTTP 建立前開始，不涵蓋同步加密；仍受 Node event loop 排程影響，不是硬即時保證。
- 完整回應的 2xx 為 accepted，404／410 為 expired，其餘（含重新導向、429、5xx）為 failed。
  不追蹤重新導向、不自動重試；串流中斷、網路錯誤與逾時均不可記為 terminal checkpoint。
- 不累積或記錄 provider body、endpoint、金鑰與原始錯誤；僅回傳分類。
  每次關閉本地連線，不使用共享 keep-alive agent。
- 本層不查 DB、不讀 `.env`、不判斷 disabled、不刪除失效訂閱。正式 prepare adapter 仍須重查
  旅程／真人成員／首次完成收件者／訂閱歸屬，組合語系 payload，並處理未配置 VAPID。
  expired 清理須比對原訂閱擁有者與 endpoint／keys，避免刪掉寄送期間更新的訂閱；清理失敗
  不得將 expired 改成可重送。此清理與 adapter 留待下一批。
- HTTP 中止只能停止本地工作，無法撤回 provider 已接受的訊息；failed 重試與成功後保存前
  的中斷都仍可能重送，不保證 exactly-once。尚未接入 executor／worker／action，P 尚未驗收。

新增 28 項 mock 測試，覆蓋狀態分類、簽章 request 轉送、總時限、串流逾時、晚到事件、
同步／非同步錯誤與參數驗證。沒有真實推播、共用 DB 操作或 migration；不需新增環境參數。

本批一般完整測試 1,120 項通過、27 項略過（24 項 MongoDB opt-in 本批未重跑、3 項 AI 暫停）；
TypeScript、Prettier、lint 與 `git diff --check` 通過。

## 送出前資格 adapter（2026-09-06，尚未啟用）

新增 `expensePushPrepare.ts`，綁定單筆支出與租約，供 executor 的 prepare 使用：

- 設定由伺服端呼叫者明確注入；null 回 disabled，不自行讀環境或建立 DB 連線。
- 以 DB 時間檢查有效租約與站內紀錄完成標記，驗證不可變事件與支出／旅程／觸發者歸屬。
  查不到有效工作或旅程（含刪除中）回 stop；損壞事件／收件者資料與 DB 例外直接拋出。
- 只允許事件成員、首次站內通知收件者、目前旅程成員的交集，排除觸發者。
  再依指定訂閱 ID 與合資格 owner 查詢，確認 owner 仍存在且非虛擬使用者；不符回 skip。
- 四次查詢均走 primary、必要欄位 projection，設定每次 server maxTimeMS 與 driver timeoutMS
  各 2 秒。這是單次查詢限制，不是整個 prepare 的總期限，也不是批次候選發現器。
- 文案沿用本地化 builder：目前收件者語系、事件當時旅程／人物／支出快照、公開 hash 深連結。
  ready 的 send 只能呼叫一次，接有總 HTTP 時限的單裝置 transport；prepare 本身不送網路請求。
- executor 必須在 prepare 後重讀租約／進度，立即使用 send；不能快取 ready 供之後重跑。
  這些讀取不是鎖，不能消除查詢後成員移除、訂閱移轉或 HTTP 成功後 checkpoint 失敗的窗口。
- expired 直接交回 executor 保存，不在 checkpoint 前等待清理。條件式清理仍待後續接入：
  必須匹配原 owner／endpoint／keys，且清理失敗不能觸發重送；目前不刪除訂閱。

新增 23 項 mock 測試，包含資格排除、查詢條件／時限、錯誤傳遞、本地化輸入與一次性寄送，
以及與 executor 串接的 prepare 後租約失效停止、expired 立即保存。未連真實 DB 或推播服務。
仍未啟用 worker／action／排程，不需 migration 或新增環境參數，P 的線上回應時間尚未改善。

本批完整一般測試 1,143 項通過、27 項略過（24 項 MongoDB opt-in 未重跑、3 項 AI 暫停）；
Prettier、lint、TypeScript 與 `git diff --check` 通過。

## 失效訂閱安全清理（2026-09-06，尚未啟用）

- ready 新增一次性的 `cleanupExpired`，prepare／send 不執行刪除。只在本次 HTTP 回 expired、
  terminal checkpoint 寫入成功後，由 executor 再讀進度確認保存的是 expired 才呼叫。
  首次 terminal 結果不可覆寫，因此不能只靠 record 回 true 推斷保存狀態。
- 清理以原 `_id`、owner、endpoint、keys.auth、keys.p256dh 做單次原子 `deleteOne`，
  明確使用 simple collation 精確比對，不 upsert、不先刪再建；0 筆刪除視為正常無操作。
  HTTP 與清理使用同一份原始值快照，
  寄送期間變更任一比對欄位都不會匹配。缺少 endpoint／keys 則在 prepare 拋錯，不送出。
- 設定 server maxTimeMS 與 driver timeoutMS 各 2 秒；不在交易內送 HTTP。
  超出批次時間預算不開始清理，開始後仍可能占用這段單次 DB 時限，並非硬批次截止。
- checkpoint 拒絕／拋錯、後續讀不到租約、保存的是 accepted 時不清理。
  保存後用於清理的讀取或刪除例外只累計回傳 `cleanupFailed`，不外洩原始錯誤／金鑰，
  不將 terminal 結果改成 retry；後續裝置仍須重查租約。worker 尚未接入此計數的監控。
- 清理是 best-effort：保存後程序中斷、預算不足或 DB 失敗可留下失效訂閱。
  已有 checkpoint 的裝置不重送，也不嘗試補清理；沒有把 endpoint／keys 寫入進度。
  現有 schema 沒有註冊世代，因此無法區分所有欄位完全相同的重新註冊或改回原值，
  不宣稱能完全消除這類競態。需要更強保證時須另設 revision 與訂閱寫入流程。

新增 18 項 mock 測試，涵蓋清理次序、條件／時限、原始快照、不匹配、一次性、錯誤隔離、
過期前置結果與預算限制；不是實際 MongoDB 競態驗證。本批未連真實 DB 或推播服務。
尚未啟用 worker／action／排程，不需 migration 或新增環境參數，P 尚未驗收。
下一步是有界候選裝置查詢與公平續跑，再整合 worker 續租及工作完成判定。

本批完整一般測試 1,161 項通過、27 項略過（24 項 MongoDB opt-in 未重跑、3 項 AI 暫停）；
Prettier、lint、TypeScript 與 `git diff --check` 通過。

## 固定候選清單公平續跑（2026-09-07，尚未啟用）

- executor 在裝置數或時間預算耗盡時回傳 continuation：去重後的候選 ID 清單、nextIndex、
  hadFailures。下一批透過 limits.continuation 傳回；計數只代表當批，不是整輪累計。
- 已 checkpoint、資格 skip、failed 與成功保存的 terminal 都推進位置；準備後尚未送出就
  超時則保留原位置，下批重新 prepare，不快取 send。跨批保留失敗旗標，避免後批成功
  掩蓋前批失敗；巡覽完有任何 failed 仍回 retry，新的重試輪不帶舊 continuation。
- 驗證游標範圍、失敗旗標型別，以及去重清單的完整內容／順序一致，錯誤在 I/O 前拋出。
  每批仍重讀租約、以完整候選與既有 checkpoint 聯集檢查 256 筆上限，送出前重查資格。
- 只有 yielded 回傳 continuation；stopped、disabled、capacity、retry、exhausted 均不回傳。
  exhausted 仍只代表候選快照巡覽完成，不授權 queue.complete。
- 這是可信任伺服端 worker 的內部狀態，不是公開 API 游標或完成證明；不得接受客戶端自訂
  位置／旗標。尚未持久化或綁定工作 ID／租約；呼叫者必須限制在同一工作與候選快照使用。
  程序中斷、例外或遺失 continuation 後，僅靠 terminal checkpoint 不能保證公平續跑。
- MongoDB 有界候選查詢、穩定快照與游標保存、續租／重試排程／完成判定仍待整合。
  本批未啟用 worker、action 或排程，不需 migration 或新增環境參數，P 尚未驗收。

新增 14 項 mock 測試，涵蓋 65 裝置跨三批失敗公平性、去重與 skip、準備逾時原位續跑、
terminal 超時後推進、續跑租約／容量重查與不合法游標。未連真實 MongoDB 或推播服務。

本批完整一般測試 1,175 項通過、27 項略過（24 項 MongoDB opt-in 未重跑、3 項 AI 暫停）；
Prettier、lint、TypeScript 與 `git diff --check` 通過。

## MongoDB 有界候選裝置查詢（2026-09-07，尚未啟用）

新增 `createExpensePushCandidates(db)`，由呼叫者提供連線與工作 ID／租約 token；不自行
連線、不讀環境參數、不寫 DB、不送 HTTP，也尚未接入 worker。

- 先確認有效租約及站內記錄完成標記，驗證事件歸屬、首次收件人與 checkpoint 格式。
- 只查事件成員與首次收件人的交集、排除 actor；排除已 accepted／expired 的裝置。
  只投影 `_id`，按 `_id` 排序，以 256 減既有 checkpoint 數再加一筆作為查詢上限。
- 溢位回 capacity，不提供部分清單；滿 256 checkpoint 時仍查一筆確認是否超量。
- 查詢後再次確認有效租約並重讀 checkpoint，扣除新增 terminal、重新檢查聯集容量。
  租約失效／工作刪除回 stop，查詢或資料驗證失敗拋出，不當成空清單成功。
- 每次 DB 操作使用 primary、2 秒伺服器與 driver 時限；不是整個函式的共同 deadline。
  有界指回傳筆數，並非保證掃描筆數；既有 user 索引是否足以支援排序仍需 explain 驗證，
  本批未新增或安裝索引，也未宣稱實測效能改善。
- 候選集合保守包含可能已退出／刪除／轉虛擬帳號的收件人，可能因此提前 capacity；
  不在此授權派送，prepare 仍須逐裝置重查當下資格。worker 不得把 capacity 當作完成。
- ready 空清單也不是 queue.complete 的依據；多次讀取不是 transaction snapshot，
  註冊可能在查詢中／之後改變。回傳清單只供同一工作的一輪 executor continuation 固定使用，
  不可每批重新查詢後套用舊游標。候選快照、游標持久化與完成政策仍待實作。

新增 17 項 mock 測試，驗證查詢形狀、上限、競態防護與錯誤傳遞；不等同實際 MongoDB
查詢計畫或競態驗證。未連真實 DB／推播服務，不需 migration 或新增環境參數。

## 固定候選與游標持久化儲存層（2026-09-07，尚未啟用）

新增 `createExpensePushSweep(collection)`，在同一 Expense 的 `expenseDelivery.pushSweep`
保存 snapshotId、固定 subscriptionIds、nextIndex、hadFailures、revision 與 status。
只擴充 dormant 原生 driver 型別，未啟用 Mongoose schema／action／worker／排程。

- read 區分 stop（無有效租約）、missing（尚無快照）、ready（含已完成巡覽的儲存狀態）；
  異常資料拋出，不自動重建清單或歸零。工作 ID 由 Expense `_id` 綁定。
- initialize 僅能首次寫入，要求有效租約及站內記錄完成標記；原子檢查候選與 checkpoint
  聯集不超過 256。清單不得重複、超量或包含非法 ID；空清單允許建立。
  false 可能代表競爭、失去租約或容量不足，必須重讀，不得直接使用提議清單送出。
- save 僅接受可信任 executor 的 yielded／retry／exhausted 結果；以有效租約、快照 ID、
  revision、原始清單與原始進度作 CAS，保存後版本加一。游標不可倒退，失敗旗標不可消失。
  不能重設已結束的巡覽，不能以 stopped／disabled／capacity 標記完成。
- retry／exhausted 只表示這輪固定清單巡覽完畢，**不會呼叫 queue.complete**。
  本批不新增清單刷新或重試輪 reset，避免先行決定新註冊裝置的納入政策。
- DB 操作各有 2 秒 server／driver 時限；讀取使用 primary，寫入使用 majority。
  timeout 可能已寫入，呼叫者應重讀並核對版本；false／例外都不能當保存成功繼續送下一批。
- 新租約可讀取既有清單與位置；尚未整合 executor，未實現自動恢復流程。
  之後 worker 應先讀／初始化並重讀清單，再執行一批並 CAS 保存；continuation 只能由
  同一工作儲存狀態組成。空清單或已結束狀態不可直接傳成 executor continuation。
- 保存前的中斷仍會重跑未保存批次；terminal checkpoint 有助減少重送，但 HTTP 成功與
  checkpoint 之間仍有重複窗口。CAS 保護儲存進度，不保證同租約並行 HTTP 不重複；
  worker 仍須單工執行、續租並安排批次／重試，不能只靠本儲存層宣稱 exactly-once。

新增 25 項 mock 測試與 2 項 opt-in MongoDB 整合測試，涵蓋並行初始化、容量聯集、
並行 CAS、租約接手、舊租約拒絕、失敗旗標與刪除不復活。隔離 replica set 測試不使用 `.env`。
本批不需 migration 或新增部署環境參數，線上支出延遲與 P 驗收狀態不變。

驗證結果：一般測試 1,217 項通過、29 項略過（26 項 MongoDB opt-in 另跑全部通過、
3 項 AI 驗收仍暫停）；Prettier、lint、TypeScript、`git diff --check` 通過。
隔離測試資料庫已確認清除，臨時 MongoDB 容器已停止並移除，未操作部署資料庫。
