# Phase 6 遷移指南

本指南將引導你完成 Phase 6 的數據庫遷移步驟。

---

## 📋 前置準備

在開始之前,請確保:
1. ✅ 已有 Supabase 專案並正常運行
2. ✅ 本地 `.env.local` 已設定 Supabase 金鑰
3. ✅ **強烈建議**: 先在 Supabase 建立數據庫備份

### 建立備份 (重要!)

1. 登入 Supabase Dashboard
2. 左側選單 → **Database** → **Backups**
3. 點擊 **Create backup** 建立手動備份
4. 等待備份完成後再繼續

---

## Step 1: 執行數據庫 Schema 更新

### 1.1 開啟 Supabase SQL Editor

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard)
2. 選擇你的專案
3. 左側選單點擊 **SQL Editor** (</> 圖示)
4. 點擊 **New query**

### 1.2 執行 Schema 更新 SQL

複製並貼上以下 SQL 腳本到 SQL Editor:

```sql
-- Phase 6: Schema Updates
-- 此腳本需要在 Supabase SQL Editor 執行

-- 1. 在 trip_members 表格新增 role 欄位
ALTER TABLE trip_members ADD COLUMN role TEXT DEFAULT 'member';

-- 新增註解說明角色類型
COMMENT ON COLUMN trip_members.role IS 'User role in trip: admin (creator) or member';

-- 2. 在 trips 表格新增 hash_code 欄位
ALTER TABLE trips ADD COLUMN hash_code TEXT UNIQUE;

-- 新增註解
COMMENT ON COLUMN trips.hash_code IS 'Short hash code for easy sharing (e.g., a7x9k2)';

-- 3. 建立 hash_code 索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_trips_hash_code ON trips(hash_code);

-- 4. 建立 role 索引
CREATE INDEX IF NOT EXISTS idx_trip_members_role ON trip_members(role);

-- 驗證變更
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'trip_members' AND column_name = 'role';

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'trips' AND column_name = 'hash_code';
```

### 1.3 執行腳本

1. 點擊右下角 **Run** 按鈕 (或按 Ctrl+Enter / Cmd+Enter)
2. 等待執行完成
3. 檢查結果:
   - 應該會看到兩個查詢結果表格
   - 第一個表格顯示 `role` 欄位資訊
   - 第二個表格顯示 `hash_code` 欄位資訊

### 1.4 驗證變更

在 Supabase Dashboard:
1. 左側選單 → **Table Editor**
2. 選擇 `trip_members` 表格
   - 應該會看到新的 `role` 欄位
3. 選擇 `trips` 表格
   - 應該會看到新的 `hash_code` 欄位

---

## Step 2: 執行數據遷移腳本

現在需要為現有的旅行生成 `hash_code` 並設定管理員。

### 2.1 確認環境變數

確保 `.env.local` 包含以下內容:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 執行遷移腳本

在專案根目錄執行:

```bash
npm run migrate:phase6
```

### 2.3 預期輸出

你應該會看到類似以下的輸出:

```
🚀 Phase 6 數據遷移開始

==================================================

📋 開始為旅行生成 hash_code...

找到 3 個需要生成 hash_code 的旅行

✅ 旅行 "日本旅行" (ID: 1) -> hash_code: a7x9k2
✅ 旅行 "台北週末遊" (ID: 2) -> hash_code: m3p8t1
✅ 旅行 "墾丁之旅" (ID: 3) -> hash_code: k5w2n7

📊 Hash Code 遷移完成:
   成功: 3
   失敗: 0

==================================================

👑 開始設定旅行管理員...

找到 3 個旅行需要設定管理員

✅ 旅行 "日本旅行" (ID: 1) -> 管理員: user_id 1
✅ 旅行 "台北週末遊" (ID: 2) -> 管理員: user_id 2
✅ 旅行 "墾丁之旅" (ID: 3) -> 管理員: user_id 1

📊 管理員設定完成:
   成功: 3
   失敗: 0

==================================================

✨ 遷移完成!
```

### 2.4 驗證遷移結果

#### 驗證 Hash Code

在 Supabase Dashboard → Table Editor → `trips`:
- 每個旅行應該都有 `hash_code` 欄位值
- 每個 `hash_code` 應該是唯一的 6-8 位小寫字母和數字組合

#### 驗證管理員角色

在 Supabase Dashboard → Table Editor → `trip_members`:
- 每個旅行應該至少有一個成員的 `role` 為 `'admin'`
- 其他成員的 `role` 應該是 `'member'`

---

## 🔍 疑難排解

### 問題 1: "Unable to generate unique hash code"

**原因**: hash code 碰撞次數過多

**解決方法**:
1. 檢查 `trips` 表格的 `hash_code` 欄位
2. 如果有重複,手動更新或刪除重複值
3. 重新執行遷移腳本

### 問題 2: 遷移腳本執行失敗

**可能原因**:
- 環境變數未設定
- Supabase 連線問題
- Schema 未更新

**解決步驟**:
1. 確認 `.env.local` 是否正確設定
2. 確認 Step 1 的 Schema 更新是否成功
3. 檢查終端機的錯誤訊息
4. 確認網路連線正常

### 問題 3: 部分旅行沒有管理員

**解決方法**:

在 Supabase SQL Editor 執行:

```sql
-- 查詢沒有管理員的旅行
SELECT t.id, t.name
FROM trips t
LEFT JOIN trip_members tm ON t.id = tm.trip_id AND tm.role = 'admin'
WHERE tm.id IS NULL;

-- 手動設定管理員 (將 TRIP_ID 和 USER_ID 替換為實際值)
UPDATE trip_members
SET role = 'admin'
WHERE trip_id = TRIP_ID AND user_id = USER_ID;
```

---

## ✅ 遷移檢查清單

完成後,請確認以下項目:

- [ ] Step 1: Schema 更新成功
  - [ ] `trip_members` 有 `role` 欄位
  - [ ] `trips` 有 `hash_code` 欄位
  - [ ] 索引已建立

- [ ] Step 2: 數據遷移成功
  - [ ] 所有旅行都有唯一的 `hash_code`
  - [ ] 所有旅行都至少有一個管理員 (role='admin')
  - [ ] 無錯誤訊息

- [ ] 驗證測試
  - [ ] 在 Supabase Table Editor 檢查數據
  - [ ] 確認沒有 NULL 值或重複值

---

## 📚 相關文件

- [PHASE6_PLAN.md](./PHASE6_PLAN.md) - Phase 6 完整開發計劃
- [scripts/phase6-schema-update.sql](./scripts/phase6-schema-update.sql) - Schema 更新腳本
- [scripts/migrate-phase6.js](./scripts/migrate-phase6.js) - 數據遷移腳本
- [lib/hashcode.ts](./lib/hashcode.ts) - Hash Code 工具函數

---

## 🎯 下一步

完成遷移後,可以繼續執行:
- **Step 3**: 實現管理員權限檢查
- **Step 4**: 更新 API 路由
- **Step 5**: 更新前端 UI

請參考 [PHASE6_PLAN.md](./PHASE6_PLAN.md) 了解完整開發步驟。
