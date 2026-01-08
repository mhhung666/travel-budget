# Supabase 遷移總結

## 🎯 遷移完成!

你的旅行分帳 App 已成功從本地 SQLite 遷移到 Supabase,可以部署到 Vercel 了!

## 📝 更改摘要

### 新增的檔案
1. **[lib/supabase.ts](./lib/supabase.ts)** - Supabase 客戶端設定
2. **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** - Supabase 詳細設定指南
3. **[QUICKSTART.md](./QUICKSTART.md)** - 5 分鐘快速部署指南
4. **[DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)** - 部署檢查清單
5. **[MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md)** - 本文件

### 更新的檔案

#### API Routes (已全部更新)
- ✅ `app/api/auth/register/route.ts`
- ✅ `app/api/auth/login/route.ts`
- ✅ `app/api/trips/route.ts`
- ✅ `app/api/trips/join/route.ts`
- ✅ `app/api/trips/[id]/route.ts`
- ✅ `app/api/trips/[id]/members/route.ts`
- ✅ `app/api/trips/[id]/expenses/route.ts`
- ✅ `app/api/trips/[id]/expenses/[expenseId]/route.ts`
- ✅ `app/api/trips/[id]/settlement/route.ts`

#### 配置檔案
- ✅ `.env.example` - 新增 Supabase 環境變數
- ✅ `vercel.json` - 簡化配置
- ✅ `package.json` - 新增 @supabase/supabase-js

### 主要改動

#### 資料庫查詢語法
```typescript
// 之前 (SQLite)
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

// 之後 (Supabase)
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single();
```

#### 資料庫類型差異
- `INTEGER AUTOINCREMENT` → `SERIAL`
- `REAL` → `DECIMAL(10,2)`
- `DATETIME` → `TIMESTAMP`
- `?` 參數 → `.eq()`, `.in()` 方法

## 📦 相依套件

### 新增
- `@supabase/supabase-js` - Supabase JavaScript 客戶端

### 保留(仍在使用)
- `bcryptjs` - 密碼加密
- `jose` - JWT 處理
- `@mui/material` - UI 框架
- `next` - Next.js 框架

### 可以移除(選用)
- `better-sqlite3` - 只在本地開發需要
- `@types/better-sqlite3`

## 🚀 部署步驟

### 1. 快速開始
請按照 [QUICKSTART.md](./QUICKSTART.md) 的步驟操作

### 2. 詳細設定
如需更多細節,請參考 [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

### 3. 檢查清單
部署前請確認 [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)

## ⚡ 重要提醒

### 環境變數
**必須設定**以下環境變數:
```bash
NEXT_PUBLIC_SUPABASE_URL=你的_Supabase_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_Supabase_Key
JWT_SECRET=隨機字串
```

### Supabase 設定
**必須執行**以下步驟:
1. 在 SQL Editor 建立所有表格
2. 關閉 Row Level Security
3. 複製 API 金鑰

### Git 提交
確保以下檔案**不要**提交:
- `.env.local`
- `.env`
- `database.db*`

## 🎨 功能沒有改變!

所有原本的功能都完整保留:
- ✅ 用戶註冊/登入
- ✅ 建立旅行
- ✅ 加入旅行
- ✅ 新增支出
- ✅ 選擇分帳對象
- ✅ 查看支出列表
- ✅ 結算功能
- ✅ 所有 UI 和使用者體驗

## 📊 資料遷移(選用)

如果你有本地測試資料想要遷移:

```bash
# 1. 導出 SQLite 資料
sqlite3 database.db .dump > backup.sql

# 2. 編輯 backup.sql,調整語法:
#    - 移除 SQLite 特定語法
#    - AUTOINCREMENT → SERIAL
#    - 調整日期格式

# 3. 在 Supabase SQL Editor 執行
```

或者,重新測試並建立新資料(建議)。

## 🐛 疑難排解

### 錯誤: Missing Supabase environment variables
→ 檢查 `.env.local` 是否正確設定

### 錯誤: new row violates row-level security policy
→ 確認已執行 `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`

### 錯誤: relation "users" does not exist
→ 確認已在 SQL Editor 執行建表 SQL

### 部署成功但 500 錯誤
→ 檢查 Vercel 的環境變數是否正確設定

## 📚 參考資源

- [Supabase 官方文檔](https://supabase.com/docs)
- [Vercel 部署指南](https://vercel.com/docs)
- [Next.js 文檔](https://nextjs.org/docs)

## ✅ 下一步

1. 按照 [QUICKSTART.md](./QUICKSTART.md) 部署
2. 測試所有功能
3. 分享給朋友使用!

## 🎉 就這樣!

你現在有一個可以在雲端運行的旅行分帳 App 了!

有任何問題,請檢查:
1. Vercel Dashboard 的日誌
2. Supabase Dashboard 的日誌
3. 瀏覽器 Console 的錯誤訊息

祝你使用愉快! 🚀
