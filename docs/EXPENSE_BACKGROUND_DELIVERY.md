# 支出背景通知：實作進度與接續設計

> 更新日期：2026-09-06

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
