# 文件索引（docs/）

旅行記帳（Travel Budget Planner）的專案文件。建議閱讀順序如下：

| 文件 | 內容 | 何時看 |
| --- | --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | **架構權威來源**：技術棧、分層、子系統、資料模型、開發慣例 | 想了解系統怎麼運作、要動程式碼之前 |
| [FEATURES.md](./FEATURES.md) | **已實作功能的完整盤點** + 各功能關鍵實作筆記與取捨 | 想知道「現在有哪些功能、怎麼做的」 |
| [ROADMAP.md](./ROADMAP.md) | **尚未動工的功能構想** + 優先序 + 落地草圖 | 想知道「接下來要做什麼」 |
| [UI_UX_REDESIGN.md](./UI_UX_REDESIGN.md) | **UI/UX 評估與前端重新設計**：問題盤點、新資訊架構、設計系統、Phase 0–4 路線圖與進度 | 要動前端版面 / 導覽 / 元件之前 |
| [IMPROVEMENTS.md](./IMPROVEMENTS.md) | 程式碼 / 基礎設施層級的改善建議（限流、測試覆蓋、分頁…） | 想優化既有實作、補技術債 |
| [MIGRATIONS.md](./MIGRATIONS.md) | migrate-mongo 操作指南（可重現的 index / 資料變更） | 要改 schema / 寫資料遷移 |
| [MIGRATION_MONGODB.md](./MIGRATION_MONGODB.md) | Supabase（PostgreSQL）→ MongoDB 遷移的歷史紀錄 | 想了解資料層演進背景 |

> 專案上手、環境變數、指令請見根目錄的 [README.md](../README.md)。
> AI 協作指引（給 Claude Code）見根目錄的 [CLAUDE.md](../CLAUDE.md)。

## 文件維護慣例

- **ARCHITECTURE.md / FEATURES.md** 依**實際程式碼**撰寫，改動程式時一併更新。
- 功能**完成**後：實作筆記寫進 FEATURES.md，並把 ROADMAP.md 該項從「待辦」移到「已完成」表（保留一行）。
- 新使用者字串四語系都要補（`en` / `zh` / `zh-CN` / `jp`）。
</content>
