# 技術改善與驗收待辦

> 更新日期：2026-09-16。跨項目完成狀態見 [專案總覽](../../README.md)。
> 本文件只保留未結案項目；已完成的 S、Q 工程歷程與 P 驗收結案見總覽連結，不在此重列。

<a id="目前優先順序"></a>

## 待驗收：工程已完成

既定優先順序為 O → R → M。以下是尚缺的驗收證據，不代表要重新實作或重跑已完成的 migration。
正式環境缺少對應部署 commit；頁面版本、使用者回報已 push 或正常 UI 流程均不能單獨取代部署紀錄。

| 順序／項目 | 已有證據 | 尚缺／完成條件 | 詳細規範與證據 |
| --- | --- | --- | --- |
| 1．O MongoDB 正式效能 | 七個共用索引已登錄；隔離資料 explain／寫入量測、account actions 與正式登入／唯讀抽查完成 | 代表性 Atlas 分布與併發下的讀寫成本、profiler/explain 與長尾 server trace；註冊／改信箱 HTTP＋郵件流程 | [索引結果](../tests/MONGODB_INDEX_RESULTS.md)、[線上抽查](../tests/MONGODB_LIVE_ACCEPTANCE.md) |
| 2．R 行程與資料一致性 | R1～R4 工程完成；使用者回報 migration／push 完成；正式活動 CRUD、舊草稿衝突與 PDF 票券正常流程通過 | 部署與 migration／writer 同時上線證據；整天欄位修改、成員變更、跨 collection 競態；附件退休、R2 最終清理及 cron 結果 | [階段紀錄與部署要求](../history/ITINERARY_CONSISTENCY_PROGRESS.md)、[正式流程證據](../tests/PRODUCTION_ACCEPTANCE_2026-09-12.md) |
| 3．M 前端體驗與效能（含 Q） | Shell 拆分與 Q1～Q3 工程完成；表單與支出背景更新失敗重試、搜尋、快速記帳與 PDF 正常流程通過；09-16 相簿檢視器失敗重試、23／36 筆列表與圖片收據正常流程通過，另留存 12 次冷／熱 Network／Performance trace 並完成 Network 等待分析 | 核對 Q 交付 `ac54811` 或後續部署；超過 40 筆多批列表；代表性資料量 Network bytes、Performance trace／TTI 與 MongoDB profiler/explain；最慢 cold 單一 POST wait 4,092 ms 尚待 server span 歸因 | [Q 驗收勾選表](../history/QUERY_UX_PROGRESS.md#部署後驗收移交-m尚未執行)、[量測規範](../tests/QUERY_UX_PERFORMANCE.md)、[09-16 補驗](../tests/PRODUCTION_ACCEPTANCE_2026-09-16.md) |

執行條件與界線：

- O 需要隔離環境、可丟棄帳號／信箱、代表性負載及可接受延遲標準；不以共用 DB 壓測代替。
- R 的正常 UI 流程通過不代表清理 worker 已驗收；保留既有 tombstone 與部署順序要求。
- M 與 O 的量測可共用同一代表性場景及證據；小樣本 bytes／readyMs 不代表正式 CWV 或完整效能結案。
- iOS Safari／安裝版 PWA 依使用者 09-15 決定暫時通過、未實測，本輪不列為阻擋；AI 真實 provider 品質驗收繼續暫緩。

## 待改善：尚未完成的技術項目

A／I／J 尚待方案或實作；G／H 先觀察，沒有實際需求前不直接排入開發。
R 處理已入庫附件的退休與可重試清理；I 處理上傳成功但從未入庫的孤兒物件，兩者範圍不同。

### A. 待方案：Public API 限流（Rate limiting）
**問題**：`/api/public/*` 是「知道 `hash_code` 即可檢視」的未登入端點，目前無任何速率限制，易被枚舉 / 爬取。
**現況**：刻意未做——Serverless（Vercel）下記憶體式限流形同虛設（各 instance 各自計數），須外部儲存。
**建議**：導入 Upstash Redis（`@upstash/ratelimit` + `@upstash/redis`）以 IP（或 `hash_code`）為 key 做滑動視窗限流，套在 8 條公開路由與 `/api/exchange-rates`。屬基礎設施決策，待確認方案後再做。

### G. 待觀察：支出列表無上限（潛在效能）
**問題**：`getExpenses`（[expense.actions.ts](../../../src/actions/expense.actions.ts)）與公開 expenses 路由皆 `Expense.find({ trip })` 全量載入 + 雙 `populate`。一般旅行筆數有限尚可，但長期 / 大型旅行無分頁保護。
**建議**：先觀察實際資料量再決定。若需要，加上 `limit` + 游標分頁（以 `date`/`_id`），前端配合無限捲動；屬「為未來鋪路」，非當前痛點。

### H. 待觀察：SW `r2-images` 快取上限對相簿偏低
**問題**：[sw.ts](../../../src/sw.ts) 的 `r2-images`（CacheFirst）`maxEntries: 128`，是為「一次看一兩張收據」設計的。
旅程相簿一頁就有數十張縮圖、軟上限 300 張／旅程，會把收據與頭像一起擠出快取（LRU）。
另外 `presignGetStable` 的簽名每個窗口（1 小時）輪替一次，同一張相片跨窗口就是新的快取 key，會加速這個消耗。
**建議**：把 `maxEntries` 提到 ~512，或把相簿縮圖切成獨立的 cacheName（與收據分開計數，較乾淨）。
兩者都要以 `pnpm build && pnpm start` 實測（dev 模式 SW 停用）。**先觀察實際用量再決定**——
相片是 CacheFirst，把上限開太大等於長期佔用使用者的儲存配額。

### I. 待實作：相簿上傳失敗會在 R2 留下孤兒物件
**問題**：相片是「先直傳 R2、再 `addTripPhotos` 入庫」兩段式（[photoUpload.ts](../../../src/lib/photoUpload.ts)）。
物件傳完但入庫失敗時（達 300 張軟上限、離線、DB 錯誤、使用者中途關頁），那些 blob 就沒有任何 doc 指向它，
只有「刪整個旅程」的 prefix 掃描會收掉。**已緩解**最常見的一種：一次選 >20 張不再整批被 Zod 打回
（`uploadPhotoFilesInBatches` 自動分批，且超量的檔案連壓縮都不做）。
**建議**：加一支定期任務（比照既有 Vercel Cron），列 `photos/<tripId>/` 前綴、
比對 `Photo` collection 的 key，刪掉超過 N 小時仍無人指向的物件。**不要在上傳失敗當下同步清**——
那條路徑本身就已經在出錯了，再加一個會失敗的網路呼叫只會更糟。

### J. 待實作：完整 Content Security Policy
**現況**：目前只有 `frame-ancestors 'none'` 等基礎安全標頭。
**完成條件**：加入 `default-src` / `script-src` 等完整 CSP，並實測 Leaflet 圖磚、R2 圖片/PDF、
next-themes 內嵌腳本、Radix 內嵌樣式與 production build，不可造成靜默功能失效。
