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
