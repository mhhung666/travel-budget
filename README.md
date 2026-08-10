# Travel Budget Planner — 旅行記帳

一個現代化、輕量級的**多人旅行記帳與分帳**應用程式，專為團隊出國旅行設計。協助大家輕鬆追蹤支出、自動計算誰該付誰多少、規劃行程，並支援多幣別即時匯率、收據附件、離線記帳與年度回顧。

> 文件導覽：架構見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、完整功能盤點見 [docs/FEATURES.md](docs/FEATURES.md)、待辦藍圖見 [docs/ROADMAP.md](docs/ROADMAP.md)、文件索引見 [docs/README.md](docs/README.md)。

## ✨ 核心功能 (Features)

- **多人協作分帳**：建立旅程、邀請成員，共同記錄消費；支援**虛擬成員**（未註冊也能參與分帳，事後可連結真人帳號）。
- **彈性分帳**：每筆支出支援**均分 / 指定金額 / 百分比 / 份數**四種分攤方式。
- **結算閉環**：一鍵生成**最小化轉帳次數**的結算方案，並可**標記「已付清」**、登記實際還款，算出淨額。
- **個人預算管理**：每位成員可為旅程與各分類設定自己的預算，依個人分攤金額呈現進度與超支警示。
- **多幣別 + 即時匯率**：記錄當地貨幣，自動換算為基準貨幣（TWD）。
- **收據 / 票券附件**：支出收據與行程票券上傳（Cloudflare R2，私有儲存、成員限定檢視）。
- **行程規劃**：逐日行程 + 活動時間軸（時段、訂房 / 機票確認碼），支出可關聯到「第幾天」。
- **AI 行程匯入（受限試用）**：旅程 admin 可將外部文字依目前介面語言解析成四語可編輯預覽（保留地名與專有名詞），確認後逐日安全匯入；具持久化每日配額、成本預留、冪等重試與去識別量測。
- **打包清單 / 待辦**：可指派成員、進度條。
- **統計圖表**：個人（跨旅程）與全團（單一旅程）統計、付款排行、按日花費、趨勢直方圖（Recharts）。
- **旅遊地圖**：航線 / 熱點 / 國家三種模式，支援公開分享（去識別化）。
- **通知**：站內鈴鐺 + Email（Resend）+ 排程提醒（Vercel Cron）+ **瀏覽器推播（Web Push）**。
- **動態牆**：per-trip 共享活動時間軸（誰改了什麼）。
- **離線優先 PWA**：可安裝、離線檢視、**離線記帳**（連線後自動同步）。
- **年度旅行回顧**：年底「Travel Wrapped」漸層圖卡，可匯出 PNG / 分享。
- **現代化 UI/UX**：Shadcn UI + Tailwind、深色模式、響應式、四語系（en / zh / zh-CN / jp）。

## 🛠 技術架構 (Tech Stack)

