# 改善建議（Improvements）

> 更新日期：2026-07-02
> 本文件只列**尚未處理**的程式碼 / 基礎設施層級改善。已完成的項目（CI、Public API 錯誤碼 / 樣板收斂、結構化 logger、安全標頭、路由保護單一來源化，及更早的 P0–P3）紀錄見 [CHANGELOG.md](./CHANGELOG.md)。架構說明見 [ARCHITECTURE.md](./ARCHITECTURE.md)。
> 慣例：處理完一項 → 移到 [CHANGELOG.md](./CHANGELOG.md)、從本檔刪除。

狀態圖例：⚠️ 待處理　🟡 部分完成 / 待外部條件

---

### A. 🟡 Public API 限流（Rate limiting）
**問題**：`/api/public/*` 是「知道 `hash_code` 即可檢視」的未登入端點，目前無任何速率限制，易被枚舉 / 爬取。
**現況**：刻意未做——Serverless（Vercel）下記憶體式限流形同虛設（各 instance 各自計數），須外部儲存。
**建議**：導入 Upstash Redis（`@upstash/ratelimit` + `@upstash/redis`）以 IP（或 `hash_code`）為 key 做滑動視窗限流，套在 8 條公開路由與 `/api/exchange-rates`。屬基礎設施決策，待確認方案後再做。

### B. ⚠️ 補強 `actions/*` 測試覆蓋
**現況**：`lib/`（settlement / validation / hashcode / permissions / histogram…）已覆蓋；`actions/*`（核心業務）尚未測。
**建議**：對 `expense / member / settlement / trip` actions 加測試。因 DB 依賴重，兩條路可選：(1) mock `@/models` 與 `dbConnect`（如 permissions.test.ts 的作法）；(2) 用 `mongodb-memory-server` 做整合測試，能順帶驗證 Mongoose schema / index 行為。建議優先涵蓋授權分支（非成員 / 非 admin 被拒）與分帳金額計算。

### G. 🟡 支出列表無上限（潛在效能）
**問題**：`getExpenses`（[expense.actions.ts](../src/actions/expense.actions.ts)）與公開 expenses 路由皆 `Expense.find({ trip })` 全量載入 + 雙 `populate`。一般旅行筆數有限尚可，但長期 / 大型旅行無分頁保護。
**建議**：先觀察實際資料量再決定。若需要，加上 `limit` + 游標分頁（以 `date`/`_id`），前端配合無限捲動；屬「為未來鋪路」，非當前痛點。

### H. 🟡 SW `r2-images` 快取上限對相簿偏低
**問題**：[sw.ts](../src/sw.ts) 的 `r2-images`（CacheFirst）`maxEntries: 128`，是為「一次看一兩張收據」設計的。
旅程相簿（ROADMAP #21 Phase 1）一頁就有數十張縮圖、軟上限 300 張／旅程，會把收據與頭像一起擠出快取（LRU）。
另外 `presignGetStable` 的簽名每個窗口（1 小時）輪替一次，同一張相片跨窗口就是新的快取 key，會加速這個消耗。
**建議**：把 `maxEntries` 提到 ~512，或把相簿縮圖切成獨立的 cacheName（與收據分開計數，較乾淨）。
兩者都要以 `pnpm build && pnpm start` 實測（dev 模式 SW 停用）。**先觀察實際用量再決定**——
相片是 CacheFirst，把上限開太大等於長期佔用使用者的儲存配額。

### I. 🟡 相簿上傳失敗會在 R2 留下孤兒物件
**問題**：相片是「先直傳 R2、再 `addTripPhotos` 入庫」兩段式（[photoUpload.ts](../src/lib/photoUpload.ts)）。
物件傳完但入庫失敗時（達 300 張軟上限、離線、DB 錯誤、使用者中途關頁），那些 blob 就沒有任何 doc 指向它，
只有「刪整個旅程」的 prefix 掃描會收掉。**已緩解**最常見的一種：一次選 >20 張不再整批被 Zod 打回
（`uploadPhotoFilesInBatches` 自動分批，且超量的檔案連壓縮都不做）。
**建議**：Phase 2 加一支定期任務（比照既有 Vercel Cron），列 `photos/<tripId>/` 前綴、
比對 `Photo` collection 的 key，刪掉超過 N 小時仍無人指向的物件。**不要在上傳失敗當下同步清**——
那條路徑本身就已經在出錯了，再加一個會失敗的網路呼叫只會更糟。

> **備註（安全標頭延伸）**：目前 CSP 僅含 `frame-ancestors 'none'`。完整 CSP（`default-src`/`script-src`…）刻意未上——需配合 Leaflet 圖磚、R2 圖片/PDF、next-themes 內嵌腳本與 Radix 內嵌樣式實測，列為後續。

---

## 值得保留延續的好設計
- `ActionResult<T>` 統一回傳格式
- Zod 集中驗證所有輸入
- `getTripMembership` 一次 `Trip.findOne` 收斂權限檢查（members 內嵌）
- splits/members 內嵌，載入支出不再 N+1
- 虛擬成員（`isVirtual`）支援未註冊者參與分帳
- 四語系 i18n 架構完善
- 簡潔的 admin/member 兩級權限
- React Query 查詢/失效層集中於 [src/hooks/queries/](../src/hooks/queries/)
