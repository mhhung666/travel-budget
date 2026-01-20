# Travel Budget - 旅行記帳

一個輕量化的旅行記帳與分帳應用程式，適合多人出國旅行時使用。

## ✨ 功能特色

- 📝 **輕鬆記帳** - 快速記錄每筆支出，隨時隨地更新
- 💰 **多幣別支援** - 支援 TWD、JPY、USD、EUR、HKD 自動換算
- 👥 **智能分帳** - 自動計算每個人應付的金額
- 📊 **一鍵結算** - 最優化的轉帳方案，省時又便利
- 🔗 **邀請分享** - 使用短代碼邀請朋友加入旅行
- 🌐 **多語言** - 支援中文和英文介面
- 🌙 **深色模式** - 支援淺色/深色主題切換
- 📱 **響應式設計** - 手機、平板、電腦都能使用

## 🚀 快速開始

### 環境需求

- Node.js 20.x 或更高版本
- npm 或 yarn
- Supabase 帳號 (免費)

### 安裝步驟

```bash
# 1. 安裝依賴
npm install

# 2. 建立環境變數
cp .env.example .env.local

# 3. 編輯 .env.local，填入設定值
# NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# JWT_SECRET=your-secret-key

# 4. 啟動開發伺服器
npm run dev
```

訪問 `http://localhost:3000` 開始使用。

📖 詳細設定請參考 [docs/SETUP.md](./docs/SETUP.md)

## 📁 專案結構

```
travel-budget/
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # 共用元件
│   ├── hooks/            # Custom Hooks
│   ├── services/         # API 服務層
│   ├── lib/              # 工具函數
│   ├── types/            # TypeScript 型別
│   ├── constants/        # 常數定義
│   └── i18n/             # 國際化
├── docs/                 # 文件
└── public/               # 靜態資源
```

📖 詳細架構請參考 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## 🛠 技術棧

| 類別 | 技術 |
|------|------|
| 前端框架 | React 19 + Next.js 16 (App Router) |
| UI 框架 | Material-UI (MUI) 7 |
| 語言 | TypeScript 5.9 |
| 資料庫 | Supabase (PostgreSQL) |
| 認證 | JWT (jose) |
| 國際化 | next-intl |
| 部署 | Vercel |
| 代碼品質 | ESLint + Prettier |
| 測試 | Vitest + React Testing Library |

## 📝 開發指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 啟動開發伺服器 |
| `npm run build` | 建置生產版本 |
| `npm run lint` | 執行 ESLint 檢查 |
| `npm run lint:fix` | 自動修復 ESLint 問題 |
| `npm run format` | 格式化程式碼 |
| `npm run test` | 執行測試 |

## 📚 文件

| 文件 | 說明 |
|------|------|
| [docs/SETUP.md](./docs/SETUP.md) | 環境設定指南 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 專案架構說明 |
| [docs/REFACTOR_V2.md](./docs/REFACTOR_V2.md) | v2.0 重構記錄 |

## 🌐 部署

本專案可輕鬆部署到 Vercel:

1. Fork 此專案到你的 GitHub
2. 在 [Vercel](https://vercel.com) 匯入專案
3. 設定環境變數
4. 完成部署

📖 詳細步驟請參考 [docs/SETUP.md](./docs/SETUP.md#vercel-部署)

## 📦 版本歷史

### v2.0.0 (進行中)
- 重構專案結構，移至 `src/` 目錄
- 新增 ESLint + Prettier 配置
- 建立 Custom Hooks 和 API 服務層
- 提取共用元件
- 完善 i18n 國際化

### v1.0.2
- 支出編輯功能
- 多幣別支援 (TWD, JPY, USD, EUR, HKD)
- 自動匯率換算

### v1.0.1
- 管理員權限系統
- Hash code 邀請系統
- 快速加入頁面

## License

MIT
