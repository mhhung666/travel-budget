# 快速開始指南

## 🚀 部署步驟總覽

### 1️⃣ 設定 Supabase (5 分鐘)

1. 前往 [supabase.com](https://supabase.com) 註冊並登入
2. 點擊 "New Project"
   - Name: `travel-budget`
   - Database Password: 設定並記住
   - Region: `Northeast Asia (Tokyo)`
   - Plan: `Free`
3. 等待專案建立完成(約 1-2 分鐘)

### 2️⃣ 建立資料庫表格

1. 在 Supabase Dashboard,點擊左側 **SQL Editor**
2. 點擊 **New query**
3. 貼上以下 SQL 並執行 (Ctrl+Enter 或點 Run):

```sql
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

-- 建立索引
CREATE INDEX idx_trip_members_trip_id ON trip_members(trip_id);
CREATE INDEX idx_trip_members_user_id ON trip_members(user_id);
CREATE INDEX idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX idx_expenses_payer_id ON expenses(payer_id);
CREATE INDEX idx_expense_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON expense_splits(user_id);
```

### 3️⃣ 關閉 Row Level Security

在 SQL Editor 執行:

```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits DISABLE ROW LEVEL SECURITY;
```

### 4️⃣ 獲取 API 金鑰

1. 點擊左側 **Settings** → **API**
2. 複製這兩個值:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (很長)

### 5️⃣ 本地測試

建立 `.env.local` 檔案:

```bash
NEXT_PUBLIC_SUPABASE_URL=你的_Project_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_anon_public_key
JWT_SECRET=任意隨機字串
```

啟動開發伺服器:

```bash
npm install
npm run dev
```

訪問 `http://localhost:3000` 測試所有功能!

### 6️⃣ 部署到 Vercel

#### 方法 A: 使用 Vercel CLI (推薦)

```bash
# 安裝 Vercel CLI
npm i -g vercel

# 登入
vercel login

# 部署
vercel

# 設定環境變數
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add JWT_SECRET

# 重新部署以套用環境變數
vercel --prod
```

#### 方法 B: 使用 Vercel Dashboard

1. 前往 [vercel.com](https://vercel.com)
2. 點擊 "Add New" → "Project"
3. 如果使用自架 Git:
   - 選擇 "Import Third-Party Git Repository"
   - 輸入: `https://git.mhhung.com/mhhung/travel-budget.git`
4. 配置專案:
   - Framework Preset: `Next.js`
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `.next`
5. 添加環境變數:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `JWT_SECRET`
6. 點擊 "Deploy"

### 7️⃣ 完成!

部署完成後,你會得到一個網址,例如:
```
https://travel-budget-xxxx.vercel.app
```

用手機訪問這個網址就可以使用了!

---

## 📱 手機測試

1. 在手機瀏覽器輸入 Vercel 提供的網址
2. 註冊新帳號
3. 建立旅行
4. 新增支出
5. 查看結算

---

## 🐛 常見問題

### Q: API 呼叫失敗?
檢查 Supabase Dashboard → **Logs** 查看錯誤訊息

### Q: 環境變數沒生效?
在 Vercel Dashboard → Settings → Environment Variables 確認已添加,並重新部署

### Q: RLS 錯誤?
確保已執行 `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`

### Q: 如何查看資料?
在 Supabase Dashboard → **Table Editor** 可以看到所有資料

---

## 📚 詳細文檔

- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase 詳細設定
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 部署詳細說明
- [README.md](./README.md) - 專案完整說明

---

## 🎉 就這樣!

你的旅行分帳 App 已經上線,可以分享給朋友一起使用了!
