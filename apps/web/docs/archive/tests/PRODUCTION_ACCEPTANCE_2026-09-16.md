# 正式站列表與檢視器補驗（2026-09-16）

以既有旅程做唯讀操作；獨立 Chrome context，桌面 1440px／手機 viewport 390px，未修改正式資料。

- 兩種寬度均通過相簿動態 chunk 失敗重試、23／36 筆支出展開、全量搜尋／零結果／清除重設，以及圖片收據開啟／Escape 關閉／重開。
- 23 筆旅程共 12 次 cold／warm 載入，無 page error；cold 列表就緒中位數桌面 3,872 ms、手機 3,633 ms，warm 為 992／983 ms。
- 最慢 cold 單一 POST wait 4,092 ms；未對齊 server span，不能歸因於 MongoDB。每格三筆樣本不報可信 p95，readyMs 不是 TTI／CWV。
- 未驗超過 40 筆多批列表、代表性負載、簽名過期／圖片來源失敗、PDF 內容與真機／安裝 PWA。

Network／Performance trace、結果與截圖在 `/tmp/budget-acceptance-20260916/`，可能含私人資料或 signed URL，不收入 Git、也不保證永久保存。完整效能與部署 commit 驗證仍待完成；量測方法見 [QUERY_UX_PERFORMANCE](QUERY_UX_PERFORMANCE.md)。
