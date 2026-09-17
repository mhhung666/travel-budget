# Travel Budget Planner — 旅行記帳

一個現代化、輕量級的**多人旅行記帳與分帳**應用程式，專為團隊出國旅行設計。協助大家輕鬆追蹤支出、自動計算誰該付誰多少、規劃行程，並支援多幣別每日參考匯率、收據附件、離線記帳與年度回顧。

> 從 [核心文件](docs/README.md) 開始；完整的 [現有功能](docs/FEATURES.md) 與 [架構摘要](docs/ARCHITECTURE.md) 分開維護。

## 核心功能

- 多人旅程、真人／虛擬成員、多幣別支出、四種分攤方式、個人預算與還款結算。
- 每日行程、票券、共享相簿、清單、筆記與活動紀錄。
- AI 行程匯入、自然語言記帳與收據草稿（受限試用，確認後才寫入）。
- 個人／群組統計、旅行地圖、年度回顧、旅行成就。
- 站內／Email／Web Push 通知、PWA 與離線新增支出、四語系與深色模式。

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

> 核心資料流與維護原則見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

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
├── models/           # Mongoose 資料模型
├── sw.ts             # Serwist service worker（離線快取 + Web Push）
├── constants/        # categories / countries / currencies / routes
└── types/            # TypeScript 型別與 DTO
migrations/           # migrate-mongo 資料遷移腳本
docs/                 # 專案文件（見 docs/README.md）
```

## 🚀 快速開始 (Getting Started)

### 1. 前置需求
- Node.js 20+ 與 [pnpm](https://pnpm.io/)（`packageManager: pnpm@11`）
- 支援交易的 MongoDB replica set 或 sharded cluster（可使用 MongoDB Atlas）

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
| `AI_PROVIDER` / `AI_MODEL` / provider key | ⬜ | AI 行程匯入、收據與文字記帳；支援 Vercel AI Gateway 或 OpenAI 直連。三種功能共用 `AI_MODEL`，模型須支援圖片輸入。未設定時只停用 AI 解析 |
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
| `pnpm migrate:status` / `:up` / `:down` / `:create` | migrate-mongo 資料遷移（見 [docs/archive/details/MIGRATIONS.md](docs/archive/details/MIGRATIONS.md)） |

## 🤝 貢獻 (Contributing)

歡迎提交 Pull Request 或 Issue。動工前請先讀 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；新使用者字串記得**四語系都要補**。CI 會在 PR 跑 lint / format / test / build。

## 📄 授權 (License)

ISC License
