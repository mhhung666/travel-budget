# R：行程與跨 collection 一致性

更新日期：2026-09-09

## 階段

| 階段 | 範圍 | 狀態 |
| --- | --- | --- |
| R1 | 舊草稿覆蓋保護與衝突提示 | 已完成工程驗證 |
| R2 | 穩定活動 ID、單筆新增／編輯／刪除原子更新，批次上限與衝突策略 | 待處理 |
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

## 驗證

新增 10 項測試：缺漏／無效 token、授權、消失的行程日、舊草稿、讀寫間競爭、
同毫秒兩請求只有一個成功、成功後票券清理，以及活動／整天表單的草稿保留與原 token 重試。
競爭測試使用受控 model mock，UI 使用真實 QueryClient 與 dialog；不是實際 MongoDB 併發驗收。

完整測試 1,385 項通過、37 項 opt-in 跳過；lint、Prettier、TypeScript、production build 與
diff whitespace 檢查通過。Build 覆寫 dummy MongoDB URI 與 JWT secret，未連共用 DB；
未執行實際 MongoDB 整合測試或正式瀏覽器驗收。

## 後續界線

- 活動陣列仍整批寫回並重建 ID；不同活動的並行編輯也會要求重開，不自動合併。
- R2 必須同步盤點 AI 匯入、筆記轉活動與重新編號等其他寫入入口；本段沒有統一所有 writer
  的 revision 機制，不能把毫秒級 `updatedAt` 當成全系統唯一 revision。
- 行程日刪除、地點更新後的相片同步及成功寫入後的 R2 清理，仍有跨資源競爭／部分失敗風險，
  不宣稱 R 已結案。R2／R3 要一起檢查附件共用與重新引用，不只改 `$push`／`$pull`。
- 本段未操作正式 DB、真實通知、AI provider、push 或部署。
