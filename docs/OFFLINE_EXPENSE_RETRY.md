# 離線支出安全重送

2026-09-12 本機完成。正式瀏覽器／IndexedDB／Service Worker 驗收仍由改善項目 S 追蹤。

## 行為

- 每次表單提交產生獨立 `client_request_id`；自動重試與重載沿用原值，重複使用表單物件不會共用識別碼。
- 舊 paused 佇列從 `optimisticId` 的 UUID 補上識別碼，連續重載仍取得同一值；不清空舊快取。
- 傳輸拒絕與 `INTERNAL_ERROR` 保留 pending 工作及暫存列，間隔由 1 秒遞增至最多 30 秒，連線可用時繼續重試。
  權限、驗證及請求內容衝突等明確失敗維持原有失敗處理，不自動重試。
- IndexedDB 保存 paused、傳輸中及等待重試的新增支出；還原為 paused 後再交給 QueryClient 補送。
  登出前的未完成工作檢查也涵蓋傳輸中／重試中的支出；每次重試前確認工作仍在佇列，防止登出清除後繼續送出。

## 伺服器一致性

`expensecreaterequests` 以「canonical trip ID、登入者 ID、client request UUID」組成唯一 `_id`，
保存 schema 正規化輸入的 SHA-256 與原始回應 DTO。同一識別碼搭配不同輸入回傳 `CONFLICT`。
重送仍需通過登入及旅程成員檢查；既有結果不依賴收據檔案或背景通知服務再次成功。

新增支出與結果紀錄共同使用 `withTripWrite` 的旅程寫入鎖及 MongoDB transaction。
任一寫入失敗，兩者一起回滾；同時抵達的相同請求只允許一筆交易新增支出。
回傳既有結果不重複通知／活動紀錄／背景排程。姓名與 DTO 在交易內組成，避免寫入成功後 populate 失敗。

單筆支出刪除時保留結果紀錄，防止晚到的重送重新建立它；重送回傳原 DTO 後，客戶端會重新查詢目前資料。
刪除整個旅程時連同結果紀錄清除。不使用 TTL，避免到期後忘記已接受的請求。

部署時執行 `20260912160000-expense-create-requests` migration，建立旅程清理用的 `trip` 索引。
唯一性使用 MongoDB 內建 `_id` 索引。Migration 可重複執行；rollback 僅移除該 migration 擁有的索引，保留結果紀錄。
本輪只對全新隔離測試資料庫執行 migration，未修改正式資料庫。

## 驗證與界線

本機通過 103 項核心回歸（含 6 項隔離 MongoDB 測試）、25 項表單／摘要相關回歸，
TypeScript 與變更檔案 ESLint 檢查通過。

- Action 回歸：回應遺失後重送、兩種通知模式、不同內容共用識別碼、成員權限與 trip/actor 隔離。
- Provider／mutation 回歸：反覆離線還原、舊佇列升級、傳輸中重載、失敗後重載、重試識別碼一致及表單再次提交。
  使用真實 QueryClient、JSON persister 與 provider lifecycle；IndexedDB 邊界仍為記憶體替身。
- 隔離 MongoDB replica set：8 個相同請求並發只建立 1 筆、交易回滾、結果紀錄寫入失敗、
  請求內容衝突、撤銷權限、刪除支出後重送、旅程刪除清理與 migration up/down 重複執行。
  使用 `MONGODB_QUEUE_TEST_URI` 與 `MONGODB_QUEUE_TEST_ALLOW_WRITES=1` 明確指定測試服務，測試自行建立並清除隨機資料庫。

既有 persister 仍有 1 秒節流與 7 天有效期；尚未完成寫入 IndexedDB 就關閉頁面、儲存失敗／被清除，
或快取到期的資料保留不在這次保證內。送出請求前強制落盤、永久錯誤的草稿復原、離線載入失敗提示，
以及正式瀏覽器／SW 驗收仍待後續處理。舊伺服器不識別新欄位，部署或回滾時不可把舊伺服器視為支援安全重送。
