# 跨應用文件

`travel-budget` 是 Web、Mobile 和 API 契約的唯一開發 repository。

| 文件                                         | 用途                                 |
| -------------------------------------------- | ------------------------------------ |
| [開發規範](DEVELOPMENT.md)                   | Workspace 指令、環境、版本與部署路徑 |
| [Monorepo 決策](decisions/0001-monorepo.md)  | 邊界、整併來源與舊專案棄用方式       |
| [Web／後端文件](../apps/web/docs/README.md)  | Web 現有功能、架構、AI 與歷史資料    |
| [Mobile 文件](../apps/mobile/docs/README.md) | 手機現有功能、架構、驗收與路線       |
| [共用契約](../packages/contracts/README.md)  | Schema、OpenAPI 與相容性             |
| [Agent 規則](../AGENTS.md)                   | Repository-wide 開發與提交規範       |

跨應用規範放在這裡，應用專屬文件留在各自的 `docs`。已實作功能和未完成工作仍依各應用的 FEATURES／ROADMAP 維護。
