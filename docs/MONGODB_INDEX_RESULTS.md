# MongoDB 索引 before／after（2026-09-05）

## 結果

經使用者核准，在同一測試庫新增 7 個索引，保留全部舊索引及業務資料。
3 組相同旅程各重測 5 輪，共 135 次 after explain（連同 before 共 270 次）。
每組查詢 fingerprint 與 before 相同，集合筆數及各查詢回傳數未變。
這是同一測試庫的兩次觀察，並非不可變 snapshot 或 production-like 壓測。

| 查詢 | Before | After | 判讀 |
| --- | --- | --- | --- |
| 每日摘要 | COLLSCAN，掃描 122 筆、回傳 5 筆 | createdAt_1，掃描 5 筆、回傳 5 筆 | 掃描文件減少 95.9%，keys 由 0 變 5 |
| 支出清單 | trip_1 + SORT | trip_1_date_-1_createdAt_-1，無 SORT | 掃描及回傳維持 7／23／36 |
| 付款清單 | trip_1 + SORT | trip_1_createdAt_-1，無 SORT | 回傳維持 0／1／3 |
| 清單 | trip_1 + SORT | trip_1_createdAt_1，無 SORT | 回傳維持 0／2／3 |
| 相片 | trip_1_takenAt_-1 + SORT | trip_1_takenAt_-1_createdAt_-1，無 SORT | 回傳維持 0／49／52 |
| username／email | COLLSCAN | 各自 CI unique，EXPRESS_IXSCAN | 各回傳 1 筆；不宣稱本次文件掃描數下降 |
| 結算支出／行程 | 已有 trip／trip+dayNumber 索引 | 保持原計畫 | 對照組無退化 |

每輪均不加 hint，採用的是 planner 自己選擇的索引。空的小旅程清單不作收益證據，中／大樣本有資料。
沒有衡量端到端延遲、populate、Shell 聚合或 TTI，不以毫秒差宣稱加速比例。

## 證據

- [Before 報告](./MONGODB_BASELINE_RESULTS.md) 與 [15 輪摘要](./evidence/mongodb-baseline-2026-09-05.json)
- [After 15 輪摘要](./evidence/mongodb-after-2026-09-05.json)
- [建索引紀錄與大小](./evidence/mongodb-index-build-2026-09-05.json)

建立前重新檢查 username／email 的 collation 重複及非字串數，均為 0；建索引成功，after 掃描仍為 0。
建索引操作未修改任何帳號、支出或相片內容。每顆新索引在這次 collStats 中為 20,480 bytes，
七顆合計 143,360 bytes（140 KiB）；這是當下儲存引擎配置大小，非長期成長率或寫入成本量測。

## Migration 與部署

已新增 [20260905093000-core-query-indexes.js](../migrations/20260905093000-core-query-indexes.js)，
並同步 Expense／Payment／Checklist／Photo／User schema。User 保留原 binary unique，CI 索引名稱
另用 username_ci_unique／email_ci_unique，與 auth.actions 的 collation 相符。

**本次測試索引是獨立建立，不是執行 `migrate:up`**，未修改 migrate-mongo changelog 或其他待遷移資料。
正式部署前先審查 `migrate:status`，不要因為本項而盲目套用所有歷史 migration。
應先 migration、再部署 matching schema；目前 autoIndex 開啟，不能依靠部署時隱性建索引取代遷移審查。

up 在任何索引寫入前掃描帳號及核對所有同名索引定義。建立意圖以 `index_migration_ownership` 保存：

- 遷移前已存在且相容的索引記為非 owned，down 不會移除。
- 本遷移新建的索引記為 owned；中斷後重跑仍保留 ownership。
- down 核對目前定義後，只移除 owned 索引；定義不相容時停下，不誤刪外部改動。
- 沒有 ownership 記錄時不猜測。必須禁止併發 DDL／autoIndex，ledger 不是跨 runner 的 DDL 鎖。
- CI unique index 建立本身仍可能因併發重複寫入失敗，應控制相關寫入；失敗時不自動清理帳號。

## 回滾

先停 autoIndex／回退 schema，再處理索引，避免索引自動建回。
回退 CI unique 會解除大小寫唯一性保障，須先限制註冊及改信箱寫入。

正常 migration 建立的索引由其 down 依 ownership 回退。本測試庫的 7 顆索引已在 migration 之前建立，
之後跑 up 會標記為非 owned，**down 刻意不會移除它們**。若要撤銷本次測試，核對建索引紀錄及
當前定義後，僅對紀錄中的七個 collection/name 執行 dropIndex；不動任何舊索引或業務資料。
本輪沒有執行這個刪除操作，也沒有測試真實資料庫 down／重新建立的循環。

## 已驗證與仍待驗證

已完成：真實測試庫 createIndex／after explain、重複掃描、schema 定義對齊，以及 migration 的
up／重跑／down／重跑、既有索引保護、衝突 preflight、中斷恢復與外部改動保護單元測試。
既有註冊／改信箱 E11000 測試繼續通過。

後續已在本機隔離 MongoDB 完成真實 migration rollback 及 DB 層併發唯一性驗收（見下節）。
仍待驗證：較大 production-like 資料量、寫入成本及完整註冊／改信箱 API 整合測試。
O 的程式與小型測試庫索引驗證已落地，但正式推廣驗收仍保留待辦。

## 隔離 MongoDB 驗收工具

已補 `pnpm mongodb:verify-indexes`。僅接受明確的 `MONGODB_INDEX_TEST_URI` 與
`MONGODB_INDEX_TEST_ALLOW_WRITES=1`；不讀取 dotenv、不回退 app URI，也不使用 URI 中的 database。
請只指向可丟棄的隔離 MongoDB server，帳號需要建立及刪除測試 database 的權限。

```sh
MONGODB_INDEX_TEST_URI='mongodb://127.0.0.1:27017' MONGODB_INDEX_TEST_ALLOW_WRITES=1 pnpm mongodb:verify-indexes
```

每個情境建立隨機 `tb_index_verify_` database，先確認無 collection，結束後刪除該次自建 database。
不讀寫現有 app database。若程序被強制中止可能留下測試庫；清理失敗時會印出該庫名稱，需人工確認後處理。
成功輸出 JSON 情境結果，失敗退出非零；避免輸出 MongoDB 原始錯誤中的連線或資料值。

涵蓋真實 migration up／重跑／down／重跑／再 up、舊索引與資料保留、既有候選索引保護、
username／email 大小寫重複 preflight，以及併發 insert／update 的 E11000 與 keyPattern。
這是資料庫層驗收，不是完整註冊／改信箱 API 整合測試，也不是 migrate-mongo changelog／lock 驗收。
既有 action mock 測試另負責 CONFLICT 映射；完整端到端驗收仍待補。

已依使用者指示，在本機一次性 Docker MongoDB 8.0.29 執行，**6 個情境全部通過，退出碼 0**。
結果及 image digest 見 [隔離驗收證據](./evidence/mongodb-isolated-verification.json)。
測試後查核 `tb_index_verify_` database 剩餘數為 0，臨時容器已停止並自動移除；下載的 image 保留供重跑。
缺少 URI 或寫入旗標時拒絕執行的安全單元測試亦已通過。
本次未連線共用測試庫、未執行正式 migration、未觸發 Vercel 部署，也未設定 CI 發布門檻。
