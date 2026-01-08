# 部署指南

## 部署到 Vercel

### 準備工作

由於 Vercel 使用 serverless 架構,無法使用本地 SQLite 文件。我們需要使用雲端數據庫。

### 方案一: 使用 Turso (推薦)

Turso 是專為 serverless 設計的雲端 SQLite,完全相容現有的 SQL 語法。

#### 1. 安裝 Turso CLI

```bash
# macOS
brew install tursodatabase/tap/turso

# 或使用 curl
curl -sSfL https://get.tur.so/install.sh | bash
```

#### 2. 註冊並登入 Turso

```bash
turso auth signup
turso auth login
```

#### 3. 建立數據庫

```bash
# 建立數據庫
turso db create travel-budget

# 獲取數據庫 URL
turso db show travel-budget --url

# 建立認證 token
turso db tokens create travel-budget
```

#### 4. 更新 lib/db.ts

需要修改 `lib/db.ts` 來支持 Turso:

```typescript
import { createClient } from "@libsql/client";

const isDev = process.env.USE_LOCAL_DB === 'true';

let db: any;

if (isDev) {
  // 開發環境使用本地 SQLite
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(process.cwd(), 'database.db');
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
} else {
  // 生產環境使用 Turso
  db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export default db;
```

#### 5. 安裝依賴

```bash
npm install @libsql/client
```

#### 6. 初始化 Turso 數據庫

```bash
# 使用 Turso CLI 執行 SQL
turso db shell travel-budget < scripts/schema.sql
```

### 方案二: 使用 Vercel Postgres

Vercel Postgres 提供免費方案,但需要改寫所有 SQL 查詢。

#### 1. 在 Vercel Dashboard 建立 Postgres 數據庫

1. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
2. 選擇你的專案
3. 點擊 "Storage" → "Create Database" → "Postgres"

#### 2. 安裝 Vercel Postgres SDK

```bash
npm install @vercel/postgres
```

#### 3. 重寫所有數據庫查詢
需要將所有 `better-sqlite3` 的語法改為 Postgres 語法(工作量較大)。

---

## 部署步驟

### 1. 準備 Git Repository

確保所有更改已提交:

```bash
git add .
git commit -m "feat: prepare for Vercel deployment"
git push origin master
```

### 2. 連接 Vercel

1. 前往 [Vercel](https://vercel.com)
2. 使用 GitHub/GitLab 登入
3. 如果使用自架 Git,選擇 "Import Git Repository"
4. 輸入你的 Git URL: `https://git.mhhung.com/mhhung/travel-budget.git`

### 3. 配置環境變數

在 Vercel 專案設置中,添加環境變數:

#### 如果使用 Turso:
- `TURSO_DATABASE_URL`: 從 `turso db show travel-budget --url` 獲取
- `TURSO_AUTH_TOKEN`: 從 `turso db tokens create travel-budget` 獲取

#### 如果使用 Vercel Postgres:
- 自動配置,無需手動設置

### 4. 部署

點擊 "Deploy" 按鈕,Vercel 會自動:
1. Clone 你的 repository
2. 安裝依賴 (`npm install`)
3. 執行 build (`npm run build`)
4. 部署到全球 CDN

### 5. 測試

部署完成後,Vercel 會提供一個 URL,例如:
```
https://travel-budget-xxxx.vercel.app
```

使用手機或電腦訪問該 URL 進行測試。

---

## 環境變數設置

### 開發環境 (.env.local)

```bash
USE_LOCAL_DB=true
```

### 生產環境 (Vercel)

在 Vercel Dashboard → Settings → Environment Variables 添加:

```
TURSO_DATABASE_URL=libsql://travel-budget-xxx.turso.io
TURSO_AUTH_TOKEN=eyJhbGc...
```

---

## 常見問題

### Q: 為什麼不能直接使用 SQLite?
A: Vercel 使用 serverless functions,每次請求都是全新的環境,文件系統是唯讀的,無法寫入 SQLite 文件。

### Q: Turso 免費方案的限制?
A:
- 500 個數據庫
- 每月 9GB 存儲
- 每月 10 億行讀取
- 對於個人專案完全足夠

### Q: 如何遷移現有數據?
A:
```bash
# 1. 導出本地數據
sqlite3 database.db .dump > backup.sql

# 2. 導入到 Turso
turso db shell travel-budget < backup.sql
```

### Q: 如何監控部署狀態?
A: 在 Vercel Dashboard 可以看到:
- 部署日誌
- 運行時日誌
- 性能指標
- 錯誤追蹤

---

## 移動端優化建議

### 1. 響應式設計
- 已使用 Material-UI,自動適配移動端
- 建議測試不同螢幕尺寸

### 2. PWA 支持
可以添加 PWA 支持,讓用戶可以"安裝"到主屏幕:

```bash
npm install next-pwa
```

### 3. 性能優化
- 啟用 Next.js 圖片優化
- 使用 lazy loading
- 減少 bundle 大小

---

## 下一步

1. ✅ 選擇數據庫方案 (Turso 或 Vercel Postgres)
2. ✅ 更新 `lib/db.ts` 支持雲端數據庫
3. ✅ 配置環境變數
4. ✅ 推送到 Git
5. ✅ 在 Vercel 部署
6. ✅ 測試手機訪問
7. ✅ 優化移動端體驗

## 參考資源

- [Vercel 文檔](https://vercel.com/docs)
- [Turso 文檔](https://docs.turso.tech)
- [Next.js 部署指南](https://nextjs.org/docs/deployment)
