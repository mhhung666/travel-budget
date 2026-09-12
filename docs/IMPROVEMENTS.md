# 改善建議（Improvements）

> 更新日期：2026-09-12
> 本文件只列**尚未處理**的程式碼 / 基礎設施層級改善。已完成里程碑見 [CHANGELOG.md](./CHANGELOG.md)，架構說明見 [ARCHITECTURE.md](./ARCHITECTURE.md)。
> 慣例：處理完一項 → 移到 [CHANGELOG.md](./CHANGELOG.md)、從本檔刪除。

狀態圖例：🔴 優先處理　⚠️ 待處理　🟡 部分完成 / 待外部條件

## 目前優先順序

本輪先改善既有程式流程、MongoDB 讀寫與畫面載入體驗；AI 行程匯入、收據分析與自然語言記帳的
真實 provider 品質驗收暫緩，不列入以下執行順序。

| 順序 | 項目 | 主要價值 | 建議批次 |
| ---: | --- | --- | --- |
| 1 | S. 離線重載遺失待同步支出 | 避免已告知暫存成功的記帳資料遺失 | 🔴 正式站重現，阻擋驗收 |
| 2 | O. MongoDB 正式效能驗收 | 確認實際負載下的讀寫成本 | 🟡 migration 與工程驗收完成 |
| 3 | P. 支出背景處理部署驗收 | 確認正式環境回應延遲與補送恢復 | 🟡 單人寫入與 done 觀測通過，通知／排程／失敗恢復待驗 |
| 4 | R. 部署與一致性驗收 | 確認新版 writer 與清理 worker 一致上線 | 🟡 CRUD／活動衝突／票券正常流程通過，部署／清理待驗 |
| 5 | M. production-like 效能追蹤（含 Q 部署後觀測） | 補齊實際 bytes、MongoDB profiler 與 TTI 數據 | 🟡 已補冷／熱小樣本，離線缺陷與效能／PWA 待驗收 |

Q1～Q3 已於 2026-09-09 工程結案，使用者回報已 push；不再列為待實作項目。
交付與驗證見 [Q 結案紀錄](./QUERY_UX_PROGRESS.md)，正式環境觀測統一由 M 追蹤，尚未宣稱通過。

### S. 🔴 離線重載遺失待同步支出

2026-09-12 正式站兩次重現：離線新增顯示「已暫存／待同步」，保持離線重載後支出消失，
恢復連線也未補送。已確認 IndexedDB 的 paused mutation 由 1 筆變 0 筆，optimistic 列也被移除。
不重載直接恢復連線則可成功補送，問題集中於離線啟動與還原。

本機已修正 QueryProvider：建立 QueryClient 前以瀏覽器 navigator.onLine 初始化 onlineManager，
避免離線啟動時誤送還原工作。新增 provider 整合回歸，透過實際 JSON persister 與兩次離線
重新掛載確認工作、optimistic 列與摘要保留，恢復連線只補送一次；IndexedDB 邊界使用記憶體替身。
尚待正式瀏覽器／IndexedDB／SW 重載驗收；離線載入失敗提示與傳輸中斷的持久保留仍待處理。
完成條件：同步初始連線狀態、保留可重試工作與草稿，覆蓋重複離線重載／恢復補送的瀏覽器回歸。
詳見 [正式站補充驗收](./PRODUCTION_ACCEPTANCE_2026-09-12.md)。S 修復前不宣稱離線記帳完整通過。

### M. 🟡 輕量 Trip Shell 的 production-like 效能追蹤

程式拆分與 production build 已完成：非支出分頁不再由共用 Shell 取得完整 expenses，表單關閉時不查
members／itinerary／tags，首頁摘要也改用 aggregate 欄位。靜態基線與待補實測項目見
[TRIP_SHELL_PERFORMANCE.md](./TRIP_SHELL_PERFORMANCE.md)。先前曾完成 DB 連線與正式帳號唯讀抽查；本輪本機 DB 連線不可用，仍需在
production-like 資料量下補 Network bytes、MongoDB profiler/explain 與瀏覽器 TTI，確認實際收益及是否要調整
aggregate／索引；完成後即可從本檔移除。

Q 部署後觀測也歸入本項。2026-09-11 已在 `budget.mhhung.com` 使用指定帳號完成部分正式站驗收：
行程、支出、旅程設定、個人設定與歷史紀錄於桌面及手機 viewport 正常顯示；
慢速請求顯示骨架並完成載入，歷史紀錄請求失敗後可手動重試恢復，新增支出表單可開啟／關閉。
已完成紀錄見 [CHANGELOG.md](./CHANGELOG.md)；該次為唯讀操作，手機 viewport 不等同實機或安裝 PWA。

