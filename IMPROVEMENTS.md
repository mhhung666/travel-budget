# 專案改善建議 (Improvements)

經過對專案結構與程式碼的分析，以下是建議的優化與重構方向：

## 1. 架構與資料庫一致性 (Architecture & Consistency)

- **⚠️ 移除混用的 database.db (SQLite)**
  - **現狀**: 專案中同時存在 local SQLite (`src/lib/db.ts`, `better-sqlite3`) 與 Supabase (`src/lib/supabase.ts`) 的設定。
  - **問題**: API Routes (`src/app/api/trips/route.ts`) 實際上使用的是 `supabase` client，這使得 `db.ts` 和 `database.db` 成為冗餘甚至混淆的程式碼。
  - **建議**: 完全移除 `better-sqlite3` 依賴與 `src/lib/db.ts`，統一使用 Supabase 為單一資料來源。

- **API 層級架構優化**
  - **現狀**: 前端 -> Service (`src/services/*.ts`) -> Internal API Route (`/api/*`) -> Supabase。
  - **建議**: 考慮使用 **Next.js Server Actions**。
    - App Router 支援直接在 Server Components 或 actions 中呼叫 Supabase，減少一層 Internal API 的 HTTP 請求開銷。
    - 提升型別安全性 (End-to-end type safety)。

## 2. 程式碼品質與型別安全 (Code Quality & Type Safety)

- **移除 explicit `any`**
  - **現狀**: 部分檔案 (如 `layout.tsx`) 使用了 `as any` 進行型別強制轉型。
  - **建議**: 完善 TypeScript 定義，例如為 `locale` 參數定義明確的 Enum 或 Union Type。

- **加強 Supabase 型別整合**
  - **現狀**: Supabase 查詢回傳的資料型別多為手動定義 (`Trip`, `TripWithMembers`)。
  - **建議**: 使用 Supabase CLI 自動生成 TypeScript 型別定義 (`Database` interface)，確保資料庫 Schema 與前端型別同步。

## 3. 樣式與 UI (Styling & UI)

- **整合樣式系統**
  - **現狀**: 使用 Material UI (MUI) v7，但同時存在 `globals.css` 定義大量 CSS 變數。
  - **建議**: 雖然 `globals.css` 中的變數可能用於非 MUI 元件，但建議盡量將這些樣式移入 MUI 的 `theme.ts` 中管理，保持 Styling source of truth 的單一性。

- **統一 Icon 系統**
  - **現狀**: 專案使用了 `lucide-react`，這很好。
  - **建議**: 確保所有新功能開發都持續使用 `lucide-react`，避免混入 MUI Icons (`@mui/icons-material`)，以減少 bundle size。

## 4. 目錄結構 (Directory Structure)

- **Components 重構 (Refactoring)**
  - **現狀**: 許多頁面邏輯直接寫在 `page.tsx` 中。
  - **建議**:
    - 持續將頁面拆解為更小的元件放入 `src/components` (如之前的對話中已開始進行)。
    - 採用功能導向分組 (Feature-based grouping)，例如 `src/components/trips/`, `src/components/expenses/`。

## 5. 安全性 (Security)

- **Supabase Row Level Security (RLS)**
  - **現狀**: 目前後端 API 透過程式碼邏輯檢查權限 (`session.userId`)。
  - **建議**: 啟用 Supabase RLS (Row Level Security) 政策，從資料庫層級確保使用者只能存取自己的旅行與支出資料，增加安全性縱深。
