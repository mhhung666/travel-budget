# 支出背景通知交付摘要

2026-09 完成事件保存、持久化 worker、站內去重、逐裝置重試及每日補送；09-16 依使用者接受決定結案。實測與免驗範圍見 [驗收與維運](../tests/EXPENSE_DELIVERY_ACCEPTANCE.md)。

- 新增支出與不可變事件同次寫入，回應後由 `after` 嘗試一批，cron 接續未完成工作。
- 固定候選裝置、租約與 checkpoint 支援續跑；新註冊裝置不補發舊事件。
- 預設啟用；`EXPENSE_BACKGROUND_DELIVERY=off` 停止新工作，既有工作仍須排空。
- Provider 已接受但 checkpoint 未保存時仍可能重送；不保證 exactly-once，也不把 accepted 當成裝置收到。

分階段設計與中間測試結果查 Git；不要沿用舊版「預設關閉／尚未接入」描述。
