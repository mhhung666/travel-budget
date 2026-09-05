# 改善建議（Improvements）

> 更新日期：2026-09-05
> 本文件只列**尚未處理**的程式碼 / 基礎設施層級改善。已完成里程碑見 [CHANGELOG.md](./CHANGELOG.md)，架構說明見 [ARCHITECTURE.md](./ARCHITECTURE.md)。
> 慣例：處理完一項 → 移到 [CHANGELOG.md](./CHANGELOG.md)、從本檔刪除。

狀態圖例：🔴 優先處理　⚠️ 待處理　🟡 部分完成 / 待外部條件

## 目前優先順序

本輪先改善既有程式流程、MongoDB 讀寫與畫面載入體驗；AI 行程匯入、收據分析與自然語言記帳的
真實 provider 品質驗收暫緩，不列入以下執行順序。

| 順序 | 項目 | 主要價值 | 建議批次 |
| ---: | --- | --- | --- |
| 1 | O. MongoDB 查詢基線與索引 | 降低排序、每日掃描及資料成長後的退化風險 | P1，先量測再 migration |
| 2 | P. 支出寫入 critical path 瘦身 | 縮短新增支出的實際回應時間，隔離外部通知失敗 | P1，需決定背景工作方案 |
| 3 | Q. 查詢錯誤狀態與前端延遲載入 | 避免把錯誤顯示成空資料，改善互動流暢度 | P1/P2，逐頁落地 |
| 4 | R. 原子更新與跨 collection 一致性 | 降低多人編輯覆蓋及部分寫入 | P2，依使用頻率安排 |
| 5 | M. production-like 效能追蹤 | 補齊實際 bytes、MongoDB profiler 與 TTI 數據 | 🟡 需測試環境與帳號 |

### M. 🟡 輕量 Trip Shell 的 production-like 效能追蹤

程式拆分與 production build 已完成：非支出分頁不再由共用 Shell 取得完整 expenses，表單關閉時不查
members／itinerary／tags，首頁摘要也改用 aggregate 欄位。靜態基線與待補實測項目見
[TRIP_SHELL_PERFORMANCE.md](./TRIP_SHELL_PERFORMANCE.md)。目前本機沒有 MongoDB 連線與可登入測試帳號，仍需在
production-like 資料量下補 Network bytes、MongoDB profiler/explain 與瀏覽器 TTI，確認實際收益及是否要調整
aggregate／索引；完成後即可從本檔移除。

### O. 🔴 MongoDB 查詢基線與索引（P1）

**問題**：數個常用 filter + sort 沒有完整對應的複合索引；每日支出摘要只依 `createdAt` 查詢，但目前
缺少對應索引。資料量增加後可能出現 collection scan 或 blocking sort。帳號查詢使用 case-insensitive
collation，現有 binary unique index 也可能與查詢及唯一性規則不一致。

**候選索引（須先用 production-like 資料驗證）**：

| Collection | 查詢形狀 | 候選索引 |
| --- | --- | --- |
| Expense | trip filter，date/createdAt 排序 | `{ trip: 1, date: -1, createdAt: -1 }` |
| Expense | 每日摘要依 createdAt 篩選 | `{ createdAt: 1 }` |
| Payment | trip filter，createdAt 排序 | `{ trip: 1, createdAt: -1 }` |
| Checklist | trip filter，createdAt 排序 | `{ trip: 1, createdAt: 1 }` |
| Photo | trip filter，takenAt/createdAt 排序 | 視 explain 結果補完整複合索引 |

**處理方向**：擴充 [explain-stats-expenses.mjs](../scripts/explain-stats-expenses.mjs)，保存變更前後的
`totalDocsExamined`、`totalKeysExamined`、`nReturned`、execution time 與 blocking sort 結果；確認收益後才
依 [MIGRATIONS.md](./MIGRATIONS.md) 建立索引。帳號欄位先掃描大小寫重複，再決定 canonical 欄位或 matching
collation unique index，不可只修改 schema。

**完成條件**：核心查詢有可重跑的 explain 基準；新增索引均有 migration／rollback 說明；登入唯一性規則
與實際查詢一致，且 duplicate key race 有明確處理。

### P. 🔴 支出寫入 critical path 瘦身（P1）

**問題**：新增支出目前依序建立 Expense、populate、通知、Email／Web Push、活動紀錄後才回傳。通知與
活動紀錄又會重讀 Trip／User，高頻操作會等待多次 MongoDB I/O 與外部服務。

**處理方向**：

- 先利用已取得的 trip/member/actor 快照減少 populate 與重複讀取，通知及活動紀錄可安全時平行處理。
- 核心 Expense 寫入與次要副作用分離；可靠性要求高時採 MongoDB outbox + 可重試 worker。
- 不在 serverless handler 直接 fire-and-forget 未等待的 Promise。
- 通知失敗不可讓已成功的支出顯示為建立失敗；錯誤需可追蹤與重試。

**完成條件**：建立支出的回應時間不受 Email／Push 延遲影響；副作用失敗可重試且不重複通知；optimistic
update、離線佇列與 rollback 測試通過。

### Q. 🔴 查詢錯誤狀態與前端延遲載入（P1/P2）

**問題**：部分 query function 將失敗轉成 `[]` 或 `null`，使服務故障看起來像沒有資料或未登入。多個
client page 又要等 hydration 後才開始取資料；Global Quick Add、大型 dialogs、AI 輸入與 lightbox 即使
未開啟也可能進入共用 bundle 或提前取資料。

