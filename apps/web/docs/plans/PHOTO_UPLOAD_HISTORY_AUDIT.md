# 階段 D：歷史相簿盤點與儲存檔 hash 回填

日期：2026-10-01。對應 [研究文件](PHOTO_UPLOAD_RESEARCH.md) 階段 D。

已提供 CLI、只讀報告、可重跑的 hash 回填與測試。後續已完成正式 MongoDB／R2 的只讀盤點與部分歷史查重，並依指示透過既有退役流程刪除 8 個孤兒物件，詳見 [正式測試與清理紀錄](PHOTO_UPLOAD_HISTORY_PRODUCTION_TEST.md)。本次範圍已結案；正式 hash 回填未執行，感知相似比對及歷史重複合併留待另案。

## 交付與邊界

入口：`pnpm photos:audit`，實作為 [photo-audit.mjs](../../scripts/photo-audit.mjs) 與 [核心模組](../../scripts/lib/photo-audit.mjs)。

- 預設只讀：分頁列舉私有 bucket 的 `photos/`，保存 key、大小、修改時間與分類依據；比對照片、上傳工作、物件清理工作與旅程清理工作。
- 依既有照片的顯示檔推導 `_p.jpg` 公開副本，避免誤判為孤兒。只有存在的公開副本需要保護，沒有分享的照片不要求具備此副本。
- 另外逐張 HEAD 顯示檔與縮圖，報告缺少的配對。403／503 等失敗記為錯誤，不當成 404；不能用先前 R2 列表沒看到，就宣稱照片缺檔。
- 串流讀取儲存的顯示 JPEG，計算 SHA-256；同旅程相同 bytes 分組，產生含照片 ID、key、大小的重複報告。不同旅程不合併。
- `--apply` 才把 `storedHash` 與物件驗證資訊回填到照片；不新增照片、不更改說明／上傳者／`updatedAt`／`sourceHash`，也不建立任何 R2 刪除或清理工作。
- R2 client 僅使用 LIST、HEAD、GET。工具沒有刪除選項，報告也不是可直接交給刪除工具的清單。
- 沒有相簿內的歷史重複 UI；也沒有讓新上傳自動比對歷史 `storedHash`。現有上傳查重仍使用原始 File 的 `sourceHash`。

`storedHashVersion = sha256-stored-jpeg-v1` 表示已儲存 JPEG 的完整 bytes（包含 metadata）。它不能還原原始 File 的 hash；不同壓縮結果、EXIF 改動、裁切或重新匯出的同一畫面可能不在同一群組。相同縮圖或公開副本不作為歷史重複判斷依據。

## 使用方式

先查看不需要連線的說明：

```sh
pnpm photos:audit --help
```

工具讀取 `.env.local`、`.env` 與環境變數，但**只接受以下專用變數**，不會自動沿用 app 的 `MONGODB_URI` 或 `R2_*`。執行者需明確選擇同一環境的資料庫與照片 bucket：

```text
PHOTO_AUDIT_MONGODB_URI
PHOTO_AUDIT_MONGODB_DB             # 可選；覆寫 URI 中的 DB
PHOTO_AUDIT_R2_ACCOUNT_ID
PHOTO_AUDIT_R2_BUCKET              # 與該環境 R2_RECEIPTS_BUCKET 相同的私有 bucket
PHOTO_AUDIT_R2_ACCESS_KEY_ID
PHOTO_AUDIT_R2_SECRET_ACCESS_KEY
```

只讀盤點需要 MongoDB 讀取權限及 R2 LIST／HEAD／GET；回填另需 `photos` 更新權限。可用只讀憑證完成預設模式。憑證不放進命令列參數或提交到 Git。

先指定一個旅程，建立新的輸出目錄；之後需要全庫盤點時改用 `--all`：

```sh
mkdir -p photo-audit-reports
pnpm photos:audit --trip <旅程ObjectId> --out photo-audit-reports/trip-review
pnpm photos:audit --all --out photo-audit-reports/all-review
```

