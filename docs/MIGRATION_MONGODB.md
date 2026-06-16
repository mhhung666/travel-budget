# Supabase → MongoDB 遷移規劃

> 建立日期：2026-06-16
> 決策：**ObjectId 主鍵** ＋ **Mongoose ODM** ＋ **撰寫 ETL 遷移腳本**
> 架構現況見 [ARCHITECTURE.md](./ARCHITECTURE.md)。

---

## 0. 目標與已定決策

| 決策點 | 選擇 | 影響 |
| --- | --- | --- |
| 主鍵策略 | 原生 `ObjectId` | `userId` 全面 `number → string`；`tripIdOrCode` 分流邏輯改寫 |
| 資料存取層 | Mongoose ODM | 以 Schema/Model + `populate()` 取代 PostgREST 巢狀 select |
| 既有資料 | 撰寫 ETL 腳本 | 從 Postgres 讀出、建 id 對應表、轉成內嵌文件寫入 |

**附帶好處**：MongoDB 連線字串放在 `MONGODB_URI`（**無** `NEXT_PUBLIC_` 前綴），等同順手解掉 [IMPROVEMENTS.md](./IMPROVEMENTS.md) P0 #1「anon key 暴露在前端」的安全問題。

---

## 1. 核心挑戰（為什麼這不只是換驅動）

1. **整數 ID 假設遍布全碼庫**：JWT 的 `userId: number`、所有外鍵為整數、`tripIdOrCode` 用 `/^\d+$/` 區分「數字 ID vs hash_code」。改 ObjectId 後這條分流必須改寫。
2. **關聯查詢 → 內嵌或 `populate`**：現有大量 PostgREST 巢狀 select（`users!inner`、`payer:users!..._fkey`、`expenses!inner(trip_id)`）需改為 Mongoose `populate` 或內嵌文件。
3. **唯一鍵與 CHECK 約束**：`username`/`email`/`hash_code` 唯一、`(trip_id,user_id)`、`(trip_id,day_number)` 唯一、`category` 列舉 → 改為 Mongoose index + Zod/schema enum。
4. **RPC `delete_and_renumber_itinerary_day`**：Postgres 函式 → 改用 app 端交易（transaction）+ `bulkWrite` 重新編號。
5. **Serverless 連線管理**：Vercel 每次冷啟動都會建連線，必須用「快取全域 client」避免連線爆量（Mongoose 的 `connection` 快取）。
6. **金額型別**：Postgres `DECIMAL(10,2)` → 本規劃沿用 JS `Number`（現有程式已四捨五入處理），長期可評估 `Decimal128`。

---

## 2. 目標資料模型（內嵌 vs 參照）

把現有 6 張表收斂為 **4 個 collection**，用內嵌消除大部分 join 與 N+1：

```
users          （獨立，被參照）
trips          （內嵌 members[]）
expenses       （內嵌 splits[]，payer 用 ref）
itinerary_days （獨立，content 可能很大）
```

| 原 PG 表 | 去向 | 理由 |
| --- | --- | --- |
| `users` | `users` collection | 多處參照，維持獨立 |
| `trips` | `trips` collection | — |
| `trip_members` | **內嵌**進 `trips.members[]` | 28 處存取多為權限檢查 → 一次取 doc 即可；`members.user` 建 multikey index 支援「我參與哪些旅程」 |
| `expenses` | `expenses` collection | — |
| `expense_splits` | **內嵌**進 `expenses.splits[]` | splits 永遠跟著 expense 一起讀 → 內嵌後 N+1 直接消失 |
| `itinerary_days` | `itinerary_days` collection | content（markdown）可能大，維持獨立 |

### Mongoose Schema 草案（`src/models/`）

```ts
// User
const UserSchema = new Schema({
  username:    { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  email:       { type: String, required: true, unique: true },
  password:    { type: String, required: true },
  isVirtual:   { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Trip（內嵌 members）
const TripMemberSchema = new Schema({
  user:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role:     { type: String, enum: ['admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const TripSchema = new Schema({
  name:        { type: String, required: true },
  description: String,
  startDate:   Date,
  endDate:     Date,
  location:    Schema.Types.Mixed,            // 原 JSONB
  hashCode:    { type: String, required: true, unique: true },
  members:     [TripMemberSchema],
}, { timestamps: { createdAt: true, updatedAt: false } });
TripSchema.index({ 'members.user': 1 });       // 「我參與哪些旅程」

// Expense（內嵌 splits）
const SplitSchema = new Schema({
  user:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  shareAmount: { type: Number, required: true },
}, { _id: false });

const ExpenseSchema = new Schema({
  trip:          { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  payer:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount:        { type: Number, required: true },
  originalAmount:{ type: Number, default: 0 },
  currency:      { type: String, default: 'TWD' },
  exchangeRate:  { type: Number, default: 1 },
  description:   { type: String, required: true },
  category:      { type: String, enum: ['accommodation','transportation','food','shopping','entertainment','tickets','other'], default: 'other' },
  date:          { type: Date, required: true },
  splits:        [SplitSchema],
}, { timestamps: { createdAt: true, updatedAt: false } });

// ItineraryDay
const ItineraryDaySchema = new Schema({
  trip:      { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
  dayNumber: { type: Number, required: true },
  title:     { type: String, required: true },
  content:   { type: String, default: '' },
}, { timestamps: true });
ItineraryDaySchema.index({ trip: 1, dayNumber: 1 }, { unique: true });
```

