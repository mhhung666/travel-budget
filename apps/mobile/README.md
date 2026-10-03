# Travel Budget Mobile

旅行記帳的 iOS／Android 用戶端，使用 Expo、React Native、Expo Router 與 TypeScript。位於 `travel-budget` repository 的 `apps/mobile`，與 `apps/web` 共用同一套業務後端及 `@travel-budget/contracts` API 契約。

**已實作唯讀流程**：既有帳號登入、旅行列表與摘要、支出清單／明細與結算，搭配四語系、深淺色與安全憑證儲存。需同時啟動 `apps/web` 後端；尚未部署或完成真機驗收。

## 開始開發

使用 Node.js 24 與 repository 根目錄 `package.json.packageManager` 指定的 pnpm。所有 workspace 共用根目錄的 lockfile。

```bash
cd travel-budget
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm dev:mobile
```

終端機按 `i` 開啟 iOS Simulator，按 `a` 開啟 Android Emulator；分別需先安裝 Xcode 或 Android Studio 並設定模擬器。可用相容的 Expo Go 做初步預覽。加入原生能力時，改用 development build，步驟見 [開發規範](docs/DEVELOPMENT.md)。

```bash
pnpm mobile:ios     # 啟動開發伺服器並開啟 iOS
pnpm mobile:android # 啟動開發伺服器並開啟 Android
pnpm mobile:web     # 瀏覽器預覽
pnpm --filter travel-budget-mobile check
pnpm --filter travel-budget-mobile test
pnpm --filter travel-budget-mobile export:check
pnpm contracts:check
```

在 `apps/mobile/.env.local` 設定 `EXPO_PUBLIC_API_BASE_URL`。iOS 模擬器可用 `http://localhost:3000/api/v1`；Android 模擬器用 `http://10.0.2.2:3000/api/v1`；真機使用電腦區域網路 IP。正式 bundle 要求 HTTPS。修改位址後重新啟動 Expo。未設定時仍可開啟登入頁，但無法登入。

在另一個終端機從 repository 根目錄執行 `pnpm dev` 或 `pnpm dev:web`，後端使用 `apps/web` 的 MongoDB 與 JWT 環境設定；請使用測試帳號。Web 預覽明確停用登入，完整流程須在 iOS／Android 執行。驗收步驟見 [開發規範](docs/DEVELOPMENT.md)。

也可進入 `apps/mobile` 使用原有的 `pnpm dev`、`ios`、`android`、`web`、`check`、`test` 與 `export:check` 指令；依賴安裝仍從 repository 根目錄執行。

## 專案入口

- [文件索引](docs/README.md)：架構、後端分工、開發規範與路線。
- [AGENTS.md](AGENTS.md)：繼承既有專案的版本／commit 規則，補充手機開發邊界。
- [src/app](src/app)：Expo Router 路由。
- [src/features](src/features)：功能畫面與邏輯。
- [app.config.ts](app.config.ts)：App 設定，版本讀取 `package.json`。

目前採單一 repository、兩個獨立發布的應用，見 [整併決策](../../docs/decisions/0001-monorepo.md)。手機產品版本以本目錄 `package.json.version` 為唯一來源，根目錄 package 只協調 workspace。原始 [獨立專案決策](docs/decisions/0001-project-boundaries.md) 已被取代。

此骨架依 Expo 官方 default template 的穩定套件組合建立，保留模板授權於 [LICENSE](LICENSE)。圖示仍為模板素材，上架前須替換；產品其餘程式的正式授權由專案擁有者決定。