輸出目錄必須尚不存在；父目錄必須先存在。每次執行使用新目錄，避免混用舊報告。`photo-audit-reports/` 已加入 `.gitignore`；報告目錄權限為 `0700`、檔案 `0600`，內容有私有 key／照片 ID，沒有下載 URL、照片 bytes、姓名、caption 或 GPS。

只想查物件參照與缺檔，不想下載 JPEG 計算 hash：

```sh
pnpm photos:audit --all --inventory-only --out photo-audit-reports/inventory
```

確認選對環境與範圍後，執行相同掃描並回填 hash：

```sh
pnpm photos:audit --all --apply --out photo-audit-reports/backfill
```

`--apply` 即明確要求寫入 hash metadata，不會另外停下來互動詢問。這是可重跑的資料工作，**不需要新的 schema/index migration**。MongoDB 原生更新僅新增 optional 欄位，沒有對歷史 hash 加唯一約束；歷史重複必須可以被報告保留下來。

## 報告與分類

| 檔案 | 內容 |
| --- | --- |
| `summary.json` | 掃描範圍、完整性、物件與 bytes 統計、hash／回填數、錯誤／略過數與群組數 |
| `report.md` | 同一份統計的人類可讀摘要 |
| `objects.jsonl` | 每個 R2 物件及分類、照片／上傳工作 ID、既有清理嘗試次數 |
| `photos.jsonl` | 每張照片的缺檔結果、hash、R2 物件識別資訊或安全的錯誤代碼 |
| `duplicates.jsonl` | 同旅程、相同儲存 JPEG hash 的群組；列出全部照片 ID 與 key |

| `objects.jsonl` 分類 | 意義 |
| --- | --- |
| `referenced` | 有照片參照，含縮圖與推導的公開副本 |
| `referenced_cleanup_conflict` | 同時有照片參照及清理工作，需檢查衝突 |
| `active_upload` | 有仍在期限內的 pending 上傳工作 |
| `tracked_upload` | 有其他／過期上傳工作；交由既有工作機制判斷 |
| `pending_blob_cleanup`／`pending_trip_cleanup` | 已經在物件／旅程清理流程 |
| `retired_object_present`／`deleted_trip_object_present` | 清理標示完成，但列舉仍觀察到物件，需調查 |
| `trip_cleanup_conflict` | 清理工作與仍存在的旅程互相衝突 |
| `recent_unreferenced` | 未找到參照，但仍在近期上傳緩衝內 |
| `unknown_key`／`unknown_age` | key 格式或修改時間不明，不當成可刪除候選 |
| `suspected_orphan` | 現存旅程、舊物件、未找到照片或工作參照；只是疑似孤兒 |
| `missing_trip_candidate` | 旅程不存在、沒有已知參照／工作且超過緩衝；不能直接斷言刪除原因 |

`photos.jsonl` 另列 `missing_display`／`missing_thumbnail`。缺少顯示檔的照片無法計算 hash；缺少縮圖但顯示檔存在者仍可納入 JPEG 比對。

`complete: true` 只表示兩段掃描走完；`hashCoverageComplete: true` 才表示所遍歷的照片沒有 hash 失敗／略過。兩者都不是 DB／R2 原子快照。群組數只計入至少兩張的群組；`duplicatePhotos` 是群組內全部照片張數，不是建議刪除張數。

結束碼：`0` 掃描完成且沒有逐張錯誤（仍可能有缺檔、近期略過或疑似孤兒），`1` 啟動／全域錯誤或中斷，`2` 掃描走完但有逐張讀取／驗證錯誤。必須同時看摘要的涵蓋範圍，不能只看結束碼。

## 成本、重跑與並行保護