**處理方向**：

- 除明確的 auth-null 情境外，保留 ActionResult 錯誤並交給 React Query retry/error UI。
- 有快取時顯示 stale data 與背景更新提示，不因 `isFetching` 切回整頁 skeleton。
- Global Quick Add 與大型 dialogs 在開啟時才 mount／dynamic import；可視需求於 idle 或 hover 預載。
- 支出搜尋使用 `useDeferredValue`；達到實際資料門檻後，以 date + `_id` cursor pagination 取代全量下載。
- 逐頁評估 server prefetch + React Query hydration，先處理最常進入的旅程首頁與支出頁。

**完成條件**：後端失敗有可重試錯誤狀態；關閉的全域表單不觸發 trips／表單 metadata 查詢；前後台已有
資料時背景更新不遮蔽整頁。以 production build bundle 與瀏覽器 Network／Performance trace 驗證。

### R. ⚠️ 原子更新與跨 collection 一致性（P2）

**問題**：行程活動新增／編輯會覆寫整個 activities 陣列，增加寫入量並有多人同時編輯時的
last-write-wins 風險。虛擬成員轉換、移除會員與刪除旅程會依序修改多個 collection，中途失敗可能留下
部分完成狀態。

**處理方向**：

- 行程活動提供穩定 subdocument ID，以 `$push`、`arrayFilters`、`$pull` 分別新增、更新與刪除。
- 以 version 或 `updatedAt` 做衝突檢查；整陣列寫回只保留給排序／批次編輯，並加入項目數量上限。
- 身分轉換與會員移除使用 MongoDB transaction；R2 等外部刪除留在 transaction 外，以冪等工作重試。
- 同時整理同步等待的 attachment `headObject`，在驗證 key 後採有上限的平行查詢。

**完成條件**：不同使用者編輯不同活動不互相覆蓋；跨 collection 操作失敗時不留下半完成會員狀態；
transaction 與外部清理失敗均有測試。

---

### A. 🟡 Public API 限流（Rate limiting）
**問題**：`/api/public/*` 是「知道 `hash_code` 即可檢視」的未登入端點，目前無任何速率限制，易被枚舉 / 爬取。
**現況**：刻意未做——Serverless（Vercel）下記憶體式限流形同虛設（各 instance 各自計數），須外部儲存。
**建議**：導入 Upstash Redis（`@upstash/ratelimit` + `@upstash/redis`）以 IP（或 `hash_code`）為 key 做滑動視窗限流，套在 8 條公開路由與 `/api/exchange-rates`。屬基礎設施決策，待確認方案後再做。

### G. 🟡 支出列表無上限（潛在效能）
**問題**：`getExpenses`（[expense.actions.ts](../src/actions/expense.actions.ts)）與公開 expenses 路由皆 `Expense.find({ trip })` 全量載入 + 雙 `populate`。一般旅行筆數有限尚可，但長期 / 大型旅行無分頁保護。
**建議**：先觀察實際資料量再決定。若需要，加上 `limit` + 游標分頁（以 `date`/`_id`），前端配合無限捲動；屬「為未來鋪路」，非當前痛點。

### H. 🟡 SW `r2-images` 快取上限對相簿偏低
**問題**：[sw.ts](../src/sw.ts) 的 `r2-images`（CacheFirst）`maxEntries: 128`，是為「一次看一兩張收據」設計的。
旅程相簿一頁就有數十張縮圖、軟上限 300 張／旅程，會把收據與頭像一起擠出快取（LRU）。
另外 `presignGetStable` 的簽名每個窗口（1 小時）輪替一次，同一張相片跨窗口就是新的快取 key，會加速這個消耗。
**建議**：把 `maxEntries` 提到 ~512，或把相簿縮圖切成獨立的 cacheName（與收據分開計數，較乾淨）。
兩者都要以 `pnpm build && pnpm start` 實測（dev 模式 SW 停用）。**先觀察實際用量再決定**——
相片是 CacheFirst，把上限開太大等於長期佔用使用者的儲存配額。

### I. 🟡 相簿上傳失敗會在 R2 留下孤兒物件
**問題**：相片是「先直傳 R2、再 `addTripPhotos` 入庫」兩段式（[photoUpload.ts](../src/lib/photoUpload.ts)）。
物件傳完但入庫失敗時（達 300 張軟上限、離線、DB 錯誤、使用者中途關頁），那些 blob 就沒有任何 doc 指向它，
只有「刪整個旅程」的 prefix 掃描會收掉。**已緩解**最常見的一種：一次選 >20 張不再整批被 Zod 打回
（`uploadPhotoFilesInBatches` 自動分批，且超量的檔案連壓縮都不做）。
**建議**：加一支定期任務（比照既有 Vercel Cron），列 `photos/<tripId>/` 前綴、
比對 `Photo` collection 的 key，刪掉超過 N 小時仍無人指向的物件。**不要在上傳失敗當下同步清**——
那條路徑本身就已經在出錯了，再加一個會失敗的網路呼叫只會更糟。

### J. 🟡 完整 Content Security Policy
**現況**：目前只有 `frame-ancestors 'none'` 等基礎安全標頭。
**完成條件**：加入 `default-src` / `script-src` 等完整 CSP，並實測 Leaflet 圖磚、R2 圖片/PDF、
next-themes 內嵌腳本、Radix 內嵌樣式與 production build，不可造成靜默功能失效。
