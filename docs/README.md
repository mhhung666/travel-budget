# 文件索引

本目錄只保存目前仍會影響產品、開發或決策的資訊。歷史實作細節以 Git 為準，不在多份文件重複保存。

## AI agent 快速入口

1. 先讀根目錄 [AGENTS.md](../AGENTS.md) 與 [CLAUDE.md](../CLAUDE.md)。
2. 依任務只讀下表指定文件，不必遍歷整個 `docs/`。
3. 文件與程式碼衝突時，以程式碼和測試為準，並在同一變更修正文檔。

| 任務 | 權威文件 |
| --- | --- |
| 系統結構、資料流、資料模型 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 確認目前產品能力 | [FEATURES.md](./FEATURES.md) |
| 規劃尚未實作的功能 | [ROADMAP.md](./ROADMAP.md) |
| 處理技術債或基礎設施風險 | [IMPROVEMENTS.md](./IMPROVEMENTS.md) |
| 查重要交付里程碑 | [CHANGELOG.md](./CHANGELOG.md) |
| 修改 schema、index 或回填資料 | [MIGRATIONS.md](./MIGRATIONS.md) |
| 開發或驗收介面 | [UI_UX_SPEC.md](./UI_UX_SPEC.md) |
| 查 UI/UX 實作與驗證狀態 | [UI_UX_EVALUATION.md](./UI_UX_EVALUATION.md) |
| 執行真人可用性測試 | [USABILITY_TEST_PHASE4.md](./USABILITY_TEST_PHASE4.md) |
| 修改會籍 badge 顏色 | [TIER-COLORS.md](./TIER-COLORS.md) |
| 查非顯而易見的子系統限制 | [claude/ARCH-NOTES.md](./claude/ARCH-NOTES.md) |
| 執行 Agent 工作流程 | [claude/WORKFLOW.md](./claude/WORKFLOW.md) |

## 文件角色

- `ARCHITECTURE.md`：只寫系統如何運作與不可破壞的技術契約。
- `FEATURES.md`：只寫使用者現在能做什麼；實作細節連回程式碼或架構。
- `ROADMAP.md`、`IMPROVEMENTS.md`：只保留未完成項目，每項需有狀態與完成條件。
- `CHANGELOG.md`：只保留重要里程碑，不取代 `git log`，也不逐 commit 重抄。
- `UI_UX_SPEC.md`：目前介面規格；`UI_UX_EVALUATION.md`：驗證狀態；兩者不重述功能清單。

## 維護規則

- 新功能完成：更新 `FEATURES.md`，從 `ROADMAP.md` 移除，必要時在 `CHANGELOG.md` 加一行里程碑。
- 技術債完成：從 `IMPROVEMENTS.md` 移除；只有具架構影響時才更新 `ARCHITECTURE.md`。
- 規劃草圖與已完成 Phase 不留全文；需要回顧時使用 Git 歷史。
- 不在文件寫死軟體版本；版本唯一來源是 `package.json.version`。
- 路徑、指令、環境變數與安全限制必須可由 repo 驗證，不確定就標記「待確認」。

專案安裝、環境變數與常用指令見根目錄 [README.md](../README.md)。
