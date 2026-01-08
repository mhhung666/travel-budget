# Supabase 設定指南

## 步驟 1: 建立 Supabase 專案

1. 前往 [Supabase](https://supabase.com)
2. 點擊 "Start your project"
3. 使用 GitHub 登入(建議)或 Email 註冊
4. 點擊 "New Project"
5. 填寫資料:
   - **Name**: `travel-budget` (或你喜歡的名稱)
   - **Database Password**: 設定一個強密碼(記下來!)
   - **Region**: 選擇 `Northeast Asia (Tokyo)` (最接近台灣)
   - **Pricing Plan**: 選擇 `Free` (免費方案)
6. 點擊 "Create new project"
7. 等待 1-2 分鐘讓專案初始化

## 步驟 2: 獲取 API 金鑰

專案建立完成後:

1. 在左側選單點擊 **Settings** (齒輪圖示)
2. 點擊 **API**
3. 你會看到:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (很長的字串)

**複製這兩個值,稍後會用到!**

## 步驟 3: 建立資料庫表格

1. 在左側選單點擊 **SQL Editor** (</> 圖示)
2. 點擊 **New query**
3. 貼上以下 SQL:

\`\`\`sql
-- 用戶表
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 旅行群組表
CREATE TABLE trips (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 旅行成員表
CREATE TABLE trip_members (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 支出記錄表
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  payer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 分帳記錄表
CREATE TABLE expense_splits (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_amount DECIMAL(10,2) NOT NULL
);

-- 建立索引以提升查詢效能
CREATE INDEX idx_trip_members_trip_id ON trip_members(trip_id);
CREATE INDEX idx_trip_members_user_id ON trip_members(user_id);
CREATE INDEX idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX idx_expenses_payer_id ON expenses(payer_id);
CREATE INDEX idx_expense_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON expense_splits(user_id);
\`\`\`

4. 點擊右下角的 **Run** 按鈕 (或按 Ctrl+Enter)
5. 如果看到 "Success. No rows returned",表示成功!

## 步驟 4: 設定本地環境變數

在專案根目錄建立 `.env.local` 檔案:

\`\`\`bash
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

**記得替換成你的實際值!**

## 步驟 5: 關閉 Row Level Security (RLS)

⚠️ **重要**: 由於我們使用自己的認證系統,需要關閉 Supabase 的 RLS

1. 在 Supabase Dashboard,點擊左側的 **Authentication**
2. 點擊 **Policies**
3. 對每個表格(users, trips, trip_members, expenses, expense_splits):
   - 找到該表格
   - 如果有任何 Policy,刪除它們
   - 確保 "RLS enabled" 是 **關閉** 狀態

或者,在 SQL Editor 執行:

\`\`\`sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits DISABLE ROW LEVEL SECURITY;
\`\`\`

## 步驟 6: 測試連接

啟動開發伺服器:

\`\`\`bash
npm run dev
\`\`\`

訪問 `http://localhost:3000` 並測試:
1. 註冊新用戶
2. 建立旅行
3. 新增支出
4. 查看結算

## 步驟 7: 在 Supabase Dashboard 查看資料

1. 點擊左側的 **Table Editor** (表格圖示)
2. 選擇任一表格(如 `users`)
3. 你應該會看到剛才新增的資料!

## Vercel 部署設定

在 Vercel Dashboard → Settings → Environment Variables 添加:

\`\`\`
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

## 常見問題

### Q: 為什麼要關閉 RLS?
A: Supabase 的 RLS (Row Level Security) 是用來配合它內建的認證系統。因為我們使用自己的 JWT 認證,所以需要關閉 RLS。

### Q: 免費方案的限制?
A:
- 500MB 資料庫空間
- 2GB 頻寬/月
- 50,000 每月活躍用戶
- 對個人專案完全夠用!

### Q: 如何查看 API 請求?
A: 在 Supabase Dashboard → **Logs** 可以看到所有 API 請求和錯誤。

### Q: 如何備份資料?
A: 在 **Database** → **Backups** 可以手動建立備份或設定自動備份。

## 遷移現有資料(可選)

如果你有本地 SQLite 資料需要遷移:

\`\`\`bash
# 1. 導出 SQLite 資料
sqlite3 database.db .dump > backup.sql

# 2. 在 Supabase SQL Editor 執行該 SQL
# (可能需要手動調整一些語法差異)
\`\`\`

## 下一步

✅ 完成以上設定後,你的應用就可以使用 Supabase 了!
✅ 所有資料會自動同步到雲端
✅ 可以直接部署到 Vercel,無需額外配置
