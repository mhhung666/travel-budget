# Travel Budget

一個輕量化的旅行記帳與分帳應用程式，專為多人出國旅行設計。

## ✨ 特色

- **多人協作**: 支援即時多人共同記帳
- **智慧分帳**: 自動計算每個人應付金額，支援複雜的分帳規則
- **多幣別支援**: 自動匯率轉換，輕鬆處理跨國消費
- **視覺化統計**: 清晰的圖表展示支出分佈
- **深色模式**: 舒適的夜間瀏覽體驗 (支援系統自動切換)
- **響應式設計**: 手機、平板、電腦皆可完美使用

## 🛠 技術棧 (Tech Stack)

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Library**: [Material UI (MUI) v7](https://mui.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database / Auth**: [Supabase](https://supabase.com/)
- **Internationalization**: [next-intl](https://next-intl-docs.vercel.app/)

## 🚀 快速開始 (Getting Started)

### 前置需求

- Node.js 18+
- Supabase 專案 (需設定資料庫與環境變數)

### 安裝

1. Clone 專案
   ```bash
   git clone <repository-url>
   cd travel-budget
   ```

2. 安裝依賴
   ```bash
   npm install
   # 或
   yarn install
   ```

3. 設定環境變數
   複製 `.env.example` 為 `.env` 並填入 Supabase URL 與 Key。
   ```bash
   cp .env.example .env
   ```
   
   `.env` 內容範例:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. 初始化資料庫
   在 Supabase Dashboard 的 SQL Editor 中執行 `src/lib/supabase.ts` 內的 `INIT_SQL` 語法以建立資料表。

5. 啟動開發伺服器
   ```bash
   npm run dev
   ```

6. 開啟瀏覽器訪問 `http://localhost:3000`

## 📁 專案結構

```
src/
├── app/              # Next.js App Router 頁面與 API
│   ├── [locale]/     # 多語系路由頁面
│   └── api/          # 後端 API Routes
├── components/       # 共用元件
├── lib/              # 工具函式庫 (Supabase, Auth 等)
├── services/         # API 服務層
├── types/            # TypeScript 型別定義
└── i18n/             # 國際化設定
```

## 📜 腳本指令

- `npm run dev`: 啟動開發環境
- `npm run build`: 建置生產版本
- `npm run start`: 執行生產版本
- `npm run lint`: 執行 ESLint 檢查
- `npm run format`: 執行 Prettier 格式化
