# 資料庫遷移（migrate-mongo）

> 對應 [IMPROVEMENTS.md](./IMPROVEMENTS.md) P1 #3。為「可重現的 schema / index 變更與資料 backfill」而引入。

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

| 檔案 | 內容 |
| --- | --- |
| `20260616075344-baseline-indexes.js` | 明文建立目前所有模型的索引（users / trips / expenses / itinerarydays），作為基準點。冪等，可安全套用於已運行的環境。 |
