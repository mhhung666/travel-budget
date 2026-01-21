# 環境設定指南

## 目錄

- [本地開發環境](#本地開發環境)
- [Supabase 設定](#supabase-設定)
- [Vercel 部署](#vercel-部署)
- [常見問題](#常見問題)

---

## 本地開發環境

### 前置需求

- Node.js 20.x 或更高版本
- npm 或 yarn

### 安裝步驟

```bash
# 1. 克隆專案
git clone https://github.com/your-repo/travel-budget.git
cd travel-budget

# 2. 安裝依賴
npm install

# 3. 建立環境變數檔案
cp .env.example .env.local

# 4. 編輯 .env.local，填入你的設定值
# NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# JWT_SECRET=your-secret-key

# 5. 啟動開發伺服器
npm run dev
```

訪問 `http://localhost:3000` 開始使用。

### 可用的 Scripts

| 指令 | 說明 |
|------|------|
| `npm run dev` | 啟動開發伺服器 |
| `npm run build` | 建置生產版本 |
| `npm run start` | 啟動生產伺服器 |
| `npm run lint` | 執行 ESLint 檢查 |
| `npm run lint:fix` | 自動修復 ESLint 問題 |
| `npm run format` | 格式化程式碼 |
| `npm run test` | 執行測試 |

---

## Supabase 設定

### 步驟 1: 建立 Supabase 專案

1. 前往 [supabase.com](https://supabase.com) 註冊並登入
2. 點擊 "New Project"
   - **Name**: `travel-budget`
   - **Database Password**: 設定並記住
   - **Region**: `Northeast Asia (Tokyo)` (最接近台灣)
   - **Plan**: `Free`
3. 等待專案建立完成 (約 1-2 分鐘)

### 步驟 2: 建立資料庫表格

1. 在 Supabase Dashboard，點擊左側 **SQL Editor**
2. 點擊 **New query**
3. 貼上以下 SQL 並執行:

```sql
-- 用戶表
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password TEXT NOT NULL,
  is_virtual BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 旅行群組表
CREATE TABLE trips (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  location JSONB,
  hash_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 旅行成員表
CREATE TABLE trip_members (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trip_id, user_id)
);

-- 支出記錄表
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  payer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  original_amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD',
  exchange_rate DECIMAL(10,4) NOT NULL DEFAULT 1.0,
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
CREATE INDEX idx_trips_hash_code ON trips(hash_code);
```

### 步驟 3: 關閉 Row Level Security

在 SQL Editor 執行:

```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE trip_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits DISABLE ROW LEVEL SECURITY;
```

> ⚠️ 由於我們使用自己的 JWT 認證系統，需要關閉 Supabase 的 RLS。

### 步驟 4: 獲取 API 金鑰

1. 點擊左側 **Settings** → **API**
2. 複製這兩個值:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (很長的字串)

---

## Vercel 部署

### 方法 A: 使用 Vercel CLI (推薦)

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

### 方法 B: 使用 Vercel Dashboard

1. 前往 [vercel.com](https://vercel.com)
2. 點擊 "Add New" → "Project"
3. 選擇你的 Git 倉庫
4. 配置專案:
   - Framework Preset: `Next.js`
   - Root Directory: `./`
5. 添加環境變數:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `JWT_SECRET`
6. 點擊 "Deploy"

---

## 環境變數說明

| 變數 | 說明 | 必填 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名金鑰 | ✅ |
| `JWT_SECRET` | JWT 簽名密鑰 | ✅ |
| `NODE_ENV` | 環境模式 (development/production) | ❌ |

---

## 常見問題

### Q: API 呼叫失敗?
檢查 Supabase Dashboard → **Logs** 查看錯誤訊息。

### Q: 環境變數沒生效?
在 Vercel Dashboard → Settings → Environment Variables 確認已添加，並重新部署。

### Q: RLS 錯誤?
確保已執行 `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`。

### Q: 如何查看資料?
在 Supabase Dashboard → **Table Editor** 可以看到所有資料。

### Q: 免費方案的限制?
- 500MB 資料庫空間
- 2GB 頻寬/月
- 50,000 每月活躍用戶
- 對個人專案完全夠用!

### Q: 如何備份資料?
在 Supabase **Database** → **Backups** 可以手動建立備份或設定自動備份。

---

## 資料庫升級 (Migration)

### v2.1.0 - 新增旅遊時間與地點欄位

如果你的資料庫是在此版本之前建立的，請執行以下 SQL 來新增欄位：

```sql
-- 新增旅遊時間與地點欄位
ALTER TABLE trips ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS location JSONB;
```

**新增欄位說明：**

| 欄位 | 類型 | 說明 |
|------|------|------|
| `start_date` | DATE | 旅遊開始日期 |
| `end_date` | DATE | 旅遊結束日期 |
| `location` | JSONB | 旅遊地點資訊（包含經緯度） |

**location JSONB 格式範例：**

```json
{
  "name": "東京",
  "display_name": "東京都, 日本",
  "lat": 35.6762,
  "lon": 139.6503,
  "country": "日本",
  "country_code": "JP"
}
```

> 地點資料由 OpenStreetMap Nominatim API 提供，儲存經緯度以便未來實作地圖可視化功能。

### v2.2.0 - 新增虛擬成員功能

如果你的資料庫是在此版本之前建立的，請執行以下 SQL 來新增欄位：

```sql
-- 新增虛擬成員欄位
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT FALSE;
```

**功能說明：**

虛擬成員是為了讓不想註冊帳號的旅伴也能參與分帳。虛擬成員：
- 使用 UUID 作為 username（無法登入）
- 可以被指定為付款人或分帳對象
- 可以被管理員直接從旅行中刪除
- 未來可透過邀請功能轉為正式會員
