# Travel Budget Planner - 旅行記帳

一個現代化、輕量級的旅行記帳與分帳應用程式，專為多人出國旅行設計。協助團隊輕鬆追蹤支出、自動計算債務，並支援多幣別即時匯率轉換。

## ✨ 核心特色 (Features)

- **多人即時協作**: 支援創建旅行群組，邀請成員加入，共同記錄消費。
- **虛擬/實體成員**: 彈性管理成員，可連結實際帳號或使用虛擬成員記帳。
- **智慧分帳**: 自動計算每筆費用的分攤金額（均分、自定義比例或指定金額）。
- **結算報表**: 一鍵生成結算方案，清晰展示「誰該給誰多少錢」，支援最小化轉帳次數。
- **多幣別支援**: 內建即時匯率轉換，自動將當地貨幣換算為基準貨幣。
- **視覺化圖表**: 使用 Recharts 提供清晰的支出統計圖表（按類別、按成員、按日期）。
- **行程規劃**: 整合行程表功能，將消費與行程結合。
- **現代化 UI/UX**: 基於 Shadcn UI 與 Tailwind CSS 設計，支援深色模式 (Dark Mode) 與響應式佈局。

## 🛠 技術架構 (Tech Stack)

### Frontend
- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/) (Based on Radix UI)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Internationalization**: [next-intl](https://next-intl-docs.vercel.app/) (en/zh-TW)
- **State Management**: React Hooks & Server Actions

### Backend & Infrastructure
- **Database**: [Supabase (PostgreSQL)](https://supabase.com/)
- **Authentication**: Custom JWT / Supabase Auth
- **API**: Next.js API Routes & Server Actions
- **Deployment**: Vercel

## 📂 專案結構 (Project Structure)

```
src/
├── actions/          # Server Actions (資料庫操作與業務邏輯)
├── app/              # Next.js App Router
│   ├── [locale]/     # 多語系路由頁面 (Frontend Pages)
│   └── api/          # 後端 API Routes (API Endpoints)
├── components/       # React Components
│   ├── common/       # 通用元件 (Loading, Error, Headers)
│   ├── expenses/     # 支出相關元件 (ExpenseCard, ExpenseForm)
│   ├── layout/       # 佈局元件 (Navbar, ThemeProvider)
│   ├── stats/        # 統計圖表元件 (Charts)
│   ├── trips/        # 行程相關元件 (Detail, Dialogs)
│   └── ui/           # Shadcn UI 基礎元件
├── hooks/            # Custom React Hooks
├── i18n/             # 國際化與路由設定
├── lib/              # 工具函式庫 (Supabase Client, Utils)
├── services/         # 外部服務整合 (Exchange Rates)
└── types/            # TypeScript 型別定義
```

## 🚀 快速開始 (Getting Started)

### 1. 前置需求
- Node.js 18+
- Supabase 專案 (需設定資料庫與環境變數)

### 2. 安裝依賴
```bash
# Clone 專案
git clone <repository-url>
cd travel-budget

# 安裝套件
pnpm install
```

### 3. 設定環境變數
複製 `.env.example` 為 `.env` 並填入 Supabase 連線資訊：
```bash
cp .env.example .env
```

**`.env` 內容範例:**
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. 初始化資料庫
請在 Supabase Dashboard 的 SQL Editor 中執行專案提供的 SQL 初始化腳本（位於 `docs/schema.sql` 或參考 `src/lib/supabase.ts`），建立必要的資料表與關聯。

### 5. 啟動開發伺服器
```bash
pnpm dev
```
開啟瀏覽器訪問 `http://localhost:3000`。

## 📜 腳本指令 (Scripts)

| 指令 | 說明 |
| --- | --- |
| `pnpm dev` | 啟動開發環境 (Turbopack) |
| `pnpm build` | 建置生產版本 |
| `pnpm start` | 執行生產版本 |
| `pnpm lint` | 執行 ESLint 程式碼檢查 |
| `pnpm format` | 執行 Prettier 程式碼格式化 |
| `pnpm test` | 執行單元測試 (Vitest) |

## 🤝 貢獻 (Contributing)

歡迎提交 Pull Request 或 Issue 來協助改進此專案。

## 📄 授權 (License)

[MIT License](LICENSE)
