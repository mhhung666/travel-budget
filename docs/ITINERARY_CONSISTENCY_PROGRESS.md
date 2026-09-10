# R：行程與跨 collection 一致性

更新日期：2026-09-10

## 階段

| 階段 | 範圍 | 狀態 |
| --- | --- | --- |
| R1 | 舊草稿覆蓋保護與衝突提示 | 已完成工程驗證 |
| R2 | 穩定活動 ID、單筆新增／編輯／刪除原子更新，批次上限與衝突策略 | R2a～R2f 已完成工程與本機 MongoDB 併發驗證 |
| R3 | 虛擬成員轉換／會員移除／旅程刪除的一致性、外部清理重試 | R3a～R3c 成員／旅程刪除已完成；行程日／票券引用協調仍待後續處理 |
| R4 | 票券附件驗證的有界平行查詢 | 待處理 |

> R1～R2c 為各段交付紀錄；目前衝突 token 已由 R2d 的 revision 取代時間。

## R1 交付

- 行程首頁的活動新增、修改、刪除與整天欄位編輯都送出開啟時的 `updated_at`。
- action 要求有效 `expected_updated_at`，沿用登入、旅程成員及 admin 權限；先核對目前資料，
  寫入時仍以原時間作 compare-and-set，避免附件驗證期間另一請求搶先更新。
- action 自己的時間至少遞增 1ms；同一毫秒的兩次更新也不重用 token。
- 舊 token 或寫入未匹配回 `CONFLICT`，不清除票券、不同步相片座標。
- 四語錯誤提示不暴露內部例外；衝突重新查詢但不替換表單快照或清空草稿。
  使用者先複製要保留的內容，再關閉並重開編輯，以最新內容重新套用。
- 活動刪除確認框等待成功才關閉，失敗仍可取消；等待期間停用確認，避免重複提交。
- 沿用既有 DTO 時間欄位，沒有儲存 schema、query key 或 persisted cache shape 變更；
  不需要 migration、cache buster 或新增環境參數。舊客戶端缺 token 會拒絕寫入，需重載頁面。

## R1 驗證

新增 10 項測試：缺漏／無效 token、授權、消失的行程日、舊草稿、讀寫間競爭、
同毫秒兩請求只有一個成功、成功後票券清理，以及活動／整天表單的草稿保留與原 token 重試。
競爭測試使用受控 model mock，UI 使用真實 QueryClient 與 dialog；不是實際 MongoDB 併發驗收。

完整測試 1,385 項通過、37 項 opt-in 跳過；lint、Prettier、TypeScript、production build 與
diff whitespace 檢查通過。Build 覆寫 dummy MongoDB URI 與 JWT secret，未連共用 DB；
未執行實際 MongoDB 整合測試或正式瀏覽器驗收。

## R2a 交付

- 編輯、重排或刪除活動時保留留下來的子文件 `_id`；草稿的儲存 ID 與前端 render key 分開。
- 更新陣列中的每列必須明確帶 `id`：既有活動帶原 ID，新增列帶 `null` 由 Mongoose 產生 ID。
  伺服器在附件驗證前拒絕格式錯誤、重複或不屬於該天的 ID；舊客戶端漏傳 ID 會拒絕更新，需重載。
- 新建行程日仍由伺服器產生活動 ID。AI 匯入與筆記轉活動的 `$push` 已保留既有 ID，無需改寫。
- 沿用現存子文件 `_id` 與 DTO `id`，沒有資料庫 schema 或 persisted query shape 變更，不需要 migration。
- 新增 8 項測試涵蓋草稿身分、新增／編輯／重排／刪除，以及錯誤 ID 拒絕；保留 R1 衝突與副作用測試。
- 完整測試 1,393 項通過、37 項 opt-in 跳過；lint、格式、TypeScript、production build 及 diff 檢查通過。
  Build 使用 dummy MongoDB URI 與 JWT secret；未執行真實 MongoDB 併發或瀏覽器驗收。

## R2b 交付

- 行程頁的活動新增／編輯／刪除改用 `mutateItineraryActivity`，分別以 `$push`、定位 `$set`
  及 `$pull` 寫入單筆；不再從前端送回整天活動陣列，既有活動 ID 保留。
- action 自行驗證登入、旅程成員、admin、輸入及目標 ID，沿用整天 `expected_updated_at` 的讀取
  與條件寫入保護，新時間至少遞增 1ms；單筆活動內容中的 ID 不作為寫入目標。
