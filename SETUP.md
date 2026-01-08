# 快速啟動指南

## Phase 1 完成項目 ✅

已完成的設置:
- ✅ Next.js 14 with App Router
- ✅ TypeScript 配置
- ✅ Tailwind CSS 樣式系統
- ✅ SQLite 數據庫初始化
- ✅ 項目文件結構
- ✅ 基礎頁面和佈局

## 當前項目結構

```
travel/
├── app/                    # Next.js App Router
│   ├── globals.css        # 全局樣式 + Tailwind
│   ├── layout.tsx         # 根佈局
│   ├── page.tsx           # 首頁
│   ├── api/               # API Routes (待開發)
│   ├── login/             # 登入頁面 (待開發)
│   └── trips/             # 旅行頁面 (待開發)
├── components/            # React 組件 (待開發)
├── lib/                   # 工具函數
│   ├── db.ts             # 數據庫連接和初始化
│   └── settlement.ts     # 結算演算法
├── types/                # TypeScript 類型定義
│   └── index.ts          # 主要類型接口
├── scripts/              # 工具腳本
│   └── init-db.ts        # 數據庫初始化腳本
├── public/               # 靜態資源
├── database.db           # SQLite 數據庫文件
├── next.config.ts        # Next.js 配置
├── tailwind.config.ts    # Tailwind CSS 配置
├── tsconfig.json         # TypeScript 配置
└── package.json          # 項目依賴

```

## 數據庫架構

已創建的表:

1. **users** - 用戶表
   - id, username, display_name, password, created_at

2. **trips** - 旅行群組表
   - id, name, description, created_at

3. **trip_members** - 旅行成員關聯表
   - id, trip_id, user_id, joined_at

4. **expenses** - 支出記錄表
   - id, trip_id, payer_id, amount, description, date, created_at

5. **expense_splits** - 分帳明細表
   - id, expense_id, user_id, share_amount

## 開發命令

```bash
# 啟動開發服務器
npm run dev

# 構建生產版本
npm run build

# 啟動生產服務器
npm start

# 運行 Linter
npm run lint

# 重新初始化數據庫
npx tsx scripts/init-db.ts
```

## 訪問應用

開發服務器啟動後,訪問:
- 本地: http://localhost:3000
- 網絡: http://172.25.1.2:3000 (可在手機上訪問)

## 已安裝的依賴

### 核心依賴
- next: ^16.1.1
- react: ^19.2.3
- react-dom: ^19.2.3
- typescript: ^5.9.3
- better-sqlite3: ^12.5.0

### 開發依賴
- tailwindcss: ^4.1.18
- autoprefixer: ^10.4.23
- postcss: ^8.5.6
- @types/better-sqlite3: ^7.6.13
- @types/react: ^19.2.7
- @types/react-dom: ^19.2.3
- @types/node: ^25.0.3

## 下一步 (Phase 2)

準備開發用戶功能:
1. 實現用戶註冊 API
2. 實現用戶登入 API
3. 實現 Session 管理
4. 創建登入/註冊頁面

## 注意事項

- 數據庫文件 `database.db` 已加入 .gitignore
- 使用 better-sqlite3 進行數據庫操作
- 所有 API 路由將在 `app/api/` 目錄下
- 使用 TypeScript 嚴格模式
- Tailwind CSS 已配置好,可直接使用工具類
