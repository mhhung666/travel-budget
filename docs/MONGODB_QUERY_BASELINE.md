# MongoDB 查詢基線與索引驗證

## 狀態（2026-09-05）

已建立唯讀 explain 基線、帳號 collation 重複掃描及 duplicate-key 競態處理。
已經使用者核准，以現有 app 連線執行測試庫唯讀基線：3 組旅程各 5 輪，共 135 次 explain。
後續經核准新增 7 個索引，完成同樣本 135 次 after explain，確認掃描量下降及 SORT 消除。
結果與 migration／rollback 見 [MONGODB_INDEX_RESULTS.md](./MONGODB_INDEX_RESULTS.md)。
未修改業務資料；O 仍待 production-like／寫入成本與真實 rollback 驗證，AI 驗收繼續暫緩。

## 查詢盤點

| 查詢／來源 | 現況與候選 | 驗證重點 |
| --- | --- | --- |
| expense.actions 支出清單 | trip 單欄；候選 `{ trip: 1, date: -1, createdAt: -1 }` | 消除完整排序的 blocking sort |
| expense-digest 每日摘要 | 候選 `{ createdAt: 1 }` | 固定 since 的掃描量，不額外加 trip 條件 |
| settlementRead 支出 | 現有 trip 索引 | 全旅程讀取為現有需求，不宣稱索引能省略所需文件 |
| settlementRead 付款 | 候選 `{ trip: 1, createdAt: -1 }` | filter＋sort |
| checklistRead 清單 | 候選 `{ trip: 1, createdAt: 1 }` | filter＋sort |
| photo.actions 相簿 | 現有 trip/takenAt；候選 `{ trip: 1, takenAt: -1, createdAt: -1 }` | 拍攝時間相同／缺值時的第二排序鍵 |
| itineraryRead 行程 | 現有 `{ trip: 1, dayNumber: 1 }` unique | 保留為對照，不新增 |
| auth.actions 帳號／信箱 | 現有 binary unique；候選各自加 en/strength:2 unique | 先掃描 collation 重複及非字串資料 |

實際索引以報告 `indexes` 為準，schema 不等於資料庫狀態。量測候選定義集中在
[mongo-explain.mjs](../scripts/lib/mongo-explain.mjs)；驗證後已另行同步 schema 與固定版本 migration。

## 執行與比較

使用已核准的 staging snapshot 與唯讀帳號，設定 `MONGODB_BASELINE_URI`（URI 需指定 database）。
工具不會退回使用 app 的 `MONGODB_URI`，亦不使用 `MONGODB_DB` override。
需要帳號查詢時另設 `MONGODB_BASELINE_USERNAME`／`MONGODB_BASELINE_EMAIL`，不要將憑證提交或貼入報告。

```bash
pnpm mongodb:explain --help
pnpm --silent mongodb:explain --trip <ObjectId> --since 2026-09-04T00:00:00.000Z --dataset staging-snapshot-a --audit-accounts > /tmp/mongo-before.json
# 經審查後，由操作者只在 staging 建立待驗證索引；本工具不提供寫入開關。
pnpm --silent mongodb:explain --trip <ObjectId> --since 2026-09-04T00:00:00.000Z --dataset staging-snapshot-a --audit-accounts --before /tmp/mongo-before.json > /tmp/mongo-after.json
```

替換 `<ObjectId>`，小／中／大旅程各自保存報告。固定 snapshot 與時間窗，不使用每次都變動的「現在」。
`--before` 核對 snapshot 標籤及查詢 fingerprint，拒絕不同 trip／since／帳號樣本的比較。
操作者仍須確保真的是同一份 snapshot，不可只沿用標籤。delta 為 after 減 before。

報告 stdout；錯誤 stderr。每項操作預設最多 10 秒，`--max-time-ms` 可設 1–60000。
連線／量測失敗 exit 1；重複帳號或非字串欄位 exit 2；exit 0 **不代表索引驗收通過**。
全部成功才輸出完整報告，失敗後的空檔不可作為基線。explain 真正執行查詢，唯讀不代表零負載。
報告不含原始文件、帳號明文、URI 或完整命令；fingerprint 並非敏感資料匿名化保證，仍應內部保存。

## 判讀與限制

- 保存 `totalDocsExamined`、`totalKeysExamined`、`nReturned`、`executionTimeMillis`、索引、
  `collectionScan`、`blockingSort`；只解析 winning／executed plan，排除 rejected plan 和命令回顯。
- 保持 unhinted，確認 planner 真正使用索引。小集合可能合理選擇 COLLSCAN；空結果不能證明收益。
- 全量旅程清單不偷偷加 limit；相同 snapshot 的 nReturned 應一致。排序查詢期待 blocking sort 消失，
  digest 掃描量應接近匹配數；同時評估索引大小及寫入成本。
- 至少重複 5 輪保存原始報告。explain 不使用正常 plan cache，其時間不等於 API latency 或 TTI。
  [MongoDB explain 文件](https://www.mongodb.com/docs/manual/reference/explain-results/)
- 不包含 populate、HTTP payload、瀏覽器或 Shell 聚合的量測；Shell 另見
  [TRIP_SHELL_PERFORMANCE.md](./TRIP_SHELL_PERFORMANCE.md)。sharded aggregation 分 shard 報告，
  沒有全域統計時保留 null，不拿第一個 shard 冒充總計。
- 個人統計仍用 `pnpm stats:explain`，已共用修正後的解析器；但舊工具仍讀 `MONGODB_URI`，
  且會額外執行查詢量測 bytes，勿混淆兩支工具的連線及負載行為。

## 帳號唯一性與 migration 門檻

優先驗證 matching collation unique index，保留 username 顯示形式及既有登入語意，不新增 canonical
欄位。掃描直接用 MongoDB `{ locale: 'en', strength: 2 }` 分組（包含虛擬成員），不以 JavaScript
lowercase 代替 ICU collation；只輸出重複群組／文件及非字串數量。
查詢需相同 collation 才能使用該索引。
[MongoDB case-insensitive index 文件](https://www.mongodb.com/docs/v8.0/core/index-case-insensitive/)

重複／異常資料由擁有者決定更名或修復，不自動合併、刪除帳號。掃描乾淨後仍有併發寫入窗口，應安排
維護窗口或暫停相關寫入；建立 unique index 是最後防線。註冊及確認改信箱遇到帳號 E11000 已回傳
`CONFLICT`，其他 duplicate index／網路錯誤維持 INTERNAL_ERROR。這不代表 CI 唯一索引已生效。

取得實測收益後依 [MIGRATIONS.md](./MIGRATIONS.md) 建立正式 migration：

1. 核對現有索引的 key、名稱、unique、collation，避免衝突或重複。
2. additive up 只建立通過驗證的索引，同步 schema；不用 `syncIndexes()`，不取代原索引。
3. down 只移除該 migration 擁有的新增索引；IndexNotFound 可忽略，其他錯誤需拋出。
   事先存在的同名索引需明確處理 ownership，避免回滾誤刪。
4. 暫留原 binary unique、trip 單欄、舊 photo 索引，觀察使用率與寫入成本後另案清理。
5. 回退 CI unique 會失去大小寫唯一性保障，應先停相關寫入；app 的 autoIndex 仍開啟，
   必須同步回退 schema／部署，避免索引移除後又自動建立。
6. staging 驗證 up／重跑／down／重跑、大小寫重複及併發註冊／改信箱後，才核准正式操作。

已依測試庫結果新增 additive migration；正式套用前仍需按結果報告完成較大資料量及回滾審查。
