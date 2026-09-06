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
寫入與交易成本；本次沒有查驗或變更 `.env` 指向的共用環境。對外推播仍須另做逐裝置完成紀錄、
失效處理與去重；站內完成標記不能視為已推播。唯一索引不保證對外寄送 exactly-once。
