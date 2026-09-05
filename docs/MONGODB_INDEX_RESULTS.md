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

仍待隔離環境驗證：較大 production-like 資料量、寫入成本、真實 migration rollback、
併發註冊／改信箱的資料庫整合測試。這些測試可能寫入或刪除測試資料，不在本次索引操作中執行。
O 的程式與小型測試庫索引驗證已落地，但正式推廣驗收仍保留待辦。