- 新增／編輯只驗證目標活動的票券；更新成功後，移除的附件若仍存在成功寫入的當天其他活動，
  就不清理。票券清理失敗只記錄，衝突不清附件；單筆活動不觸發整天地點的相片同步。
- mutation 沿用四語提示與草稿保留；刪除框仍等待成功才關閉，等待期間停用確認。
- 沒有 schema、DTO、persisted cache shape 或環境參數變更，不需要 migration。
- 新增 17 項 action 測試，活動表單衝突測試改走單筆 action；競爭測試使用 model mock，
  不代表真實 MongoDB 併發驗收。
- 完整測試 1,410 項通過、37 項 opt-in 跳過；lint、格式、TypeScript、production build 與 diff 檢查通過。
  Build 使用 dummy MongoDB URI 與 JWT secret，未連共用 DB；未做真實瀏覽器驗收。

## R2c 交付

- 手動建立／整陣列更新、單筆新增、筆記轉活動及 AI 匯入統一每天最多 15 個活動。
  新增或整陣列超量在附件驗證前拒絕；追加活動使用共用容量條件，與 MongoDB 寫入一起判斷，
  不依賴先讀數量來防止並行超量。AI 單次匯入的天數與總活動上限維持原契約。
- 已有超過上限的資料不刪除，仍可單筆編輯／刪除與更新整天欄位；新增必須先降至上限以下，
  整陣列提交則必須符合上限。
- 滿額回傳容量錯誤並提供四語提示；筆記追加失敗不標記已規劃，選擇器保留以便改選其他天。
  手動追加若在讀寫間失去容量或 token，沿用衝突提示與草稿保留。
- 本段沒有 schema、DTO 或 query shape 變更，不需要 migration。
- 新增 8 項測試涵蓋滿額／歷史超量、最後一個位置的寫入條件、批次提前拒絕、筆記不誤標及四語提示入口。
  使用 model mock，未執行真實 MongoDB 併發驗收。
- 完整測試 1,418 項通過、37 項 opt-in 跳過；lint、格式、TypeScript、production build 與 diff 檢查通過。
  Build 使用 dummy MongoDB URI 與 JWT secret；未連共用 DB，未做真實瀏覽器驗收。

## R2d 交付

- 行程日新增明確的整數 revision；建立預設為 0。手動整天／單筆活動更新、AI 追加、
  筆記轉活動及刪日後重新編號均在同一 MongoDB 更新中以 `$inc` 遞增。
- 前端攜帶開啟時的 `expected_revision`，伺服器先核對再作條件寫入；即使時間相同也能拒絕舊草稿。
  缺少 revision、負數、小數或超出安全整數範圍的 token 會拒絕；只有時間的舊客戶端必須重載。
- DTO 新增 revision，已更新 persisted cache buster；顯示時間仍保留，無舊欄位讀取 fallback。
- 新增 migration `20260909120000-itinerary-day-revision.js`，up 只回填缺欄位文件，重跑不重設已有版本；
  down 移除欄位。已用記憶體 collection fake 驗證重跑／回退，未對共用或正式 DB 執行。
- **部署順序**：暫停行程寫入並排空舊版請求 → `pnpm migrate:up` → 部署全部新 writer →
  恢復寫入並重載頁面。不可讓舊 writer 與新版並存；回退時先停用 revision 客戶端／回退 app，再執行 down。
- 新增 8 項測試並更新既有 writer／表單測試；完整 1,426 項通過、37 項 opt-in 跳過，
  lint、格式、TypeScript、production build 與 diff 檢查通過。Build 使用 dummy MongoDB URI 與 JWT secret；
  未執行真實 MongoDB 併發或瀏覽器驗收。
- 衝突粒度仍是整天；下一段才細化至活動，沒有宣稱跨 collection 副作用已具交易保證。

## R2e 交付

- 活動新增 revision，編輯／刪除要求開啟時的 `expected_activity_revision`，讀取與原子 `$elemMatch`
  都核對同一活動 ID + revision；不同活動編輯互不阻擋，同活動舊草稿拒絕且保留內容。
- 新增以原子容量條件寫入，可並行追加；整天 revision 仍由所有 writer 原子遞增，
  整批更新則使所有保留活動 revision 遞增，避免舊單筆草稿覆蓋批次結果。
