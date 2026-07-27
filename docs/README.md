# 文件索引（docs/）

旅行記帳（Travel Budget Planner）的專案文件。

| 文件 | 內容 | 何時看 |
| --- | --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | **架構權威來源**：技術棧、分層、子系統、資料模型、開發慣例 | 想了解系統怎麼運作、要動程式碼之前 |
| [FEATURES.md](./FEATURES.md) | **已實作功能的完整盤點** + 各功能關鍵實作筆記與取捨 | 想知道「現在有哪些功能、怎麼做的」 |
| [ROADMAP.md](./ROADMAP.md) | **尚未動工的功能構想** + 優先序 + 落地草圖 | 想知道「接下來要做什麼」 |
| [IMPROVEMENTS.md](./IMPROVEMENTS.md) | **尚未處理的**程式碼 / 基礎設施改善（限流、測試覆蓋、分頁…） | 想優化既有實作、補技術債 |
| [UI_UX_EVALUATION.md](./UI_UX_EVALUATION.md) | **UI/UX 現況評估**：核心流程、問題分級、畫面提案、量測與執行順序 | 要改善新手啟動、記帳效率、導覽、行動操作或可及性 |
| [CHANGELOG.md](./CHANGELOG.md) | **已完成工作的紀錄簿**：功能、改善、重構、資料層遷移 | 想知道「做過什麼、何時做的」 |
| [MIGRATIONS.md](./MIGRATIONS.md) | migrate-mongo 操作指南（可重現的 index / 資料變更） | 要改 schema / 寫資料遷移 |
| [TIER-COLORS.md](./TIER-COLORS.md) | 會籍等級 tag 的卡面色規則 + 色表（`TIER_BADGE_COLORS`） | 要改會籍 badge 顏色 / 新增會籍計畫 |
| [claude/](./claude/) | **AI 協作制度**：模型調度、判斷 rubric、交辦範本、教訓簿（入口在根目錄 [CLAUDE.md](../CLAUDE.md)） | Claude Code 做非平凡任務前 |

> 專案上手、環境變數、指令請見根目錄的 [README.md](../README.md)。
> AI 協作指引（給 Claude Code）見根目錄的 [CLAUDE.md](../CLAUDE.md)。

## 文件維護慣例

- **ARCHITECTURE.md / FEATURES.md** 依**實際程式碼**撰寫，描述**現況**，改動程式時一併更新。
- **完成一項工作** → 在 [CHANGELOG.md](./CHANGELOG.md) 加一行紀錄；若是新功能，實作筆記同時寫進 FEATURES.md，並把該項從 ROADMAP.md（功能）或 IMPROVEMENTS.md（技術債）**刪掉**。
- ROADMAP.md / IMPROVEMENTS.md **只保留待辦**，不堆積已完成內容。
- 新使用者字串四語系都要補（`en` / `zh` / `zh-CN` / `jp`）。