- 預設 R2 每頁 200 筆，`--page-size` 可設 1–1000；MongoDB 使用 cursor 分批讀取，重複群組最多保留一個旅程的資料。輸出逐列寫入，整個 bucket 不載入記憶體。
- R2 請求依序執行，預設起始間隔至少 100ms，`--delay-ms` 可設 0–60000。請求有 30 秒 timeout，SDK 最多嘗試 3 次；MongoDB 查詢有 10 秒執行上限。
- 預設 `--grace-hours 48`（最低 24 小時），以掃描開始時間固定 cutoff；近期無參照物件不列為孤兒，近期顯示檔略過 hash，待後續重跑。仍有效的上傳工作優先於物件年齡。
- 非快取 hash 通常每張需要顯示／縮圖 HEAD、一次 GET、一次完成後 HEAD。JPEG 以串流 hash，最多接受既有上傳上限的 6 MiB；超過上限或內容長度不符報錯，不把整張圖片存到報告或磁碟。
- 預設只讀模式沒有持久快取；若中斷，重新執行會重新計算尚無有效回填 hash 的物件。`--apply` 每張立即回填，已完成的部分可在下一次重跑時重用。
- 快取重用仍須 HEAD 驗證 ETag、大小與 LastModified 相同，且 hash 語意版本正確。ETag 只作物件識別資訊，不拿來當 SHA-256。
- GET 使用 If-Match，並核對 GET 回應與下載前／後 HEAD 的識別資訊。回填時以照片 `_id`、`trip`、`key`、原 `updatedAt` 與原 `storedHashVerifiedAt` 做條件更新，不 upsert；刪除、編輯或另一個回填程序先完成時會報告衝突，重跑即可。
- 不把長時間 R2 下載放進 DB transaction；DB 與 R2 仍無法保證同一瞬間快照。執行期間新增／刪除／覆寫都可能影響報告，hash 是觀察時點的結果。
- 全庫物件參照查詢包含 `thumbKey`，既有 schema 沒有它的獨立索引；大量資料時可能掃描 photos。工具不自行建立索引，超時應先評估查詢計畫／離峰執行，不能把超時當成無參照。
- SIGINT／SIGTERM 會中止後續工作；可寫入時保留 `complete: false`。強制終止時以最近一次 checkpoint 為準，JSONL 最後一行可能不完整。新一輪重掃 inventory，hash 依已成功回填的 metadata 恢復；不重用舊 R2 continuation token。

即使報告列出疑似孤兒，也必須在將來真正清理時重新檢查參照與上傳工作，參與既有旅程 transaction 保護、登記退役後再刪物件。此工具不繞過該流程，也不自動合併歷史重複照片。

## 測試

[photoAudit.test.mjs](../../src/__tests__/photoAudit.test.mjs) 涵蓋公開副本保護、各種清理／上傳狀態、近期緩衝、R2 分頁、缺檔與 503 分流、串流 hash、同旅程分組、只讀模式、回填重跑、物件變更、照片刪除／編輯衝突、中斷與錯誤資訊遮蔽。

```sh
pnpm exec vitest run src/__tests__/photoAudit.test.mjs
```

另有兩個真實 MongoDB 測試，只接受 `PHOTO_UPLOAD_TEST_MONGODB_URI` 指向 loopback 專用測試服務，建立隨機新資料庫，結束只刪除該測試資料庫；不使用 app URI。CI 已加入既有相簿 replica set 工作。

```sh
PHOTO_UPLOAD_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=rs0' \
  pnpm exec vitest run src/__tests__/photoAudit.test.mjs
```

本機相關測試 88 項通過（包含此工具兩個真實 MongoDB 測試及既有上傳交易測試）；Lint 與 TypeScript 檢查通過。

R2 adapter 有 SDK mock 測試，另已對正式 bucket 完成 LIST／HEAD／GET 只讀驗證，結果與近期照片的涵蓋限制見 [正式資料測試紀錄](PHOTO_UPLOAD_HISTORY_PRODUCTION_TEST.md)。正式 hash 回填尚未執行；後續經使用者指示完成 8 個孤兒物件的退役／刪除，紀錄亦見上述文件。讀取流量不等同帳單費用。
