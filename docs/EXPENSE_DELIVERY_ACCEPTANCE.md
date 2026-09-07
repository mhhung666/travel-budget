# P 支出背景處理：驗收與啟用清單

更新：2026-09-07。應用程式版本以 package.json 為準。

## 結論

程式整合與本機隔離驗證已完成；**P 尚未完成正式環境驗收**。
新增支出的背景模式預設關閉。P 的共用 DB 索引 migration 已經使用者授權完成（見下方紀錄）。
沒有修改使用者 `.env`、push 或部署；AI 真實品質驗收依原決定暫停。
使用者已確認 Hobby、每日補送；`vercel.json` 已加入每日補撿設定，待 production 部署才生效。

## 本次交付

| 階段 | 已完成 |
| --- | --- |
| 1：worker | 固定候選與游標恢復、序列續租、每批 32 台／15 秒開始工作預算、5 次失敗上限、正常 yield 不耗失敗額度、超量封存 |
| 2：入口與資料庫 | 4 個 additive 索引 migration、readiness gate、單次 Expense insert 保存事件與工作、回應前不等待推播、post-response after、Bearer 驗證補撿入口 |
| 3：驗收及操作 | 真實 Mongoose → worker、MongoDB 候選 explain、離線重載續送／失敗對帳、optimistic 修復、推播 tag、唯讀佇列計數及部署操作清單 |

一般路徑仍由 `EXPENSE_BACKGROUND_DELIVERY=off` 保持舊通知方式。
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

最終一般測試 1,282 項通過、32 項略過（29 項 MongoDB 另跑全部通過、3 項 AI 暫停）。
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
4. 先部署 off 版本、保持既有 CRON_SECRET，確認 Vercel 已登錄獨立 GET
   `/api/cron/expense-delivery` 每日排程；驗證 401／503 邊界與 authorized idle 回應。
   索引尚未安裝時入口預期回 503，不會自動 migration；先完成第 3 步再啟用。
5. 確認排程正常後才設 `EXPENSE_BACKGROUND_DELIVERY=on` 並重新部署。新增一筆測試支出，
   比對回應 DTO、站內通知／活動各一次、推播結果與 completed 狀態。
6. 在隔離 preview DB／測試訂閱製造 provider 失敗與 worker 中斷，確認排程恢復；
   不在真實使用者訂閱上注入故障。記錄建立支出 p50／p95 與最舊 pending 延遲再將 P 標成完成。

after 的執行仍受平台函式時限約束，參考 [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after)。
cron route 明確設定 maxDuration 60 秒；DB 個別時限與批次開始工作預算不是硬即時截止，
連線／已開始 HTTP／transaction／checkpoint 仍可能被平台終止，靠 lease 及持久化狀態恢復。

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
客戶端在伺服器已保存支出、但回應遺失後自行再次建立，可能是另一筆支出／另一個事件；
本版 outbox 去重不等同 create API 的跨請求 idempotency key。
