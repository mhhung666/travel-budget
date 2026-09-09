# R：行程與跨 collection 一致性

更新日期：2026-09-09

## 階段

| 階段 | 範圍 | 狀態 |
| --- | --- | --- |
| R1 | 舊草稿覆蓋保護與衝突提示 | 已完成工程驗證 |
| R2 | 穩定活動 ID、單筆新增／編輯／刪除原子更新，批次上限與衝突策略 | R2a 穩定 ID、R2b 單筆寫入、R2c 活動上限已完成；revision 與衝突粒度待處理 |
| R3 | 虛擬成員轉換／會員移除／旅程刪除的一致性、外部清理重試 | 待處理 |
| R4 | 票券附件驗證的有界平行查詢 | 待處理 |

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

## 後續界線

- 行程頁已改單筆活動寫入；`updateItineraryDay` 仍保留舊客戶端的整陣列更新契約。
  不同活動的並行編輯仍會要求重開，不自動合併。下一段 R2d 處理所有寫入入口的 revision
  與活動衝突粒度。
- R2 必須同步盤點 AI 匯入、筆記轉活動與重新編號等其他寫入入口；本段沒有統一所有 writer
  的 revision 機制，不能把毫秒級 `updatedAt` 當成全系統唯一 revision。
- 行程日刪除、地點更新後的相片同步及成功寫入後的 R2 清理，仍有跨資源競爭／部分失敗風險，
  不宣稱 R 已結案。R2／R3 要一起檢查附件共用與重新引用，不只改 `$push`／`$pull`。
- 本段未操作正式 DB、真實通知、AI provider、push 或部署。
