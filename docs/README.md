# 文件入口

| 文件                                                     | 用途                                     |
| -------------------------------------------------------- | ---------------------------------------- |
| [變更紀錄](../changelog.md)                              | 每次開發的簡短成果與重要限制             |
| [開發規範](DEVELOPMENT.md)                               | Workspace 指令、環境、版本與部署         |
| [共同設計：我的旅行](design/MY_TRIPS.md)                 | Web／Mobile 列表設計、實作現況與共同驗證 |
| [新旅行：基準幣別選擇](design/BASE_CURRENCY_CREATION.md) | Web／App 共同 UI／UX、搜尋單選及開放條件 |
| [Web／後端](../apps/web/docs/README.md)                  | 功能、架構、AI 與 API                    |
| [Mobile](../apps/mobile/docs/README.md)                  | 功能、開發、驗收與路線                   |
| [共用契約](../packages/contracts/README.md)              | Schema 與 OpenAPI                        |
| [Monorepo 決策](decisions/0001-monorepo.md)              | 應用邊界與整併來源                       |
| [Agent 規則](../AGENTS.md)                               | 開發與提交規則                           |

文件只記現況、必要操作與未完成事項；每次開發更新根目錄 `changelog.md`，相關工作合併成 1–3 點。功能與架構各維護一份，不另開逐輪進度報告；已完成計畫壓成成果、驗證與限制，細節查 Git。

## 文件分工與歸檔

| 分類            | 維護位置                                                                                                                                      | 整理原則                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 現行開發規則    | 根／App README、AGENTS／CLAUDE、DEVELOPMENT、採用中的 ADR                                                                                     | 保留必要規則／指令，不因功能已完成而歸檔                                        |
| 功能／架構／API | 各 App FEATURES／ARCHITECTURE、Mobile BACKEND_CONTRACT、Web MOBILE_API、contracts README／OpenAPI                                             | 保留實作契約；程式是最終依據，不另存逐輪版本                                    |
| 未完成工作      | Mobile ROADMAP／LOCAL_ACCEPTANCE、Web 文件入口待驗表、[共同設計](design/MY_TRIPS.md)                                                          | 實作、審查、裝置、部署分開標狀態                                                |
| 操作與來源      | [相簿維運](../apps/web/docs/PHOTO_AUDIT.md)、AI 維護、原始碼旁 README、字型授權                                                               | 長度以安全重跑所需為準，不移走仍在用的命令與限制                                |
| 已完成成果      | [跨端 archive](archive/README.md)、[Mobile archive](../apps/mobile/docs/archive/README.md)、[Web archive](../apps/web/docs/archive/README.md) | 合併成果／驗證／限制；歷史原型、截圖、量測與已取代 ADR 同步歸檔，詳細過程查 Git |

2026-10-12 已盤點 repository Markdown、文件內設計 HTML／截圖／JSON 與證據目錄。原始證據保留，不重寫成新的通過結果；`/tmp` 私有產物可能已失效。已實作項目不留在「下一步」，尚未驗收的項目不跟著結案。
