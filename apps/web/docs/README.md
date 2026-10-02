# 核心文件

這裡維護 `apps/web` 的 Web 與後端文件。跨應用架構、workspace 指令及手機入口見 [repository 文件入口](../../../docs/README.md)。

| 文件                                                     | 用途                                         |
| -------------------------------------------------------- | -------------------------------------------- |
| [變更紀錄](../../../changelog.md)                        | 全專案的簡短變更摘要                         |
| [現有功能](FEATURES.md)                                  | 使用者能做什麼、主要操作流程與使用限制       |
| [AI 維護與測試](AI.md)                                   | 三種 AI 功能的現況、設定、測試方式與評測入口 |
| [架構摘要](ARCHITECTURE.md)                              | 核心資料流、程式入口與維護原則               |
| [手機 API](MOBILE_API.md)                                | 原生 `/api/v1` 的認證、資料邊界與驗證        |
| [共用 OpenAPI](../../../packages/contracts/openapi.json) | Web／手機共用的 API 契約產物                 |
| [專案 README](../README.md)                              | 安裝、環境設定與開發指令                     |

歷史測試結果、驗收紀錄、詳細設計與待辦已集中到 [archive](archive/README.md)，需要追溯時再查閱。封存不代表待辦完成，也不代表所有功能已通過正式環境驗收；目前不以封存清單安排下一步工作。

## 專題操作

- [行程日期](plans/ITINERARY_DATE_SELECTION.md)、[PDF 匯出](plans/ITINERARY_PDF_EXPORT.md)：已交付範圍與剩餘驗收。
- [相簿上傳](plans/PHOTO_UPLOAD_RESEARCH.md)：交付摘要、盤點工具及歷史清理紀錄。

## 維護方式

- 現有功能變更時，更新 `FEATURES.md`；核心資料流改變時，更新 `ARCHITECTURE.md`。
- 每次開發更新根目錄 `changelog.md`；已完成計畫只保留成果、驗證與限制，不再新增逐輪歷史報告。
- 主文件只保留現況，不累積測試流水帳、階段進度或候選功能。
- `archive/` 保留既有摘要、必要維運操作與證據；詳細修改過程查 Git，不再累積流水帳。
- 程式碼與文件不一致時，以實作為準；Web 版本只讀取 `apps/web/package.json.version`，手機獨立版本。
- 本地 Web 文件中的開發與測試指令在 `apps/web` 執行；依賴安裝在 repository 根目錄進行，使用共用 lockfile。契約產生與同步檢查在根目錄執行 `pnpm contracts:generate`／`pnpm contracts:check`。
