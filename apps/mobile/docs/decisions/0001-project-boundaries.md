# ADR 0001：先建立獨立手機專案，共用既有後端

日期：2026-10-02。狀態：已被 [repository 整併決策](../../../../docs/decisions/0001-monorepo.md) 取代。

## 原始決策

初始化時依使用者要求，在既有 `travel-budget` 旁建立 `travel-budget-mobile`，讓手機獨立安裝、開發與執行 CI。手機透過版本化 HTTP API 使用既有後端；不複製 MongoDB models、migrations 或 Server Actions。當時 API schema 由後端維護，手機以 OpenAPI snapshot 檢查契約。

## 取代原因與目前狀態

完成登入與旅行摘要切片後，同一產品已需要同時修改 Web、Mobile 與 API 契約。使用者選擇優先簡化管理，將兩個應用整併到 `travel-budget` repository：

```text
apps/web
apps/mobile
packages/contracts
```

`travel-budget-mobile` 不再作為開發來源。pnpm workspace 統一依賴安裝、lockfile 與 CI；`@travel-budget/contracts` 共用 schema，OpenAPI 只保留一份權威產物。

Web 與 Mobile 仍各自發布，以各 App 的 `package.json.version` 為唯一產品版本來源。根目錄 private package 不代表產品版本。手機只引用共用契約並透過 HTTP 使用後端；授權、寫入、models、migrations 與業務服務由 `apps/web` 單一維護。

後端先部署相容變更，再發布新版手機，仍須讓舊版 App 運作。API 是否另行部署取決於後續需求，不因 repository 整併而改變。