> 命名同時從 `snake_case` 收斂為 Mongoose 慣用的 `camelCase`。對外回傳的 DTO 仍可維持原欄位名以降低前端改動（在 repository/action 層做映射）。

---

## 3. 連線管理（Serverless 必做）

新增 [src/lib/mongodb.ts](../src/lib/mongodb.ts)，取代 `src/lib/supabase.ts`，用全域快取避免熱重載/冷啟動重複連線：

```ts
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');

let cached = (global as any)._mongoose ?? { conn: null, promise: null };
(global as any)._mongoose = cached;

export async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
```

每個 Server Action / API route 進入點先 `await dbConnect()`（可包進 `withAuth` 與一個 `withDb` HOC 一起處理）。

---

## 4. ID 策略改動細節

1. **JWT**：[src/lib/auth.ts](../src/lib/auth.ts) 的 `SessionPayload.userId: number → string`；`createSession(userId: string, ...)`。約 30 處 `session.userId` 使用點型別自動跟著變。
2. **`tripIdOrCode` 分流改寫**（[src/lib/permissions.ts](../src/lib/permissions.ts)、[trip.actions.ts](../src/actions/trip.actions.ts)）：
   ```ts
   import { isValidObjectId } from 'mongoose';
   // 舊：/^\d+$/.test(x)  →  新：
   const byId = isValidObjectId(tripIdOrCode);   // 24-hex 視為 _id，否則視為 hashCode
   ```
   *安全性*：hashCode 為 `[a-z0-9]{6,8}`（最長 8 字），不可能等於 24 字元的 ObjectId，分流無歧義。
3. **型別**：[src/types/models/](../src/types/models/) 中所有 `id: number` / `*_id: number` → `string`（或 `Types.ObjectId`，對外 DTO 用 `string`）。

---

## 5. 逐層改動清單

| 範圍 | 檔案 | 動作 |
| --- | --- | --- |
| 連線 | `src/lib/supabase.ts` | **刪除**，改為 `src/lib/mongodb.ts`（`dbConnect`） |
| Model | `src/models/*.ts`（新增） | 定義上述 4 個 Mongoose model |
| 權限 | [src/lib/permissions.ts](../src/lib/permissions.ts) | `getTripMembership` 改用 `Trip.findOne({ 'members.user': userId, ... })`；分流改 `isValidObjectId` |
| Actions（7 檔） | [src/actions/](../src/actions/) `auth/trip/expense/member/settlement/stats/itinerary` | 所有 `.from().select(巢狀)` → Mongoose 查詢/`populate`；`.insert/update/delete` → `create/updateOne/deleteOne`；splits/members 改操作內嵌陣列 |
| RPC | [itinerary.actions.ts](../src/actions/itinerary.actions.ts) | `rpc('delete_and_renumber_itinerary_day')` → 交易 + `bulkWrite`（見 §6） |
| Public API（9 檔） | [src/app/api/public/](../src/app/api/public/) | 同步改寫；順手修掉 expenses/settlement route 的 N+1（內嵌後自然消失） |
| 型別 | [src/types/database.types.ts](../src/types/database.types.ts) | **刪除**（Supabase 產生物）；model 型別由 Mongoose `InferSchemaType` 或手寫介面提供 |
| 型別 | [src/types/models/](../src/types/models/) | `number` ID → `string` |
| 驗證 | [src/lib/validation.ts](../src/lib/validation.ts) | Zod schema 的 id 欄位改 `string`（可加 `.refine(isValidObjectId)`） |
| 設定 | `.env.example` / `vercel.json` | 移除 `NEXT_PUBLIC_SUPABASE_*`，新增 `MONGODB_URI` |
| 套件 | `package.json` | 移除 `@supabase/supabase-js`；新增 `mongoose` |
| Schema 檔 | `supabase/` 目錄、`INIT_SQL` | **刪除**；改由 Mongoose index 自動建立 |

---

## 6. RPC 重寫：行程日刪除與重新編號

原 Postgres 函式用「負數中繼值」避開 unique 約束。MongoDB 改為一次交易完成：

```ts
const session = await mongoose.startSession();   // 需 replica set / Atlas
await session.withTransaction(async () => {
  await ItineraryDay.deleteOne({ _id: dayId, trip: tripId }, { session });
  const days = await ItineraryDay.find({ trip: tripId }).sort({ dayNumber: 1 }).session(session);
  const ops = days.map((d, i) => ({
    updateOne: { filter: { _id: d._id }, update: { $set: { dayNumber: i + 1 } } },
  }));
  if (ops.length) await ItineraryDay.bulkWrite(ops, { session });
});
```

