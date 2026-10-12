# 文件索引

先閱讀架構與開發規範；開始第一個功能前，再閱讀後端契約。

| 文件                                                   | 用途                                   |
| ------------------------------------------------------ | -------------------------------------- |
| [變更紀錄](../../../changelog.md)                      | 全專案的簡短變更摘要                   |
| [現有功能](FEATURES.md)                                | 已實作範圍與目前限制                   |
| [架構](ARCHITECTURE.md)                                | 目錄、依賴方向、資料流及平台邊界       |
| [開發規範](DEVELOPMENT.md)                             | 環境、指令、既有規則、測試與發布       |
| [後端契約](BACKEND_CONTRACT.md)                        | 單一後端、現行 v2 API、認證與離線契約  |
| [本機驗收](LOCAL_ACCEPTANCE.md)                        | 隔離後端、測試帳號、模擬器與真機操作表 |
| [開發路線](ROADMAP.md)                                 | 僅未完成、暫緩與尚未排入工作           |
| [共同設計：我的旅行](../../../docs/design/MY_TRIPS.md) | Web／Mobile 列表設計、實作與待驗證項目 |
| [已完成項目](archive/README.md)                        | 已完成實作、舊設計／決策及證據入口     |
| [整併決策](../../../docs/decisions/0001-monorepo.md)   | 單一 repository、workspace 與發布邊界  |
| [Agent 規則](../AGENTS.md)                             | 自動化開發工具應遵守的規則             |

現況以程式碼為準，App 版本只讀取 `apps/mobile/package.json.version`。功能變更更新 FEATURES，資料流變更更新 ARCHITECTURE，未完成工作保留在 ROADMAP，已完成摘要合併到 archive；每次開發另更新根目錄 `changelog.md`，同一工作只記 1–3 個要點，不堆測試流水帳。

Web 與後端位於 [apps/web](../../web)，共用 schema 位於 [packages/contracts](../../../packages/contracts)。先遵循 [repository 規則](../../../AGENTS.md)；Web 的架構與功能文件留在該 workspace。手機透過 HTTP 使用後端，只引用共用契約套件。

已完成的 T／M／U／G／B 計畫已合併 archive；不把原型或 bundle 匯出當成裝置通過。LOCAL_ACCEPTANCE 保留未驗清單與可重跑命令，歷史數據只查 [驗證摘要](archive/ACCEPTANCE.md)。
