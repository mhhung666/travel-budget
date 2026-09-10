# 改善建議（Improvements）

> 更新日期：2026-09-10
> 本文件只列**尚未處理**的程式碼 / 基礎設施層級改善。已完成里程碑見 [CHANGELOG.md](./CHANGELOG.md)，架構說明見 [ARCHITECTURE.md](./ARCHITECTURE.md)。
> 慣例：處理完一項 → 移到 [CHANGELOG.md](./CHANGELOG.md)、從本檔刪除。

狀態圖例：🔴 優先處理　⚠️ 待處理　🟡 部分完成 / 待外部條件

## 目前優先順序

本輪先改善既有程式流程、MongoDB 讀寫與畫面載入體驗；AI 行程匯入、收據分析與自然語言記帳的
真實 provider 品質驗收暫緩，不列入以下執行順序。

| 順序 | 項目 | 主要價值 | 建議批次 |
| ---: | --- | --- | --- |
| 1 | O. MongoDB 正式效能驗收 | 確認實際負載下的讀寫成本 | 🟡 migration 與工程驗收完成 |
| 2 | P. 支出背景處理部署驗收 | 確認正式環境回應延遲與補送恢復 | 🟡 程式與 migration 已完成 |
| 3 | R. 原子更新與跨 collection 一致性 | 降低多人編輯覆蓋及部分寫入 | P2，依使用頻率安排 |
| 4 | M. production-like 效能追蹤（含 Q 部署後觀測） | 補齊實際 bytes、MongoDB profiler 與 TTI 數據 | 🟡 需測試環境與帳號 |

Q1～Q3 已於 2026-09-09 工程結案，使用者回報已 push；不再列為待實作項目。
交付與驗證見 [Q 結案紀錄](./QUERY_UX_PROGRESS.md)，正式環境觀測統一由 M 追蹤，尚未宣稱通過。

### M. 🟡 輕量 Trip Shell 的 production-like 效能追蹤

程式拆分與 production build 已完成：非支出分頁不再由共用 Shell 取得完整 expenses，表單關閉時不查
members／itinerary／tags，首頁摘要也改用 aggregate 欄位。靜態基線與待補實測項目見
[TRIP_SHELL_PERFORMANCE.md](./TRIP_SHELL_PERFORMANCE.md)。目前已可連線 DB，並完成指定正式站帳號的登入與唯讀抽查；仍需在
production-like 資料量下補 Network bytes、MongoDB profiler/explain 與瀏覽器 TTI，確認實際收益及是否要調整
aggregate／索引；完成後即可從本檔移除。

Q 部署後觀測也歸入本項：確認 Vercel production 對應 Q 最終交付 `ac54811` 或包含它的後續 commit，
再以正式帳號驗證冷／熱載入、查詢錯誤重試、按需載入與搜尋，以及實機／安裝 PWA 的表現。
使用者已回報 push，但本次未核對部署結果或執行線上驗收。
具體待辦見 [Q 部署後驗收清單](./QUERY_UX_PROGRESS.md#部署後驗收移交-m尚未執行)，
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

- Commit 後 push／Vercel production 部署，確認 CRON_SECRET 與每日排程。
- 使用指定測試旅程／帳號驗證支出 DTO、站內通知、活動紀錄及推播。
- 在隔離環境驗證中斷／失敗恢復，記錄新增支出 p50／p95 與最舊 pending 延遲。

正式驗收未通過前仍保留本項，不以本機測試替代線上結果。
唯一驗收清單與可靠性限制見 [EXPENSE_DELIVERY_ACCEPTANCE.md](./EXPENSE_DELIVERY_ACCEPTANCE.md)；
歷次模組開發紀錄見 [EXPENSE_BACKGROUND_DELIVERY.md](./EXPENSE_BACKGROUND_DELIVERY.md) 與 Git 歷史。
HTTP 已接受但 checkpoint 尚未保存仍可能重送；不承諾推播永久 exactly-once。

### R. ⚠️ 原子更新與跨 collection 一致性（P2）

**進度（2026-09-10）**：使用者確認 R2 已正式部署。R3a～R3c 已將虛擬成員註冊／連結、成員移除與旅程刪除改為 transaction；旅程外部清理具持久化工作、租約、checkpoint、重試與延後清掃。使用者已確認 migration 與部署成功。R3d 已將刪日、編號及相片重綁納入同一 transaction，詳見 [R 分階段進度](./ITINERARY_CONSISTENCY_PROGRESS.md)。

**仍待處理**：新增行程日、日期／地點及相片／支出 writer 的跨 collection 協調，以及存活旅程內票券跨天引用與重新引用的清理協調。
一般支出／還款／清單 writer 仍未全部加入 Trip fence，需繼續縮小移除／轉換後晚到寫入的競爭窗口。
R4 的附件 `headObject` 有界平行驗證另列下一階段。

**完成條件**：行程日與相片關聯不因中途失敗部分完成；附件清理不刪除仍引用或重新引用的檔案；
一般 writer 與成員變動競態有實際 MongoDB 驗證。R3a～R3c 不冒稱上述後續事項已完成。

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
