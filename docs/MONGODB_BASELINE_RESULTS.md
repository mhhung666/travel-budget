# MongoDB 首次唯讀基線（2026-09-05）

## 結論

本文件保存索引建立前的歷史觀察。後續已獲核准建立索引並重測，最新狀態見
[MONGODB_INDEX_RESULTS.md](./MONGODB_INDEX_RESULTS.md)；下方「尚未 after」為首次量測當時狀態。

已在使用者確認可量測的測試資料庫執行 3 組旅程 × 5 輪 × 9 種查詢，共 135 次 executionStats。
確認每日摘要全表掃描、四種旅程清單 blocking sort，以及帳號 collation 查詢未使用索引。
**沒有建立或刪除索引、修改資料，也尚未取得 after 數據。O 尚未完成。**

逐輪統計與現有索引見 [JSON 證據](./evidence/mongodb-baseline-2026-09-05.json)，操作方式見
[MONGODB_QUERY_BASELINE.md](./MONGODB_QUERY_BASELINE.md)。JSON 是 explain 摘要，不是包含查詢值的完整 explain。

## 樣本與限制

- 測試庫：7 個旅程、12 個帳號、122 筆支出、11 筆付款、5 份清單、109 張相片、26 個行程日。
- 將有支出的旅程依筆數、ObjectId 升冪排序，選第一、中位及最後一筆：7／23／36 筆支出。
  small／medium／large 僅代表本庫相對大小，不是 production-like 規模。
- digest 固定 `since = 2026-09-01T00:00:00.000Z`，對齊現有近期資料；不是執行當天的過去 24 小時。
  保留 app 的單一下界查詢，不加上界。
- 帳號查詢選一個非虛擬且 username/email 皆為字串的帳號；兩者各回傳 1 筆。這次剛好只掃到 1 筆，
  不能據此推估帳號數增加後的平均或最壞情境。
- 使用者核准使用現有 `MONGODB_URI`，只在子程序記憶體映射為 `MONGODB_BASELINE_URI`，沿用實際
  `MONGODB_DB` 所指資料庫；未更改 `.env` 或工具的預設安全行為。帳號樣本亦只在程序環境傳入。
- 這是當下資料庫觀察，**不是不可變 snapshot**。同一樣本 5 輪的回傳量、掃描量、索引及排序一致，
  但這不等於證明資料完全沒變；後續 before／after 仍應固定 snapshot。
- 每次 explain 時間為 0–3 ms，未量測 HTTP latency、payload、populate、Shell 聚合或 TTI。
  此量級不能可靠宣稱速度提升；沒有新增資料或壓測。

## 量測結果

表內三個數字依序為 small／medium／large；五輪結果一致，時間除外。

| 查詢 | nReturned | docs examined | keys examined | 採用索引／問題 |
| --- | --- | --- | --- | --- |
| expenses.list | 7／23／36 | 7／23／36 | 7／23／36 | trip_1，仍需 SORT |
| expenses.digest | 5／5／5 | 122／122／122 | 0／0／0 | COLLSCAN；掃描／回傳比 24.4 |
| expenses.settlement | 7／23／36 | 7／23／36 | 7／23／36 | trip_1，無 blocking sort |
| payments.list | 0／1／3 | 0／1／3 | 0／1／3 | trip_1，仍需 SORT |
| checklists.list | 0／2／3 | 0／2／3 | 0／2／3 | trip_1，仍需 SORT |
| photos.list | 0／49／52 | 0／49／52 | 0／49／52 | trip_1_takenAt_-1，仍需 SORT |
| itinerary.list | 3／4／5 | 3／4／5 | 3／4／5 | trip_1_dayNumber_1，無 blocking sort |
| users.username | 1／1／1 | 1／1／1 | 0／0／0 | COLLSCAN，未使用 binary unique |
| users.email | 1／1／1 | 1／1／1 | 0／0／0 | COLLSCAN，未使用 binary unique |

小樣本的付款／清單／相片為空；不以空結果證明索引收益，中／大樣本皆有實際資料。

## 帳號唯一性

以 MongoDB `en/strength:2` 掃描全部 User：username、email 的重複群組數及非字串文件數均為 0。
現有 username_1、email_1 是沒有 collation 的 unique index。本次掃描結果支持繼續驗證 CI unique
候選，但不保證日後建索引時仍無重複，也不表示已具備大小寫併發唯一性保障。

## 下一個操作門檻

本次授權僅唯讀。需另行核准在此測試庫建立候選索引，或提供可修改的隔離 snapshot，才能做 after：

1. 先驗證 Expense.createdAt（已確認全表掃描）及 expense/photo 完整排序索引。
2. 驗證 payment/checklist 的 trip＋createdAt；目前資料少，除 SORT 消除外還需較大資料量的證據。
3. 重新掃描帳號重複，在相關寫入暫停或受控的條件下驗證兩個 matching collation unique index。
4. 同樣本重測 5 輪，確認回傳數一致、掃描量／SORT 改善，並記錄索引大小、寫入成本及 rollback。
5. 只有收益與回滾均驗證後，才新增正式 migration 及同步 schema；不移除舊索引。

本輪僅量測及更新文件，不變更應用程式行為。
