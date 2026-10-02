# 手機 App 架構

採 Expo + React Native + Expo Router + TypeScript strict，位於 `travel-budget/apps/mobile`。同一 repository 的 `apps/web` 維護 Web、API 與業務服務；`packages/contracts` 提供共用 HTTP DTO 與 runtime schema。

## 一套後端，兩種前端

登入憑證檢查、旅行列表與摘要讀取已接入此分工；支出等寫入 service 仍待後續抽取。

```mermaid
flowchart LR
  WEB[Next.js Web] --> ACTION[Server Actions adapter]
  APP[Expo iOS / Android] --> API[Next.js HTTP API adapter]
  ACTION --> SERVICE[同一套業務服務]
  API --> SERVICE
  SERVICE --> DB[(同一個 MongoDB)]
  SERVICE --> EXT[R2 / AI / 通知]
```

Server Actions 與 HTTP API 是兩個呼叫入口，部署初期同在現有 Next.js。權限、分帳、交易、冪等與檔案驗證只維護一套服務。此專案不建立 API server、MongoDB connection 或 migrations。

## 目錄與依賴

```text
src/
  app/                 Expo Router 路由；只組裝畫面與導航
  features/
    auth/              登入、恢復登入與安全路由
    trips/             旅行列表、摘要與查詢 hooks
  providers/           Query、SafeArea、Auth 及網路／前景同步
  api/                 HTTP client、runtime DTO 驗證、session manager
  storage/             環境隔離的 SecureStore refresh token adapter
  components/          共用按鈕、頁面、提示與指標
  i18n/                四語訊息與裝置語系 adapter
  theme/               語意色彩與間距 tokens
docs/                  現況、規範、契約與規劃
  decisions/           架構決策紀錄
assets/                目前保留 Expo 模板圖示
```

後續依需求建立 `features/expenses`、`settlement`，每個 feature 內再放 screens、hooks、components、schemas，不先建大量空資料夾。

依賴方向：`app → features → api / storage / i18n / theme`。API 與 storage 不得反向 import 畫面或路由；route 不直接呼叫 fetch，也不計算業務交易。跨 feature 使用明確的公開 export，避免引用彼此內部元件。

`api` 負責 transport、headers、timeout、錯誤映射；feature hooks 負責 query key 與快取失效。表單狀態留在畫面，遠端狀態交給 Query；沒有跨頁需求時不增加全域狀態框架。

## 資料能力與後續工作

| 類型         | 目標責任                                              | 實作時機           |
| ------------ | ----------------------------------------------------- | ------------------ |
| 遠端快取     | TanStack Query；key 包含帳號、環境與資源範圍          | 已實作（僅記憶體） |
| 登入憑證     | access token 記憶體；refresh token SecureStore        | 已實作             |
| 待送支出     | SQLite outbox，獨立於可清除的快取                     | 線上新增支出穩定後 |
| 原生生命週期 | AppState／網路 adapter 接 Query focus／online manager | 已實作             |
| 檔案         | App 私有目錄、穩定 upload ID、begin／finish 協議      | 相簿與附件階段     |
| 通知         | 原生裝置 token 與後端裝置註冊                         | 核心流程穩定後     |

Query 預設不重試；HTTP 在 401 時由 session manager 合併 refresh、最多重送一次。429 尊重 Retry-After；其餘錯誤由使用者明確重試。登入／登出先取消並清除私人查詢，key 包含 API 環境與帳號。Token 不進 Query cache；refresh 持久化完成後才公開登入狀態。尚無業務寫入或離線持久化。

## 共用與平台界線

手機與後端以 `workspace:*` 引用 `@travel-budget/contracts`，schema 單一來源為 `packages/contracts/src/index.ts`，OpenAPI 為 `packages/contracts/openapi.json`。`src/api/contracts.ts` 是薄 adapter，重新匯出共用 DTO 並保留憑證非空的用戶端驗證，不另維護 DTO 定義。從 repository 根目錄執行 `pnpm contracts:generate` 更新產物，`pnpm contracts:check` 檢查同步。

共用契約只依賴純 TypeScript／Zod，不含 Node.js、React、Next.js、MongoDB 或 server SDK。Mobile 不引用 `apps/web` 原始碼。純金額／分攤規則、幣別與翻譯內容仍是後續共用候選，須先隔離平台依賴；目前使用後端既有計算結果。

React Native 畫面不能直接沿用 Radix、DOM、Leaflet 或 Next provider。照片選取、推播、SecureStore 與 SQLite 採平台 adapter；公開分享頁與 Web PWA 繼續留在網站。Web 預覽只是開發便利入口。

pnpm workspace 統一安裝與 lockfile；App 各自保留 React／Expo 相容組合、產品版本與發布流程。根目錄 package 是 private coordinator，沒有產品版本。整併與邊界見 [repository 決策](../../../docs/decisions/0001-monorepo.md)。Expo 自動偵測 workspace 並設定 Metro，無須額外的 monorepo resolver 設定。

官方依據：[Expo Router 安裝與入口](https://docs.expo.dev/router/installation/)、[Expo monorepo 支援](https://docs.expo.dev/guides/monorepos/)、[TanStack Query React Native 整合](https://tanstack.com/query/latest/docs/framework/react/react-native)。
