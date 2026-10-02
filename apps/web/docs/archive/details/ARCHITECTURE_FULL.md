# 舊架構文件入口

原全文是 2026-07 起累積的歷史快照，已含被後續實作取代的內容；不再維護第二份架構權威文件。

| 需要查閱               | 文件                                  |
| ---------------------- | ------------------------------------- |
| 現行分層、資料流與邊界 | [架構摘要](../../ARCHITECTURE.md)     |
| 使用者功能與限制       | [FEATURES](../../FEATURES.md)         |
| 子系統維護注意事項     | [ARCH-NOTES](../claude/ARCH-NOTES.md) |
| 遷移與回退操作         | [MIGRATIONS](MIGRATIONS.md)           |
| 離線新增支出           | [安全重送](OFFLINE_EXPENSE_RETRY.md)  |
| AI 設定與草稿流程      | [AI 維護](../../AI.md)                |
| 原生 HTTP 邊界         | [手機 API](../../MOBILE_API.md)       |

精確 schema、索引與版本以程式碼／各應用 `package.json` 為準；舊設計全文用 `git log -p -- apps/web/docs/archive/details/ARCHITECTURE_FULL.md` 查閱。
