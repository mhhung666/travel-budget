# 正式站補充驗收摘要（2026-09-11～12）

歷史快照；當時發現的離線重載遺失問題已由 [09-14～15 複驗](PRODUCTION_ACCEPTANCE_2026-09-14.md) 結案。

- 通過：桌面／手機 viewport 頁面與載入態、查詢／動態表單重試、小資料搜尋、支出 CRUD、直接恢復連線補送、行程日／活動 CRUD、兩分頁草稿衝突及 PDF 票券正常流程。
- 當時失敗：離線新增後重載兩次皆遺失待送工作；後續改為獨立持久保存與固定請求 ID，見 [離線交付](../history/OFFLINE_EXPENSE_COMPLETION.md)。
- 背景工作：活動與 done 計數正常，inspect 授權 200／未授權 401；曾遇 503，未追出原因。未測收件人推播與逐事件 checkpoint；後續見 [背景通知結案](EXPENSE_DELIVERY_ACCEPTANCE.md)。
- 效能：空支出頁 12 次冷／熱載入無 page error；只是小樣本，沒有 CWV 或效能改善結論。
- 僅以單人臨時旅程寫入，既有旅程唯讀；UI 清理不等於 R2 物件已刪。

仍缺部署／migration 證據、正式競態、清理 cron、代表性負載與真機測試。手機 viewport 不等於 iOS Safari 或安裝 PWA；此報告不能作為全部工程的驗收結論。
