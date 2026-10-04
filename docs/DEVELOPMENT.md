# Workspace 開發規範

## 環境與指令

Node.js 使用根目錄 `.node-version`，pnpm 使用根 `package.json.packageManager`。從根目錄執行 `pnpm install`；CI 用 `pnpm install --frozen-lockfile`。只提交根目錄的 workspace 設定與 lockfile，不在應用內建立第二份 lockfile。

Web 與 Mobile 各自保留 React、TypeScript、Vitest 和平台相容的依賴；根目錄不安裝 React 或原生模組。共用契約使用同一版 Zod，workspace 相依以 `workspace:*` 宣告。React runtime 保持各自版本；根 workspace 固定同一個相容的 `@types/react` patch，避免 ambient 型別分裂。`packageExtensions` 補齊 jest-dom 的 Vitest peer 與 React Leaflet 宣告檔缺少的型別相依，不透過全域 hoisting 混用工具鏈。

```bash
pnpm dev:web
pnpm dev:mobile
pnpm check
pnpm test:run
pnpm build
pnpm export:check
```

各應用的 package scripts 在自身目錄執行，維持既有 dotenv、migrations、測試與資源的相對路徑。從根目錄呼叫 app script 請用 filter，例如 `pnpm --filter @travel-budget/web photos:audit`。新增原生依賴用 `pnpm --filter travel-budget-mobile exec expo install <package>`；Expo 會使用目前 workspace，保留預設 Metro monorepo 支援。

環境檔分別在 `apps/web` 和 `apps/mobile`。Web 的資料庫、JWT、AI／R2 設定不得放入 `EXPO_PUBLIC_*` 或共用套件。所有本機環境檔、Native 簽章、產物與私人 photo audit 報告由 gitignore 排除。

`pnpm-workspace.yaml` 的 `supportedArchitectures` 明確包含 macOS 與 Linux、arm64 與 x64、glibc 與 musl，保留建置需要的各平台原生套件。不要跨平台複製 `node_modules`，或在 CI／Vercel 使用 `--no-optional`。若 lockfile 缺少 SWC、Parcel watcher、Rollup 等原生相依，用 `pnpm install --lockfile-only --fix-lockfile --no-frozen-lockfile --no-prefer-frozen-lockfile` 重新解析後，檢查版本差異並提交完整 lockfile；部署仍使用 frozen install。

## 契約與驗證

`packages/contracts/src/index.ts` 是手機 API 的 schema 唯一來源，兩個應用透過 `@travel-budget/contracts` 引用。修改後執行 `pnpm contracts:generate` 更新 `packages/contracts/openapi.json`；`pnpm contracts:check` 驗證產物未過期。禁止複製另一份 schema 或 OpenAPI 到應用內。

CI 保留 Web 的型別、lint、格式、完整測試、正式建置、真 MongoDB 金額／相簿整合測試與 replica set 的支出建立交易測試，以及 Mobile 的型別、lint、格式、行為測試、Expo 相容性和三平台匯出。CI 的資料庫是獨立測試服務；一般本機檢查不執行遠端 migration。

App 和後端獨立發布，既有已安裝 App 不會跟 repository 更新同步。契約更動保持 `/api/v1` 向下相容；先部署相容後端，再發布需要該能力的 App。Native bundle 匯出不能取代 iOS／Android 模擬器與真機驗收。

## 版本與部署

每個應用自己的 `package.json.version` 是唯一產品版本來源。根 workspace 不發布、不設產品版本；保持行為的整併不升產品版本。使用者要求 commit 時，依 [AGENTS.md](../AGENTS.md) 對實際改變行為的應用評估版本。

Vercel 的 Root Directory 改為 `apps/web`，啟用 Include files outside of the Root Directory in the Build Step，使用該目錄的 `vercel.json`（既有 cron 保留）。Install Command 是 `pnpm install --frozen-lockfile`，Build Command 是 `pnpm build`；Vercel 從 Web 目錄辨識 Next.js，pnpm 從 workspace 根使用共用 lockfile。Next.js tracing root 設在 repository 根，使 server bundle 包含共用契約。 Node.js 使用 `24.x`；Production／Preview 環境需設定 `ENABLE_EXPERIMENTAL_COREPACK=1`，讓 Vercel 使用 `packageManager` 指定的 pnpm。

Expo／EAS 的 app root 是 `apps/mobile`；現階段尚無正式 App ID、簽章或 EAS project。部署、商店提交、推送及遠端設定仍須另有使用者指示。
