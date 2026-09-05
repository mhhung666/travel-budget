# 資料庫遷移（migrate-mongo）

> 為「可重現的 schema / index 變更與資料 backfill」而引入。當前資料模型見 [ARCHITECTURE.md](./ARCHITECTURE.md) §5。

## 為什麼需要

平時索引由 Mongoose 的 `autoIndex` 在連線時自動建立（見 [src/lib/mongodb.ts](../src/lib/mongodb.ts) 與各 [model](../src/models/)），對開發很方便，但：

- **不可重現**：索引隨模型程式碼隱性變動，沒有時間點紀錄。
- **不適合正式環境**：正式環境通常會關閉 `autoIndex`（避免冷啟動時的建索引開銷），此時需要明確、可審計的方式套用結構變更。
- **無法做資料 backfill**：欄位改名、回填預設值等需要一次性腳本。

`migrate-mongo` 補上這層：每個變更是一支帶時間戳、版本控管的腳本，套用紀錄存在 `changelog` 集合。

> 注意：目前 `autoIndex` 仍開著，baseline 遷移與它並存（索引名稱對齊、`createIndex` 冪等）。本次只是「加上能力」，沒有改動既有行為。

## 設定

- 設定檔：[migrate-mongo-config.js](../migrate-mongo-config.js)（ESM）。連線字串取自環境變數 `MONGODB_URI`，與 app 共用；不硬編碼憑證。資料庫名稱取自連線字串（或以 `MONGODB_DB` 覆寫）。
- 遷移目錄：[migrations/](../migrations/)。
- 紀錄集合：`changelog`；鎖集合：`changelog_lock`。

## 指令

```bash
pnpm migrate:status              # 列出已套用 / 待套用的遷移
pnpm migrate:up                  # 套用所有待套用遷移
pnpm migrate:down                # 回退最近一支遷移
pnpm migrate:create <name>       # 產生新的遷移腳本（時間戳 + 名稱）
```

執行前需在環境（或 `.env`）設好 `MONGODB_URI`。

## 撰寫遷移

腳本為 ESM，匯出 `up` / `down`（皆收 `db`, `client`）：

```js
/** @param {import('mongodb').Db} db */
export const up = async (db) => {
  await db.collection('expenses').updateMany({ currency: { $exists: false } }, { $set: { currency: 'TWD' } });
};

/** @param {import('mongodb').Db} db */
export const down = async (db) => {
  // 盡量提供可逆操作
};
```

原則：

- **冪等**：腳本可能被重跑，`createIndex` / 條件式 `updateMany` 等本身冪等的操作優先。
- **集合名稱用 Mongoose 的複數小寫**：`User → users`、`Trip → trips`、`Expense → expenses`、`ItineraryDay → itinerarydays`。
- **索引名稱對齊 Mongoose 預設**（如 `members.user_1`），避免與 `autoIndex` 重複建立。
- 盡量寫出可逆的 `down`。

## 現有遷移

O 已完成小型測試庫 before／after 並加入 additive migration；正式套用門檻見
[MONGODB_INDEX_RESULTS.md](./MONGODB_INDEX_RESULTS.md)。先遷移再部署 schema，不依賴 autoIndex；
新 migration 使用 `index_migration_ownership` 保護既有索引，down 不移除非 owned 索引。

| 檔案 | 內容 |
| --- | --- |
| `20260905093000-core-query-indexes.js` | 新增支出／付款／清單／相片完整排序、digest 時間篩選及帳號 CI unique 索引；先掃描帳號重複，ownership ledger 防止回滾誤刪既有索引。 |
| `20260616075344-baseline-indexes.js` | 明文建立目前所有模型的索引（users / trips / expenses / itinerarydays），作為基準點。冪等，可安全套用於已運行的環境。 |
| `20260618032844-move-location-to-destination.js` | 將既有旅程地點資料搬到目前欄位形狀。 |
| `20260618122537-add-user-map-share-code.js` | 建立使用者地圖分享碼與索引。 |
| `20260629163036-expense-itinerary-days-array.js` | 將支出與行程日關聯轉為陣列形狀。 |
| `20260701050933-expense-tags-array.js` | 建立支出 tags 陣列欄位。 |
| `20260703133143-checklist-kind-and-per-member-done.js` | 更新清單種類與 per-member 完成狀態。 |
| `20260728143000-photo-local-date-and-itinerary-source.js` | 保護既有相片的手動行程日關聯，供新相片依當地拍攝日期自動分類。 |
| `20260730090000-add-personal-stats-expense-index.js` | 建立個人統計日期明細游標分頁使用的 `splits.user + date + _id` 複合索引。 |
| `20260730180000-move-trip-budget-to-legacy.js` | 將舊版 `Trip.budget` 改名為 `legacyBudget` 保存參考；新版個人預算由成員自行寫入 `members[].budget`。 |