| 層級 | 技術 |
| --- | --- |
| 框架 | [Next.js 16](https://nextjs.org/)（App Router）+ [React 19](https://react.dev/) |
| 語言 | [TypeScript](https://www.typescriptlang.org/)（`strict`） |
| 資料庫 | [MongoDB](https://www.mongodb.com/) + [Mongoose](https://mongoosejs.com/) ODM |
| 後端 | **Server Actions**（主要）+ 少量 REST（公開分享 / 匯率 / 排程） |
| 認證 | 自製 JWT（[`jose`](https://github.com/panva/jose)）+ httpOnly cookie；密碼 `bcryptjs` |
| 驗證 | [Zod](https://zod.dev/) |
| UI | [Shadcn UI](https://ui.shadcn.com/)（Radix）+ [Tailwind CSS](https://tailwindcss.com/) + [Lucide](https://lucide.dev/) 圖示 |
| 資料查詢 | [TanStack React Query](https://tanstack.com/query)（+ IndexedDB 離線持久化） |
| 圖表 / 地圖 | [Recharts](https://recharts.org/) / [Leaflet](https://leafletjs.com/) |
| 國際化 | [next-intl](https://next-intl.dev/)（en / zh / zh-CN / jp） |
| 檔案儲存 | [Cloudflare R2](https://developers.cloudflare.com/r2/)（S3 相容） |
| 通知 | [Resend](https://resend.com/)（Email）+ [web-push](https://github.com/web-push-libs/web-push)（VAPID）+ Vercel Cron |
| PWA / 離線 | [Serwist](https://serwist.pages.dev/)（service worker） |
| 測試 | [Vitest](https://vitest.dev/) + Testing Library + jsdom |
| 部署 | [Vercel](https://vercel.com/) |

> 架構細節（為何用 Server Actions 而非 REST、內嵌文件如何消除 N+1、各子系統如何運作）見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 📂 專案結構 (Project Structure)

```
src/
├── actions/          # Server Actions（業務邏輯層，回傳 ActionResult<T>）⭐
├── app/
│   ├── (app)/        # 登入後頁面（route group，不改 URL）
│   ├── (auth)/       # 登入與註冊
│   ├── (public)/     # 公開加入/連結流程
│   ├── (share)/      # 公開分享頁
│   └── api/          # 公開分享 API + 匯率代理 + cron（排程）
├── components/       # React 元件（依功能分組：trips / stats / map / wrapped / ui...）
├── hooks/            # Custom hooks（+ queries/：React Query 查詢 / 失效層）
├── i18n/             # 國際化設定與四語系訊息檔
├── lib/              # 核心邏輯（auth / permissions / settlement / storage / notify...）
├── models/           # Mongoose models（11 個 collection）
├── sw.ts             # Serwist service worker（離線快取 + Web Push）
├── constants/        # categories / countries / currencies / routes
└── types/            # TypeScript 型別與 DTO
migrations/           # migrate-mongo 資料遷移腳本
docs/                 # 專案文件（見 docs/README.md）
```

## 🚀 快速開始 (Getting Started)

### 1. 前置需求
- Node.js 20+ 與 [pnpm](https://pnpm.io/)（`packageManager: pnpm@11`）
- 一個 MongoDB 資料庫（[MongoDB Atlas](https://www.mongodb.com/atlas) 免費 tier 即可）

### 2. 安裝依賴
```bash
git clone <repository-url>
cd travel-budget
pnpm install
```

### 3. 設定環境變數
複製 `.env.example` 為 `.env`，至少填入 **`JWT_SECRET`** 與 **`MONGODB_URI`**：
```bash
cp .env.example .env
```

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `JWT_SECRET` | ✅ | session JWT 簽章密鑰（至少 32 字元，無 fallback）。產生：`openssl rand -base64 48` |
| `MONGODB_URI` | ✅ | MongoDB 連線字串（**不帶** `NEXT_PUBLIC_`，不暴露給前端） |
| `R2_*`（6 個） | ⬜ | Cloudflare R2：收據 / 票券 / 頭像。未設定則上傳功能停用，其餘正常 |
| `RESEND_API_KEY` / `RESEND_FROM` / `APP_URL` | ⬜ | Email 通知。未設定則不寄信，站內通知不受影響 |
| `CRON_SECRET` | ⬜ | 保護 `/api/cron/*` 排程路由。未設定則 cron route 一律拒絕 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | ⬜ | Web Push。未設定則推播停用 |
| `AI_PROVIDER` / `AI_MODEL` / provider key | ⬜ | AI 行程匯入、收據與文字記帳；支援 Vercel AI Gateway 或 OpenAI 直連。未設定時只停用 AI 解析 |
| `AI_RECEIPT_MODEL` / `AI_EXPENSE_TEXT_MODEL` | ⬜ | 個別覆寫收據／文字記帳模型；收據模型必須支援圖片輸入 |
| `AI_DAILY_*` / `AI_*_MICRO_USD*` | ⬜ | 所有 AI 草稿共用的 MongoDB 持久化每日 request／成本上限；預設適合低流量試用，舊 `AI_IMPORT_*` 名稱仍相容 |

> 所有選用的外部服務皆 **env-gated**：未設定也能正常啟動與 CI build，只有對應功能停用。各變數的詳細說明見 [.env.example](.env.example)。

### 4. 啟動開發伺服器
```bash
pnpm dev
```
開啟 `http://localhost:3000`。資料庫索引會在首次連線時自動建立（`autoIndex`），無需手動初始化 schema。

> **PWA / 離線功能**在 dev 停用（Serwist 用 webpack、dev 走 Turbopack）。要測試離線 / 推播，請用 `pnpm build && pnpm start`。

## 📜 腳本指令 (Scripts)

| 指令 | 說明 |
| --- | --- |
| `pnpm dev` | 開發伺服器（Turbopack） |
| `pnpm build` | 生產建置（`next build --webpack`——Serwist 需要 webpack，勿改回 Turbopack） |
| `pnpm start` | 執行生產版本 |
| `pnpm lint` / `pnpm lint:fix` | ESLint 檢查 / 自動修正 |
| `pnpm format` / `pnpm format:check` | Prettier 格式化 / 檢查 |
| `pnpm test` / `pnpm test:run` | Vitest（watch / 單次） |
| `pnpm test:coverage` | 測試覆蓋率報告 |
| `pnpm test:ai-import-eval` | 明確啟用 live AI fixture 評估（會使用額度；可由 `AI_IMPORT_EVAL_CASE_LIMIT` 限制樣本） |
| `pnpm test:ai-expense-text-eval` | 明確啟用自然語言記帳 live 評估（會使用額度；可限制案例數與間隔） |
| `pnpm test:ai-receipt-eval` | 明確啟用收據圖片 live 評估（會使用圖片模型額度；可由 `AI_RECEIPT_EVAL_CASE_LIMIT` 限制樣本） |
| `pnpm migrate:status` / `:up` / `:down` / `:create` | migrate-mongo 資料遷移（見 [docs/MIGRATIONS.md](docs/MIGRATIONS.md)） |

## 🤝 貢獻 (Contributing)

歡迎提交 Pull Request 或 Issue。動工前請先讀 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；新使用者字串記得**四語系都要補**。CI 會在 PR 跑 lint / format / test / build。

## 📄 授權 (License)

ISC License
</content>
