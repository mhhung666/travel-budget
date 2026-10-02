# 文件索引

先閱讀架構與開發規範；開始第一個功能前，再閱讀後端契約。

| 文件                                                     | 用途                                     |
| -------------------------------------------------------- | ---------------------------------------- |
| [變更紀錄](../../../changelog.md)                        | 全專案的簡短變更摘要                     |
| [現有功能](FEATURES.md)                                  | 已實作範圍與目前限制                     |
| [架構](ARCHITECTURE.md)                                  | 目錄、依賴方向、資料流及平台邊界         |
| [開發規範](DEVELOPMENT.md)                               | 環境、指令、既有規則、測試與發布         |
| [後端契約](BACKEND_CONTRACT.md)                          | 單一後端分工、待實作 API、認證與離線契約 |
| [本機驗收](LOCAL_ACCEPTANCE.md)                          | 隔離後端、測試帳號、模擬器與真機操作表   |
| [開發路線](ROADMAP.md)                                   | 下一階段工作與驗收條件                   |
| [整併決策](../../../docs/decisions/0001-monorepo.md)     | 單一 repository、workspace 與發布邊界    |
| [原始獨立專案決策](decisions/0001-project-boundaries.md) | 已被整併決策取代的初始化紀錄             |
| [Agent 規則](../AGENTS.md)                               | 自動化開發工具應遵守的規則               |

現況以程式碼為準，App 版本只讀取 `apps/mobile/package.json.version`。功能變更更新 FEATURES，資料流變更更新 ARCHITECTURE，未完成工作保留在 ROADMAP；每次開發另更新根目錄 `changelog.md`，同一工作只記 1–3 個要點，不堆測試流水帳。

Web 與後端位於 [apps/web](../../web)，共用 schema 位於 [packages/contracts](../../../packages/contracts)。先遵循 [repository 規則](../../../AGENTS.md)；Web 的架構與功能文件留在該 workspace。手機透過 HTTP 使用後端，只引用共用契約套件。
