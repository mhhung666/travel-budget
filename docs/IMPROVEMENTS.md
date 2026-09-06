# 改善建議（Improvements）

> 更新日期：2026-09-06
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

### O. 🟡 MongoDB 索引正式推廣驗收（P1）

**2026-09-05 進度**：已建立 `pnpm mongodb:explain` 基線／前後比較、帳號 collation 重複掃描，
修正舊 explain 誤納 rejected plans，補上註冊及確認改信箱的 duplicate-key race 處理。
測試庫新增 7 顆索引，完成 135 次 before + 135 次 after explain：digest 掃描由 122 降至 5 筆，
四種旅程清單 SORT 消失，帳號使用 CI unique；回傳數不變、重複掃描為零。已補 additive migration、
schema 及 ownership rollback 測試。見 [MONGODB_INDEX_RESULTS.md](./MONGODB_INDEX_RESULTS.md)。
**尚待正式推廣驗收**：production-like snapshot、寫入成本及完整帳號 API 整合測試。
已補 `pnpm mongodb:verify-indexes` 隔離驗收工具（up/down、既有索引保護、DB 併發唯一性）；
已於本機隔離 MongoDB 8.0.29 執行，6 個情境全部通過，測試庫及容器已清理；未改動共用測試庫。
保留全部舊索引，未修改業務資料；目前成果不等於正式環境效能驗收。

**剩餘完成條件**：在可修改的隔離 snapshot 驗證較大資料量的讀寫成本、完整帳號 API 併發流程、
migrate-mongo changelog／lock 與正式操作審查。現有測試庫的索引由人工核准建立，migration down
不會誤刪這些既有索引；測試索引撤銷方式見結果文件。

### P. 🟡 支出寫入 critical path 瘦身（P1）

**第一階段已完成（2026-09-05）**：新增支出將成員驗證時讀取的 Trip 名稱、hashCode、成員快照傳給
通知，省去一次 Trip 讀取；通知與活動紀錄並行、仍等待兩者完成，並在 action 層隔離各自失敗。
快照僅由 server 讀取，不採用 client 提供的資料；收件者仍查 User 並排除本人／虛擬成員。
其他通知呼叫端保留原本的 Trip 查詢行為。

**背景處理前置已完成**：Web Push 提供逐裝置寄送結果，區分服務接受、失效、失敗及清理失敗，
供後續 worker 決定重試範圍；尚未啟用自動重試。設計、可靠性界線與待確認的排程頻率見
[EXPENSE_BACKGROUND_DELIVERY.md](./EXPENSE_BACKGROUND_DELIVERY.md)。

**佇列儲存層已完成**：Expense 內嵌工作狀態的原子 claim、token fencing、續租、退避重試與 5 次
上限，已通過本機隔離 MongoDB 的 7 個情境（含 12 worker 併發認領與過期接手）；測試庫／容器
已清理。尚未將儲存層接入 Expense schema／action、worker 或排程，不會產生實際背景工作。

**事件快照／站內去重模組已完成**：新增當下快照驗證、有效 lease 與事件歸屬檢查、成員交集、
partial unique + upsert，保留已讀狀態與舊紀錄；隔離 MongoDB 驗證已擴至 15 個情境並全部通過。
尚未接入 Expense schema／新增 action／worker，正式索引 migration 尚未建立。

**交易及生命週期防護已完成一階段**：站內紀錄與完成標記同交易寫入，Expense／Trip／User fence、
交易末端 lease 重查，已完成紀錄不復活已刪通知；deleteTrip 先標記再清理，失敗可重試刪除。
隔離 replica set 的 22 個情境通過；目標 DB 的 transaction 支援／成本、完整 action→worker 驗收、
對外推播去重仍待完成。刪除標記不是所有業務寫入的全面封鎖，R 的其他一致性工作仍保留。

**逐裝置進度儲存層已完成**：內嵌 accepted／expired checkpoint，有效 lease 與站內完成標記檢查、
首次結果保留、接手後保留進度、最多 256 裝置的原子容量保護。隔離 MongoDB 已擴至 24 項通過。
尚未串接寄送器／worker；HTTP 已接受但 checkpoint 未保存的中斷窗口仍可能重複寄送。

**逐裝置批次執行層已完成（未啟用）**：新增可注入的逐台執行流程，先檢查容量、每台重查租約，
略過已完成裝置、terminal 結果立即保存，並限制批次走訪數與開始新 HTTP 的時間預算。
22 項單元測試覆蓋停止／失敗／續跑；仍待實際資格查詢、單裝置 HTTP adapter、續租及 worker 接入。
此層完成不代表已縮短線上新增支出回應時間，P 仍未驗收完成。

**單裝置 HTTP 傳送層已完成（未啟用）**：沿用 web-push 加密／簽章，新增整次 HTTP
逾時中止、逐裝置 accepted／expired／failed 分類；不追蹤重新導向、不自動重試、不記錄敏感回應。
失效訂閱條件式清理、worker 續租及正式接入仍待完成；線上流程維持不變。

**送出前資格 adapter 已完成（未啟用）**：綁定支出／租約，重查事件歸屬、旅程刪除狀態、
事件成員與首次通知收件者及目前成員的交集、訂閱歸屬與真人使用者；查詢有時限、失敗向上拋出。
依收件者語系建立快照文案，ready 接單裝置傳送層，executor 送出前仍須重讀 checkpoint／租約。
尚待有界候選查詢及完整 worker；本批未變更線上支出流程。

**失效訂閱條件式清理已完成（未啟用）**：executor 保存結果後再次確認 expired checkpoint，
才以原訂閱 ID／owner／endpoint／keys 原子比對刪除；更新後不匹配的訂閱保留。
清理有單次 DB 時限，錯誤只累計 cleanupFailed，不將已保存結果改為重送；超出批次預算則略過。
程序中斷後不保證補清理，且無法辨識全部欄位相同的重新註冊；完整 worker 與候選查詢仍待完成。

**剩餘問題**：新增支出仍等待 populate、通知與活動紀錄完成，Web Push 延遲仍影響回應。
支出 Email 原本已走每日彙整，並非每筆即時寄送。活動紀錄仍會查 User；目前副作用僅 best-effort
記錄錯誤，尚無持久化重試或去重機制，不能視為 P 完整驗收通過。

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