- 單筆寫入用 `$max` 更新顯示時間，避免不同活動的慢請求讓時間倒退。
- DTO、cache buster 與表單已同步；新活動由 model 預設 revision 0，讀端無 fallback。
- 新增 `20260909130000-itinerary-activity-revision.js`，只回填缺欄位活動，不重設已有版本；
  down 移除活動 revision。沿用 R2d 部署順序：暫停寫入、排空舊請求 → `pnpm migrate:up` →
  部署所有新版 writer → 恢復寫入並重載。回退前停用新版客戶端並回退 app。
- 本段以 model mock 驗證同活動競爭、不同活動並行、容量最後一位、整批版本遞增及表單保留；
  migration 用記憶體 fake 驗證冪等與回退。完整 1,436 項測試通過、37 項 opt-in 跳過；
  lint、格式、TypeScript 與 dummy 環境 production build 通過。真實 MongoDB 驗收留給 R2f。

## R2f 驗收與結案

- 新增 [itineraryConcurrency.integration.test.ts](../src/__tests__/itineraryConcurrency.integration.test.ts)，
  使用真實 Server Actions、membership、Mongoose model 與 MongoDB 寫入；只替換 session、外部儲存／
  相片重綁／動態紀錄及 Next cache。附件 HEAD barrier 固定讀寫間交錯，不靠機率撞出競爭。
- 本機 MongoDB 8.0.13 的獨立隨機測試庫通過 16 項測試：兩位 admin 編輯相同／不同活動、
  並行追加與最後一個名額、ID + revision 同元素匹配、刪除不復活、整批與單筆互斥、
  慢請求時間不倒退、手動／筆記／AI 的版本預設與容量、AI 冪等、權限／trip scope、
  相同日的附件共用／公開讀取隱私、重新編號，以及兩支 migration 的冪等和回退。
- 測試只接受專用 URI + write opt-in，強制建立隨機空 DB；結束時只刪自己的測試庫。
  不載入 `.env`，不回退使用 app URI。重跑方式（URI 指向測試 MongoDB）：

  ```bash
  MONGODB_ITINERARY_TEST_URI='mongodb://127.0.0.1:27029' \
    MONGODB_ITINERARY_TEST_ALLOW_WRITES=1 \
    pnpm vitest run src/__tests__/itineraryConcurrency.integration.test.ts
  ```

- 含 MongoDB 整合測試的完整 suite 共 1,452 項通過、37 項 opt-in 跳過；TypeScript、lint、格式通過。
  Production build 沿用 R2e 的成功結果，本段未修改產品程式。
- R2 的穩定 ID、單筆原子更新、批次上限與活動衝突策略已完成；本段僅測試與文件，不重複 bump 版本。
  驗收為本機 standalone MongoDB，不代表正式拓撲、跨 collection transaction 或真人瀏覽器驗收。
- R3、R4 維持未完成；部署仍須遵守 R2d／R2e 的停寫、遷移、新 writer 上線順序。

## 後續界線

- 整天欄位與整陣列更新仍需整天 revision；不同活動的單筆編輯已能並行。
- 所有新 writer 必須遞增整天 revision；改寫既有活動亦須遞增活動 revision。
- 行程日刪除、地點更新後的相片同步及成功寫入後的 R2 blob 清理仍有跨資源競爭／部分失敗風險。
  附件跨天共用與刪除後重新引用需要 R3 的引用／清理協調，單靠查詢是否仍引用不能消除競爭。
- 新增活動不提供請求冪等：回應遺失後重送可能重複新增；AI 匯入沿用自身冪等 key。
- 未操作正式 DB、真實通知、AI provider、push 或部署。

## R2 部署狀態

使用者於 2026-09-10 確認 R2 已正式部署。本次未另行執行正式站驗收。

## R3a：身分轉換

- 公開註冊／連結入口保留原有 capability 與密碼驗證；交易內重新核對分享碼、成員資格、虛擬狀態、目標帳號與密碼 hash。
- Trip 與 User 實際寫入使並行認領／註冊、成員移除與背景事件互斥；交易內不執行 bcrypt、登入 cookie 或外部 HTTP。
- 連結一次搬移本旅程 payer、splits、還款 from/to、清單 assignee/doneBy，保留金額與成員設定，清除舊身分收件通知。
- 保留虛擬 User 與歷史 createdBy／actor，不以引用快照判斷可刪除，避免其他旅程與歷史資料出現孤兒參照。
- 本機獨立 replica set 的 9 項測試通過，涵蓋晚期失敗全部回滾、並行認領、分享碼撤銷、成員移除、刪除標記、密碼變更及唯一鍵衝突。
- 不需 migration；需要支援 transaction 的 replica set／sharded MongoDB，不支援 standalone fallback。
- R3 分階段提交，應用版本依 AGENTS.md 在最後交付提交統一調升一次。會員移除與刪除／外部清理尚未完成。

