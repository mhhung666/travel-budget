# 旅行分帳 App (Travel Split Bill)

一個輕量化的旅行記帳與分帳應用程式,適合多人出國旅行時使用。

## 功能需求

### 1. 用戶管理
- 簡單的用戶註冊功能
- 支援多人使用(例如:4人出國旅行)
- 用戶可以建立或加入旅行群組

### 2. 記帳功能
- 記錄每筆支出
- 選擇付款人
- 選擇分帳對象(可選擇 1-3 人平分,或全部 4 人平分)
- 記錄支出項目、金額、日期

### 3. 結算功能
- 自動計算每個人之間的債務關係
- 顯示誰應該付給誰多少錢
- 支援所有可能的配對結算:
  - A → B, A → C, A → D
  - B → C, B → D
  - C → D
- 使用最小轉帳次數演算法優化結算

## 技術架構

### 前端
- **框架**: React
- **部署平台**: Vercel
- **UI 框架**: (建議使用 Tailwind CSS 或 Material-UI)
- **狀態管理**: (建議使用 Context API 或 Zustand)
- **路由**: React Router

### 後端
- **架構**: 前後端分離
- **後端框架**: Node.js + Express (或 Next.js API Routes)
- **數據庫**: SQLite (輕量化方案)
- **部署**:
  - 如使用 Next.js: Vercel 全棧部署
  - 如使用獨立後端: Vercel Serverless Functions 或其他平台

### 為什麼需要分前後端?
使用 SQLite 需要後端的原因:
1. **數據持久化**: SQLite 是服務端數據庫,需要在服務器上運行
2. **數據共享**: 多個用戶需要訪問同一份數據
3. **數據安全**: 避免直接在前端暴露數據庫操作

**建議方案**: 使用 **Next.js** 全棧框架
- 前端: React (Next.js)
- 後端: Next.js API Routes
- 數據庫: SQLite (通過 better-sqlite3)
- 部署: Vercel 一站式部署

## 數據庫設計

### Users (用戶表)
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Trips (旅行群組表)
```sql
CREATE TABLE trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  hash_code TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### TripMembers (旅行成員表)
```sql
CREATE TABLE trip_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(trip_id, user_id)
);
```

### Expenses (支出記錄表)
```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  payer_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id),
  FOREIGN KEY (payer_id) REFERENCES users(id)
);
```

### ExpenseSplits (分帳記錄表)
```sql
CREATE TABLE expense_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  share_amount REAL NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 核心功能實現

### 1. 新增支出
```
輸入:
- 付款人
- 總金額
- 支出項目
- 分帳對象(選擇 1-4 人)

處理:
- 計算每人應分擔金額 = 總金額 / 分帳人數
- 記錄到 expenses 表
- 記錄每個人的分擔金額到 expense_splits 表
```

### 2. 結算演算法
```
計算步驟:
1. 計算每個人的淨支出(總付款 - 總應分擔)
2. 分為欠款組(負數)和收款組(正數)
3. 使用貪心算法匹配,減少轉帳次數
4. 輸出每對用戶之間的結算金額
```

## 頁面規劃

### 1. 登入/註冊頁面
- 簡單的用戶名註冊
- 登入功能

### 2. 旅行列表頁面
- 顯示所有旅行
- 建立新旅行
- 加入現有旅行

### 3. 旅行詳情頁面
- 顯示旅行成員
- 顯示所有支出記錄
- 新增支出按鈕
- 查看結算按鈕

### 4. 新增支出頁面
- 選擇付款人
- 輸入金額
- 輸入項目描述
- 選擇分帳對象(多選)
- 確認新增

### 5. 結算頁面
- 顯示每個人的總支出
- 顯示每個人應分擔的金額
- 顯示結算結果(誰應該付給誰多少錢)

## 部署指南

### Vercel 部署步驟
1. 將代碼推送到 GitHub
2. 連接 Vercel 帳號
3. 導入 GitHub 倉庫
4. 設置環境變量(如需要)
5. 點擊部署

### 注意事項
- Vercel Serverless Functions 有執行時間限制
- SQLite 文件需要持久化存儲方案
- 建議使用 Vercel Postgres 或其他雲端數據庫替代 SQLite(生產環境)

### 替代方案(推薦用於生產環境)
- **數據庫**: Vercel Postgres / Supabase
- **認證**: NextAuth.js
- **ORM**: Prisma

## 項目結構
```
travel/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/            # API Routes
│   │   ├── login/          # 登入頁面
│   │   ├── trips/          # 旅行相關頁面
│   │   └── page.tsx        # 首頁
│   ├── components/         # React 組件
│   ├── lib/               # 工具函數
│   │   ├── db.ts          # 數據庫連接
│   │   └── settlement.ts  # 結算演算法
│   └── types/             # TypeScript 類型定義
├── public/                # 靜態資源
├── database.db            # SQLite 數據庫文件
├── package.json
└── README.md
```

## 🚀 快速部署指南

請參考:
- **[QUICKSTART.md](./QUICKSTART.md)** - 5 分鐘快速部署指南
- **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** - 詳細設定說明

### ✅ 最新功能 (Phase 6 已完成)

**Phase 6: 管理員功能與旅行分享** ✅
核心功能已全部實現:
1. ✅ **管理員權限系統** - 旅行創建者可刪除旅行或移除成員
2. ✅ **簡化 ID 系統** - 使用短 hash code (如 `a7x9k2`) 替代數字 ID
3. ✅ **旅行分享功能** - 分享 ID 讓其他人快速加入旅行
4. ✅ **快速加入頁面** - 通過連結 `/join/[hashCode]` 快速加入旅行
5. ✅ **完整通知系統** - 操作成功/失敗提示

### 開發歷程
所有開發階段的詳細文檔已歸檔至 [docs/archive](./docs/archive/) 目錄

## 技術棧總結

| 類別 | 技術 |
|------|------|
| 前端框架 | React + Next.js 16 |
| 樣式 | Material-UI (MUI) |
| 數據庫 | Supabase (Postgres) |
| 認證 | JWT (jose) |
| 部署 | Vercel |
| 語言 | TypeScript |

## 開始開發

### 本地開發

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數 (複製 .env.example 為 .env.local)
cp .env.example .env.local

# 3. 在 .env.local 填入你的 Supabase 金鑰
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 4. 啟動開發伺服器
npm run dev
```

### 部署到 Vercel

請參考 [QUICKSTART.md](./QUICKSTART.md) 的完整步驟

## License
MIT
