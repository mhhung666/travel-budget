# 離線新增支出交付摘要

2026-09-15 完成正式站摘要時序複驗；[正式驗收](../tests/PRODUCTION_ACCEPTANCE_2026-09-14.md) 保留結果與界線。

- 支出先存 IndexedDB 再確認；固定請求 ID 保護斷線、回應遺失與重送，失敗草稿可復原／匯出。
- 修正多分頁、同頁雙入口，以及分階段失敗後摘要仍計入失敗金額的競態。
- 本機 Chrome／真實 SW 與隔離 MongoDB 的七項流程通過；正式站離線重載、補送、回應遺失與摘要複驗通過。
- iOS Safari／安裝 PWA 依使用者決定暫時接受，沒有實機驗證證據。

## 重跑與部署

在 `apps/web` 執行 `pnpm test:offline-browser`，需要 Docker、Google Chrome 與依賴；可改用 `MONGOD_BINARY=/absolute/path/to/mongod`。腳本建立隔離 DB／帳號，使用 production build 與真實 SW，停用外部通知，結束清除測試環境。只有目前程式已有正式 build 時才用 `--skip-build`。

暫存目錄由腳本輸出，不保證永久保存。部署須套用 `20260912160000-expense-create-requests` migration，讓新版 action／client 一致上線。資料與重送契約見 [離線安全重送](../details/OFFLINE_EXPENSE_RETRY.md)。