> 交易需要 replica set（MongoDB Atlas 預設即是）。若部署在單節點，改為「先全部設成負數中繼值再重編」沿用原技巧。

---

## 7. 索引與約束對照

| Postgres | MongoDB |
| --- | --- |
| `users.username UNIQUE` / `email UNIQUE` | `unique: true` index |
| `trips.hash_code UNIQUE` | `unique: true` index |
| `trip_members (trip_id,user_id) UNIQUE` | 內嵌陣列，app 層用 `$addToSet` 風格保證單一；查詢用 `members.user` multikey index |
| `expenses (trip_id)` index | `trip` index |
| `itinerary_days (trip_id,day_number) UNIQUE` | compound unique index |
| `category` CHECK | schema `enum`（+ Zod） |
| `... ON DELETE CASCADE` | **無自動串接**：刪 trip 時須在 app 端一併刪 `expenses`、`itinerary_days`（建議包成一個 `deleteTrip` 交易） |

> ⚠️ MongoDB 沒有外鍵 cascade，原本仰賴 `ON DELETE CASCADE` 的清理要改成程式碼明確刪除。

---

## 8. 資料遷移（ETL 腳本）

一次性腳本 `scripts/migrate-pg-to-mongo.ts`：

1. 連 Postgres（既有 Supabase）讀出 `users / trips / trip_members / expenses / expense_splits / itinerary_days`。
2. 依序寫入並建立 **整數 ID → ObjectId 對應表**（`Map<number, ObjectId>`）：
   - 先寫 `users`，記錄 `userIdMap`。
   - 寫 `trips`，把該 trip 的 `trip_members` 組成 `members[]`（`user` 用 `userIdMap`）。
   - 寫 `expenses`，把對應 `expense_splits` 組成 `splits[]`；`payer`/`trip` 用對應表。
   - 寫 `itinerary_days`。
3. 驗證：比對各 collection 筆數與抽樣金額總和與來源一致。
4. 冪等性：腳本可重跑（先 `deleteMany` 或用 upsert key），避免重複。

---

## 9. 套件與環境變數

```diff
# package.json
- "@supabase/supabase-js": "^2.90.1",
+ "mongoose": "^8.x",

# .env（移除 → 新增）
- NEXT_PUBLIC_SUPABASE_URL=...
- NEXT_PUBLIC_SUPABASE_ANON_KEY=...
+ MONGODB_URI=mongodb+srv://...
  JWT_SECRET=...   # 維持
```

同步更新 [CLAUDE.md](../CLAUDE.md) 與 [ARCHITECTURE.md](./ARCHITECTURE.md) 中「Supabase / anon key / RLS / INIT_SQL」相關段落。

---

## 10. 執行路線圖（建議分階段、可逐步驗證）

```
階段 0：地基
  ├── 加 mongoose 依賴、建 src/lib/mongodb.ts（dbConnect）
  ├── 建 src/models/*（4 個 model + index）
  └── 改 .env.example / 移除 supabase client

階段 1：核心讀寫層
  ├── 改寫 permissions.ts（getTripMembership + isValidObjectId 分流）
  ├── 改 auth.ts：userId number → string
  └── 改 auth.actions / trip.actions（建立、查詢、加入旅程）

階段 2：其餘 actions
  ├── expense.actions（內嵌 splits）
  ├── member.actions（操作 trips.members[]）
  ├── settlement.actions / stats.actions（aggregation）
  └── itinerary.actions（RPC → 交易重編號）

階段 3：Public API（9 路由）＋ 型別清理
  └── 順手修掉 public N+1、刪 database.types.ts

階段 4：資料遷移
  ├── 寫 scripts/migrate-pg-to-mongo.ts
  └── 跑遷移 + 筆數/金額驗證

階段 5：收尾
  ├── 移除 @supabase/supabase-js、supabase/ 目錄、INIT_SQL
  ├── 補/改測試（permissions、actions）
  └── 更新 CLAUDE.md / ARCHITECTURE.md
```

每個階段建議獨立 commit（依慣例 `refactor:` / `feat:`，英文訊息）。

---

## 11. 風險與注意事項

- **無交易的多文件一致性**：刪 trip 需 app 端串接刪 expenses/itinerary（建議交易）；新增 expense + 更新 splits 已內嵌於單文件（單文件操作天然原子，反而更安全）。
- **`isValidObjectId` 邊界**：Mongoose 的 `isValidObjectId` 對某些 12 字元字串也回 true，但本專案 hashCode ≤ 8 字元、登入後才用 ID，無實際歧義；仍建議查無資料時回 `NOT_FOUND` 而非報錯。
- **金額精度**：沿用 `Number` 可如期上線；若日後要求嚴謹財務精度，再評估遷往 `Decimal128`（需改算術與序列化）。
- **回傳格式相容**：對外 DTO 盡量維持原欄位（`id`、`user_id`…）以降低前端改動，映射集中在 action/repository 層。
- **RLS 的取捨**：改用非公開 `MONGODB_URI` 後，DB 不再對前端暴露；授權仍全在應用層，務必維持每個 action 的成員檢查。
```
