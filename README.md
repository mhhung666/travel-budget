# Travel Budget

旅行記帳的單一 repository，包含 Next.js Web／後端與 Expo iOS／Android App。兩個應用共用一套後端和 API 契約，各自維護產品版本與發布流程。

```text
apps/web/           Next.js Web、HTTP API、MongoDB models、migrations、外部服務
apps/mobile/        Expo / React Native iOS、Android 用戶端
packages/contracts/ 純 TypeScript / Zod API schema 與 OpenAPI
docs/              跨應用開發規範與架構決策
```

## 開始開發

使用 `.node-version` 指定的 Node.js 24，以及根目錄 `package.json.packageManager` 指定的 pnpm。整個 repository 只在根目錄安裝依賴，並提交一份 `pnpm-lock.yaml`。

```bash
cd travel-budget
pnpm install
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm dev:web
```

另一個終端機執行 `pnpm dev:mobile`。Web 的 MongoDB／JWT 設定留在 `apps/web/.env`；手機僅設定公開 API 位址 `EXPO_PUBLIC_API_BASE_URL`，不放後端密鑰。iOS 模擬器可用 `http://localhost:3000/api/v1`，Android 模擬器用 `http://10.0.2.2:3000/api/v1`，真機使用電腦的 LAN IP；正式 bundle 要求 HTTPS。

| 根目錄指令                                          | 用途                                                |
| --------------------------------------------------- | --------------------------------------------------- |
| `pnpm dev` / `pnpm dev:web`                         | 啟動 Web／後端                                      |
| `pnpm dev:mobile`                                   | 啟動 Expo                                           |
| `pnpm mobile:ios` / `mobile:android` / `mobile:web` | 開啟手機平台或瀏覽器預覽                            |
| `pnpm check`                                        | 契約產物、所有 workspace 型別、兩個應用 lint 與格式 |
| `pnpm test:run`                                     | Web／後端與 Mobile 測試                             |
| `pnpm build` / `pnpm start`                         | Web 正式建置／啟動，保留 webpack／Serwist           |
| `pnpm export:check`                                 | Mobile iOS／Android／Web JS 與資源打包              |
| `pnpm contracts:generate` / `contracts:check`       | 產生／檢查共用 OpenAPI                              |

應用原有指令可在各自目錄執行，也可從根目錄使用 `pnpm --filter @travel-budget/web <script>` 或 `pnpm --filter travel-budget-mobile <script>`。資料庫遷移由 Web 擁有，例如 `pnpm --filter @travel-budget/web migrate:status`；整併不會自動執行 migration。

## 文件與發布

- [跨應用文件](docs/README.md)、[開發規範](docs/DEVELOPMENT.md)與[整併決策](docs/decisions/0001-monorepo.md)。
- [Web／後端文件](apps/web/docs/README.md)與[環境設定](apps/web/README.md)。
- [Mobile 文件](apps/mobile/docs/README.md)與[操作入口](apps/mobile/README.md)。
- [共用 API 契約](packages/contracts/README.md)。

Web 與 Mobile 的產品版本分別只讀取 `apps/web/package.json.version` 與 `apps/mobile/package.json.version`；根 manifest 是開發協調工具，沒有產品版本。Mobile 透過 HTTP 呼叫後端，只引用共用契約，不引用 Web／MongoDB 原始碼。

Vercel 專案的 **Root Directory 設為 `apps/web`**，並啟用 **Include files outside of the Root Directory in the Build Step**，讓建置可讀到 workspace 和共用契約。`apps/web/vercel.json` 保留既有 cron。遠端設定須在下一次部署前更新，整併本身不會修改 Vercel 或發布 App。

原同層 `travel-budget-mobile` 已棄用；後續開發、安裝、CI 與提交一律在本 repository。舊目錄僅保留歷史與回復用途。

變更要點見 [changelog.md](changelog.md)，文件入口見 [docs/README.md](docs/README.md)。