09-11～09-12 已補 12 次正式支出頁冷／熱載入與頁面 bytes 觀測、動態表單失敗重試、
搜尋／清除、快速記帳與 PDF 檢視器正常流程；詳見 [補充驗收報告](./PRODUCTION_ACCEPTANCE_2026-09-12.md)。
離線重載發現 S 缺陷，不能列為通過。仍需背景更新失敗保留內容、檢視器失敗重試、更多列表、
代表性大資料量、實機／安裝 PWA、MongoDB profiler/explain 與 TTI。
Vercel production 對應 Q 最終交付 `ac54811` 或其後續 commit 仍未核對，頁面版本不是部署證據。
小樣本量測不代表 M 效能結案，O／P／R 仍依各自條件驗收。
剩餘範圍見 [Q 部署後驗收清單](./QUERY_UX_PROGRESS.md#部署後驗收移交-m尚未執行)，
量測條件與隱私限制見 [效能報告](./QUERY_UX_PERFORMANCE.md)。

### O. 🟡 MongoDB 索引正式推廣驗收（P1）

**2026-09-08 工程交付完成**：七顆共用 DB 索引已核對並正式登錄 core-query migration，
不必重跑；非 owned 登錄不會讓 down 刪除既有索引。受限登錄工具拒絕 DDL／業務寫入，
隔離驗收 8 情境通過。真實 MongoDB account actions 5 項測試驗證註冊、登入、改信箱及競態。
10 萬筆合成支出 snapshot 的摘要掃描由 100,000 降至 100，四類清單 SORT 消失；
另完成五個 collection 的批次寫入量測，付款 p95 有上升，未宣稱全面加速。
共用 DB 登錄後唯讀 explain 確認索引採用。操作與結果見
[MONGODB_INDEX_RESULTS.md](./MONGODB_INDEX_RESULTS.md)。

**僅剩正式效能驗收**：合成資料與本機單節點不等同實際 Atlas 分布／併發；
account actions 測試替換了 session／郵件邊界，非完整 HTTP E2E。
已使用指定正式站帳號完成真實登入、大小寫登入、session／登出及旅程頁面唯讀 smoke test，
見 [線上驗收](./MONGODB_LIVE_ACCEPTANCE.md)。部分頁面讀取有長尾，尚無 server trace 可歸因。
仍需隔離環境、可丟棄帳號／信箱、代表性負載與可接受延遲標準，驗證寫入成本及註冊／改信箱
HTTP＋郵件流程；不向共用 DB 壓測或任意修改現有帳號，本項不冒稱完全結案。

### P. 🟡 程式交付完成，待部署驗收（P1）

**目前狀態（2026-09-08）**：背景 worker／action／離線對帳整合完成；背景模式預設 on，
不必新增參數，off 僅供緊急回退。Hobby 每日補撿設定已加入；四個共用 DB 索引已建立、
驗證並登錄 changelog，不必重跑 P migration。已完成里程碑見 [CHANGELOG.md](./CHANGELOG.md)。

**僅剩正式環境收尾**：

- 核對 Vercel production 部署 commit、背景開關與每日排程實際執行紀錄。
- 單人測試已驗證支出新增／修改／刪除、活動紀錄及 done 計數；仍需 action DTO、逐事件 checkpoint、其他收件人站內通知與實際推播。
- 授權 inspect 已回 200，未授權回 401；曾有一次 503，稍後恢復，需 server trace 追查。
- 在隔離環境驗證中斷／失敗恢復，記錄新增支出 p50／p95 與最舊 pending 延遲。
- 離線重載補送未通過，須先修復 S；不重載直接恢復連線已成功補送。

正式驗收未通過前仍保留本項，不以本機測試替代線上結果。
唯一驗收清單與可靠性限制見 [EXPENSE_DELIVERY_ACCEPTANCE.md](./EXPENSE_DELIVERY_ACCEPTANCE.md)；
歷次模組開發紀錄見 [EXPENSE_BACKGROUND_DELIVERY.md](./EXPENSE_BACKGROUND_DELIVERY.md) 與 Git 歷史。
HTTP 已接受但 checkpoint 尚未保存仍可能重送；不承諾推播永久 exactly-once。

### R. 🟡 工程結案，部署與線上驗收待確認

R1～R4 已完成工程與測試；使用者於 2026-09-11 回報 migration 已執行、全部程式已 push，不再有 R 系列待實作項目。
09-11～09-12 正式站已驗證行程日新增／刪除、活動 CRUD、兩分頁舊草稿衝突保護，以及 PDF 票券上傳／保存／檢視。
仍需核對最新 commit 與 migration／writer 一致上線、整天欄位修改、跨 collection 競態、成員變更、附件退休與清理 cron 的實際結果。
上述正常流程不代表清理 worker 已驗收；證據見 [補充驗收](./PRODUCTION_ACCEPTANCE_2026-09-12.md)，
部署要求見 [R 分階段進度](./ITINERARY_CONSISTENCY_PROGRESS.md)。

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
