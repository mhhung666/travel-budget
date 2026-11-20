# Travel Budget 文件入口

從 [Web 與 Mobile 產品設計規格](design/README.md) 查一項功能在兩端怎麼用、哪些規則共用、差異在哪裡。要安裝或啟動專案，從 [根 README](../README.md) 開始。

## 按工作找文件

| 想釐清的問題                       | 維護位置                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同一功能在 Web 與 App 應如何呈現？ | [跨端功能對照、介面規則與四份功能專規](design/README.md)                                                                                                                                                                                                                                        |
| 某端有哪些入口、權限與限制？       | [Web 功能](../apps/web/docs/FEATURES.md) · [Mobile 功能](../apps/mobile/docs/FEATURES.md)                                                                                                                                                                                                       |
| 前後端如何分工？                   | [單一後端決策](decisions/0001-monorepo.md) · [Web 與後端架構](../apps/web/docs/ARCHITECTURE.md) · [原生 App 架構](../apps/mobile/docs/ARCHITECTURE.md)                                                                                                                                          |
| App 可以送哪些請求、收到哪些欄位？ | [contracts 說明](../packages/contracts/README.md)、[schema 原始碼](../packages/contracts/src/index.ts)、[產生的 OpenAPI](../packages/contracts/openapi.json)。[後端實作](../apps/web/docs/MOBILE_API.md) 說明授權與交易；[App 串接](../apps/mobile/docs/BACKEND_CONTRACT.md) 說明失敗處理與恢復 |
| 如何開發、測試或建置？             | [Workspace 開發規範](DEVELOPMENT.md) · [Web 環境與指令](../apps/web/README.md) · [原生環境與建置](../apps/mobile/docs/DEVELOPMENT.md)                                                                                                                                                           |
| 如何操作個別子系統？               | [Web 文件索引](../apps/web/docs/README.md) 含 AI 與相簿維運；[Mobile 文件索引](../apps/mobile/docs/README.md) 含 HTTP 與裝置儲存                                                                                                                                                                |
| 哪些已驗、哪些還要做？             | [路線與優先順序](../apps/mobile/docs/ROADMAP.md) · [跨端專規驗收入口](design/README.md#功能專規與驗收) · [本機驗收與重跑步驟](../apps/mobile/docs/LOCAL_ACCEPTANCE.md) · [Web 專項待驗](../apps/web/docs/README.md#待驗與未排程事項)                                                            |

## 文件分工與歸檔

- **現行規格**集中在上述位置。功能專規記錄共同行為與平台差異，平台文件補充各自實作。HTTP 欄位與允許值以共用 schema 為準，產物由它生成。歷史階段代號如 BD2、CD4 供對照既有證據與變更紀錄。
- **開發規則**從 [根 AGENTS](../AGENTS.md) 進入，再讀 [Web](../apps/web/AGENTS.md) 或 [Mobile](../apps/mobile/AGENTS.md) 補充規則；工具專用入口見 [根 CLAUDE](../CLAUDE.md)、[Web CLAUDE](../apps/web/CLAUDE.md) 與 [Web 本機畫面驗證操作](../.claude/skills/verify/SKILL.md)。涉及交易的操作需要 replica set，設定見開發規範。
- **變更與歷史**在[全專案變更摘要](changelog.md) 記每次交付的 1–3 個要點。已完成計畫、舊原型、舊決策及量測依範圍歸入 [跨端](archive/README.md)、[Web](../apps/web/docs/archive/README.md)、[Mobile](../apps/mobile/docs/archive/README.md)。封存的「手機版」UI 評估若屬 Web，指手機瀏覽器。
- **驗收與素材**從對應功能專規或操作文件連到 [共用案例](design/fixtures/)、[跨端證據](design/evidence/) 與 [歷史裝置證據](../apps/mobile/docs/archive/ACCEPTANCE.md)。證據保留當時的平台與日期。字型與素材的來源、授權保留在資源旁，見 [Web 字型](../apps/web/public/fonts/README.md)、[歷史圖示](../apps/web/public/archive/icons-2026-07-27/README.md) 及 [Mobile 模板授權](../apps/mobile/LICENSE)。
