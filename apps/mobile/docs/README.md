# 文件索引

查 App 目前可以做什麼，先讀功能說明；設計兩端都會用到的流程，先讀跨端產品設計。

| 文件                                                                     | 用途                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| [變更紀錄](../../../docs/changelog.md)                                   | 全專案的簡短變更摘要                                |
| [現有功能](FEATURES.md)                                                  | 已實作範圍與目前限制                                |
| [架構](ARCHITECTURE.md)                                                  | 目錄、依賴方向、資料流及平台邊界                    |
| [開發規範](DEVELOPMENT.md)                                               | 環境、指令、既有規則、測試與發布                    |
| [後端契約](BACKEND_CONTRACT.md)                                          | v2 在 App 的使用、認證、失敗處理與恢復              |
| [本機驗收](LOCAL_ACCEPTANCE.md)                                          | 隔離後端、測試帳號、模擬器與真機操作表              |
| [開發路線](ROADMAP.md)                                                   | 目前優先、接續與暫緩工作                            |
| [跨端產品設計](../../../docs/design/README.md)                           | Web／App 能力對照與現行介面規格，含行程同日多選     |
| [HTTP 傳輸](../src/api/README.md) · [裝置儲存](../src/storage/README.md) | 逾時、取消、登入世代與 SecureStore／SQLite 資料邊界 |
| [已完成項目](archive/README.md)                                          | 已完成實作、舊設計／決策及證據入口                  |
| [整併決策](../../../docs/decisions/0001-monorepo.md)                     | 單一 repository、workspace 與發布邊界               |
| [Agent 規則](../AGENTS.md)                                               | 自動化開發工具應遵守的規則                          |

現況以程式碼為準，App 版本只讀取 `apps/mobile/package.json.version`。功能變更更新 FEATURES，資料流變更更新 ARCHITECTURE，未完成工作保留在 ROADMAP，已完成摘要合併到 archive；每次開發另更新`docs/changelog.md`，同一工作只記 1–3 個要點，不堆測試流水帳。

Web 與後端位於 [apps/web](../../web)，共用 schema 位於 [packages/contracts](../../../packages/contracts)。先遵循 [repository 規則](../../../AGENTS.md)；Web 的架構與功能文件留在該 workspace。手機透過 HTTP 使用後端，只引用共用契約套件。

已完成的 T／M／U／G／B 計畫已合併 archive；不把原型或 bundle 匯出當成裝置通過。LOCAL_ACCEPTANCE 保留未驗清單與可重跑命令，歷史數據只查 [驗證摘要](archive/ACCEPTANCE.md)。
