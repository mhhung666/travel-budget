# 相簿上傳與歷史清理交付摘要

2026-10-01 依約定範圍結案；原研究、實作過程與正式操作明細查 Git。現行 CLI／部署操作見 [相簿維運](../../PHOTO_AUDIT.md)，剩餘驗收見 [文件入口](../../README.md#待驗與未排程事項)。

## 已交付

- A–C：每張進度、最多三張並行、逐張入庫與快取更新、同旅程原檔查重、停止及只重試失敗。持久 uploadId／key 先登記再簽 URL，重試先查結果、只補缺檔；finalize 與清理共用旅行交易，HEAD 暫時失敗不當不存在。
- D：只讀盤點、歷史 JPEG hash 報告及條件式回填 CLI。原檔 `sourceHash` 與儲存 JPEG `storedHash` 不可互換，不做感知相似比對、歷史合併或把 storedHash 接入新上傳。
- 既有公開副本／私人 EXIF 邊界保留；未完成工作不設 TTL，清理沿持久退役／二次掃除，不能因 PUT 失敗直接刪檔。

## 當時驗證

A–C 一般測試 1,766 項、隔離上傳交易 12 項與工程檢查通過；241 項略過。D 相關 88 項含兩個真 MongoDB 案例及 lint／型別通過；R2 adapter 除 mock 另有下列正式只讀證據。以上不代表真 PUT、CORS、手機或 cron 端到端通過。

2026-10-01 01:39–01:42（Asia/Taipei）正式只讀盤點：389 物件、140 張照片，配對缺檔 0；122 張成功計算 JPEG hash、同旅程重複群組 0，18 張因 48 小時緩衝略過。`complete: true`／`hashCoverageComplete: false`，不能宣稱全部照片無重複。讀取 236,081,958 bytes；Hash 回填 0，照片 sourceHash／storedHash 數量不變。正式 migration／照片 hash 索引確認存在，該次沒有執行 migration。

同日 01:48 經使用者指示，只針對已核對的 8 個孤兒 key 重新 HEAD、在 snapshot／majority transaction 取得旅行 fence 並檢查全部引用／工作，才經 `retireUnreferencedBlobs`／`runBlobCleanup` 退役刪除。8 個皆 HEAD 不存在，物件 389→381，釋出 3,548,532 bytes；140 張照片的 ID／旅行／顯示圖／縮圖參照完全未變。沒有前綴刪除、hash 回填或部署。

保留 8 筆 tombstone／二次清掃工作，不早於 2026-10-02 01:48 執行；當時未驗正式 cron 或第二次掃除，不記完成。CLI 不提供通用刪除選項。

私有證據：`apps/web/photo-audit-reports/production-readonly-2026-09-30T17-39-03-531Z/` 的標準報告、`candidate-recheck.json`、`verification.json`、`cleanup-approved.mjs`、`cleanup-result.json`；內容含物件識別資訊，已忽略、不提交。
