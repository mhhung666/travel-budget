# 支出背景通知：實作進度與接續設計

> 更新日期：2026-09-05

## 已完成

- 新增支出重用 server Trip 快照，通知及活動紀錄並行、等待完成且隔離失敗。
- `sendPush` 回傳逐裝置 `accepted`／`expired`／`failed`，區分未配置、無裝置與前置查詢失敗。
- 過期裝置清理失敗獨立標記，不應因此重新寄送；結果不包含 endpoint、金鑰或推播內容。
- 原呼叫端仍可忽略回傳結果，不改變目前寄送流程；尚未接入自動重試。
- 內嵌工作佇列的儲存層已完成：原子認領、token 與有效期限驗證、續租、退避重試、5 次上限、
  最後一次 lease 到期封存。使用 MongoDB `$$NOW`，不依賴各 worker 本機時鐘。
  模組不自行連線／建索引，尚未加入 Expense schema、action 或排程，部署不會啟用佇列。

`accepted` 只代表推播服務接受請求，不保證裝置已顯示通知；`processed` 也不代表全部成功，
worker 必須查看每個裝置的結果。一般失敗不直接判定為可重試，例如 403 可能需要修正設定。

## 接續整合方案（尚未啟用）

1. 採用內嵌 outbox：將 `initialExpenseDeliveryState()` 與事件快照在建立 Expense 的同一次 insert
   保存，避免「支出成功、事件遺失」。儲存層刻意不提供事後 enqueue API。
   仍需加入 schema 與事件快照（不能把編輯後的金額／描述誤當新增當下資訊），且不回補歷史通知。
2. claim／lease／重試的儲存層已完成；worker 仍須有批次及執行時間上限、heartbeat 與失效退出。
   單次 lease 60 秒；失敗後退避 30／60／120／240 秒，第 5 次失敗封存。這是儲存層預設值，
   實際重試延遲仍取決於排程頻率。每次 claim／到期封存僅操作一筆。
3. 站內通知與活動紀錄使用事件識別碼搭配唯一鍵及 upsert，避免 worker 重跑產生重複紀錄。
   收件者須與目前旅程成員交集，並重新排除虛擬／已不存在使用者，避免延遲送達洩漏旅程資訊。
4. 裝置寄送結果逐筆保存；不要因一個裝置失敗，就重送已接受的裝置。網路逾時或「服務已接受、
   尚未保存結果即中斷」仍有不確定窗口，不能宣稱端到端 exactly-once。需另定推播去重策略。
5. 有限次數的退避重試、失敗封存與可觀測計數；錯誤記錄不可包含訂閱密鑰或完整 endpoint。
6. request 後背景觸發僅用於降低正常情況延遲；持久化事件仍須由獨立排程補撿，不能只靠記憶體 Promise。

## 尚待使用者決定

目前 `vercel.json` 只有每日支出摘要排程，沒有背景通知 worker。需先確認：

- 重試可接受隔天補送，或需要分鐘級恢復？
- 如需新增排程，其部署方案是否支援所需頻率？確認後才新增排程／必要設定。

未變更 Vercel 設定、未新增應用程式環境變數、未執行共用資料庫 migration。outbox 儲存層已完成
隔離 MongoDB 併發驗證；schema／事件快照／唯一鍵／寄送 worker 仍需整合。目前 P 不符合
「回應不等待推播、失敗可重試且去重」的完成條件。

內嵌工作與支出使用同一文件，是基於 MongoDB 單文件原子寫入的設計；這不代表對外推播也具原子性。
參考 [MongoDB 原子性文件](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)。

## 驗證

`webpushDelivery.test.ts` 覆蓋停用、無裝置、MongoDB 查詢失敗、混合裝置結果、404／410 清理失敗、
網路失敗、429／403，以及結果不含訂閱秘密。測試使用 mock，不寄送真實推播。

`expenseDeliveryQueue.test.ts` 的 4 項單元測試，以及 `expenseDeliveryQueue.integration.test.ts`
的 7 項真實 MongoDB 測試已通過。隔離測試使用本機一次性 Docker MongoDB 8.0.29，涵蓋：

- 12 個同時 claim 只成功一個。
- 到期接手前後，舊 token 都不能完成、續租或回報失敗。
- 續租與完成後不可再次完成。
- 退避間隔與 5 次失敗上限。
- 最後一次 lease 到期，併發封存只成功一次。
- 歷史支出／未到期／已完成／已封存工作不認領。
- 支出刪除後，舊 worker 不會重新建立支出。

重跑（URI 必須是可寫的隔離伺服器；不讀 `.env`，不回退到應用程式 URI）：

```sh
MONGODB_QUEUE_TEST_URI='mongodb://127.0.0.1:27017' \
MONGODB_QUEUE_TEST_ALLOW_WRITES=1 \
pnpm exec vitest run src/__tests__/expenseDeliveryQueue.integration.test.ts
```

測試只使用隨機新建的 `tb_queue_verify_…` 資料庫，結束後刪除此測試庫，不使用 URI 中的資料庫名。
兩個參數都沒設時略過；只設定其中一個時拒絕執行。這些參數僅用於測試，不需加入 Vercel。
本次測試庫已清理、本次容器已移除，沒有寄送推播或修改共用庫。

一般完整測試：1,046 通過，10 略過（3 項 AI + 7 項需明確 opt-in 的 MongoDB 測試）；
7 項 MongoDB 測試另以以上方式單獨執行通過。TypeScript 與 lint 通過。

**仍待驗證**：正式查詢資料量下的 claim 索引效益、應用程式完整生命週期、對外通知去重、
失敗後人工處理／保留期限。沒有新增 TTL，避免刪除業務支出。租約 fencing 只保護資料庫狀態，
無法撤銷舊 worker 已開始的 HTTP 推播；刪除支出也不能保證取消已送出的請求。
