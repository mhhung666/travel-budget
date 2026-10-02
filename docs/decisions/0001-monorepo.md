# ADR 0001：以 travel-budget 管理 Web、Mobile 與共用契約

日期：2026-10-02。狀態：採用。取代 [Mobile 原獨立專案決策](../../apps/mobile/docs/decisions/0001-project-boundaries.md)。

## 決策與邊界

以管理便利為優先，保留既有 `travel-budget` Git repository。Next.js Web 與唯一業務後端搬到 `apps/web`；Expo 用戶端搬到 `apps/mobile`；純 TypeScript／Zod HTTP 契約抽到 `packages/contracts`。使用 pnpm workspace、一份根 lockfile 與同一套 CI，相關更動可在同一個提交／PR 檢視。

兩個應用各自維護產品版本與發布。根 manifest 是私有協調工具，沒有產品版本。不新增 API server、資料庫或另一套分帳邏輯；Mobile 只透過 HTTP 呼叫後端，不能 import Web source、Server Actions、Mongoose 或外部服務 SDK。共用套件不含 React、平台 storage、環境密鑰或後端副作用。

先共用 API DTO 和 schema，其他 domain／UI／翻譯尚未抽成套件。保留各應用平台相容的 React／工具鏈，使用 Expo 預設 monorepo 支援，不引入 Nx／Turbo。

## 搬移來源與歷史

Web 原始基點是 `a3d812b`，Mobile 原始基點是 `9d40361`。搬入 Mobile 的內容取自其完整 Git tracked tree，排除 `.git`、舊 CI、應用內 lockfile 和 workspace 設定；授權與資源一併保留。

原 Web Git 歷史留在本 repository，檔案路徑改由 Git 的 rename detection 辨識。原 Mobile Git 歷史保留在棄用目錄 `/Users/mhhung/Development/travel-budget-mobile`，未重寫歷史或自動建立合併 commit。舊目錄只供歷史查閱／回復，後續修改與提交一律在 `travel-budget`。

## 開發與部署影響

根目錄統一安裝及協調指令；各應用 script 仍以 app root 為工作目錄。環境檔、資源、migrations、測試與配置跟著應用搬移，避免工作目錄改變讀到錯誤資料。

Vercel 的專案根目錄需改為 `apps/web`，並允許建置讀取根目錄外檔案。這是下一次部署前的遠端設定步驟，整併不自動變更遠端服務、執行資料庫遷移或發布。原生裝置驗收仍依 [Mobile 開發規範](../../apps/mobile/docs/DEVELOPMENT.md) 完成。