## R3b：成員移除

- 交易內重新驗證 admin 與目標成員；Trip 寫入與身分連結／背景事件互斥。
- 成員陣列、清單 assignee/doneBy 與收件通知一起提交或回滾，保留財務紀錄、歷史動態與 User。
- 新增 4 項真實 replica set 測試，涵蓋完整清理、晚期失敗回滾、移除與認領競態、權限變更與自我移除；含 R3a 共 13 項通過。
- 完整 suite 1,436 項通過；未啟用的 MongoDB/live provider 測試跳過，不視為通過。
- 不需 migration；下一階段處理旅程刪除與持久化外部清理工作。

## R3c：旅程刪除與外部清理

- `deleteTripAtomically` 在同一 transaction 重新核對 admin、寫入 parent fence、建立清理工作、刪除旅程子資料及 parent；FlightRecord／StayRecord 僅解除連結。
- 任何 DB 步驟失敗會連同刪除標記與工作一起回滾；舊版留下的刪除標記仍可由 admin 重試完成。
- 新增 `tripcleanupjobs`，`_id` 即旅程 ID；記錄每個 prefix 的清理進度、5 分鐘租約與 token。外部 HTTP 不在 transaction 內，失敗不影響已完成的刪除。
- 每頁最多 1,000 個物件、5 秒 timeout，S3 HTTP 成功但回報部分 Errors 也必須重試。失效 worker 無法覆寫新租約的 checkpoint。
- 首次完成後至少 24 小時再掃一次全部 prefix 與殘留子資料，收掉刪除前已簽發的上傳網址／執行中的晚到寫入。完成工作保留最小 tombstone；這不是對任意長時間的外部還原／直接 DB 寫入提供保證。
- `/api/cron/trip-cleanup` 沿用 CRON_SECRET，Vercel 每日 UTC 14:00 補撿；每次最多 10 個工作批次、40 秒軟期限，平台上限 60 秒。外部失敗保留工作，不設 TTL 丟棄未完成工作。
- 本機 replica set 共 21 項 R3 整合測試通過；另有 storage 部分失敗／分頁及 cron 授權測試。這些不代表正式 R2 或正式排程驗收。

### 部署與重跑

1. 部署前執行 `pnpm migrate:up`，建立 `20260910090000-trip-cleanup-jobs.js` 的 collection／索引；本次只對隔離測試 DB 驗證，未操作正式 DB。
2. 部署本次全部提交，確認 CRON_SECRET 與新排程。交易需要 replica set／sharded MongoDB。
3. 指定測試旅程驗收刪除與 `tripcleanupjobs` 的 firstSweepAt／completedAt；需要立即補撿時可由受授權的 cron GET 執行同一個有界 worker。
4. 回退前先排空未完成工作；migration down 只移除自有索引，不刪除工作資料。舊版不會處理新工作，不能把 rollback 當作已完成清理。

隔離測試不載入 `.env`、不用 app URI，強制建立隨機空庫並只刪除自己的測試庫：

```bash
MONGODB_MEMBER_TEST_URI='mongodb://127.0.0.1:27030/?replicaSet=r3test' \
  MONGODB_MEMBER_TEST_ALLOW_WRITES=1 \
  pnpm vitest run src/__tests__/memberIdentity.integration.test.ts
```

### 尚存界線

本次 R3a～R3c 交付涵蓋身分轉換、成員移除與旅程刪除。行程日刪除／重新編號／相片重綁，
以及存活旅程內票券跨天引用與刪除後重新引用，仍需獨立的交易／引用清理協調；未宣稱已處理。
一般支出、還款、清單等 writer 尚未全部加入 Trip fence，因此不承諾移除／轉換與所有晚到一般寫入具全域序列化。
保留 User 避免因此造成懸空身分；旅程刪除則由延後清掃處理正常請求生命週期內的晚到寫入。

### R3a～R3c 本次交付驗證

完整 suite（啟用隔離 replica set）1,464 項通過、53 項未啟用測試跳過；lint、Prettier、TypeScript、dummy DB/JWT 環境 production build 與 diff whitespace 檢查通過。版本在 R3c 交付提交統一 patch bump 一次。未 push、部署或操作正式資料。
