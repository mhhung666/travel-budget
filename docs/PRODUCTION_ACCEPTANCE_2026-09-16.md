# 正式站檢視器、支出列表與效能補驗（2026-09-16）

## 功能結果

目標為 `https://budget.mhhung.com`，由使用者登入獨立 Chrome 驗收視窗後，
以既有已封存旅程進行唯讀操作。每組使用只帶登入 storage state 的全新 context；
桌面 1440×900、手機 viewport 390×900。手機寬度不等同實機或安裝 PWA。

| 項目 | 結果 | 驗證內容 |
| --- | --- | --- |
| 相簿 PhotoLightbox 動態載入失敗／重試 | 兩種寬度通過 | 相簿載入後阻擋動態 JS，兩組各命中兩次請求；出現重試提示，解除攔截後重試，檢視器圖片 complete 且 naturalWidth > 0；關閉再開成功，無 page error |
| 超過 20 筆的支出列表 | 兩種寬度通過 | 初始 20 筆，顯示更多後為全部 23 筆，更多按鈕消失 |
| 全量搜尋與重設 | 兩種寬度通過 | 搜尋初始 20 筆以外的支出可找到；不存在字串為零筆；清除搜尋後重設為 20 筆，無 page error |

檢視器故障注入只攔截頁面穩定後的動態 chunk，並在隔離 context 模擬不支援 SW，
避免 SW 快取繞過攔截。此結果只涵蓋成員相簿延遲載入元件，未驗 PDF／圖片來源失敗或 signed URL 過期。
列表驗收未改動正式資料；23 筆可覆蓋第一個 20 筆顯示邊界，不能代表大資料量效能或多批展開。

校正執行曾選到帳號頭像／導覽列「更多」，以及另一個 CDP 工作誤用頁面；
修正為相簿方形照片按鈕、精確「顯示更多」與循序操作後，以全新 context 重跑。
上述通過數僅計最終完整執行。

## 正式站冷／熱載入觀測

同一個 23 筆支出旅程，每種寬度 3 組 fresh context → reload，共 12 次，全部無 page error。
Chrome 152.0.7977.83；不攔截請求、不節流網路、不降低 CPU，手機組只有 viewport 差異。
Cold 不帶 HTTP／IndexedDB／SW 快取，warm 保留同一 context；列表首筆可見後再等 1.5 秒。
每次記錄結束時均有 SW controller；cold 不代表 Vercel 或 MongoDB 冷啟動。

| 寬度 | 快取 | 列表就緒中位數（範圍），ms | JS transfer，bytes |
| --- | --- | --- | --- |
| 1440px | cold | 3,872（3,575～8,161） | 370,569 |
| 1440px | warm | 992（932～1,007） | 0 |
| 390px | cold | 3,633（3,502～4,112） | 370,569 |
| 390px | warm | 983（965～1,014） | 0 |

就緒時間以導航前至首筆列表可見的自動化 wall-clock 計時，所有樣本均顯示初始 20 筆。
JS transfer 來自 page Resource Timing 的 script，不含 SW 預快取總流量。
這不是 TTI／LCP／INP；每格三筆不報 p95。與 09-12 的資料量、就緒條件不同，不能直接宣稱效能改善。

保留 `perf-result.json`、六個 Playwright Network／DOM trace ZIP 與十二個 Chrome Performance JSON；
已確認 ZIP 完整且含 network、JSON 可解析且含 trace events。
此輪完成證據留存、小樣本觀測與下列 Network 等待分析；代表性負載、伺服器瓶頸歸因與正式 CWV 仍未完成。

## 證據與界線

暫存產物位於 `/tmp/budget-acceptance-20260916/`：`viewer-result.json`、`list-result.json`、
兩種寬度的檢視器失敗／恢復與列表截圖，以及本輪執行腳本。
截圖與 trace 可能含帳號、私人資料或 signed URL，僅留本機，不加入 Git；目錄限擁有者存取，暫存檔不保證永久保存。

本輪未新增、修改或刪除正式資料，未操作通知、cron、migration 或 AI provider。
iOS Safari／安裝 PWA 沿用 09-15 暫緩實測決定。
代表性大資料量、MongoDB profiler/explain、TTI、Vercel 部署 commit 與 O／P／R 的其餘條件仍待驗。

## 同日續驗：Network 等待分析

重新解析六份 ZIP，以 document 導航時間區分 cold／warm，依請求開始時間歸組。
十二次 document 的 HAR wait 為 495～600 ms；此欄不含 DNS／連線，不等同完整導航 TTFB。

| 樣本 | cold 最長 POST wait，ms | warm 最長已知 POST wait，ms |
| --- | ---: | ---: |
| 1440，第 1 組 | 4,092 | 704 |
| 1440，第 2 組 | 919 | 704 |
| 1440，第 3 組 | 936 | 872 |
| 390，第 1 組 | 922 | 907 |
| 390，第 2 組 | 945 | 893 |
| 390，第 3 組 | 960 | 688 |

六次 cold 各有 7 個 POST，warm 各有 3～4 個。最慢 cold 的第二個 POST 等待 4,092 ms，
是值得追查的長尾線索；不能由此將整段列表就緒時間歸因於資料庫。
觀測包含列表出現後的背景請求，未對 action 名稱或伺服器 span 配對；不能把所有 POST 時間相加當作首屏關鍵路徑。
部分請求於 reload／trace 結束時 wait 為 -1，視為未知並排除最大值計算，不當成零毫秒或失敗。
warm 的 JS transfer 為零仍有 POST，快取命中不代表沒有背景網路活動。

Performance JSON 已檢查 renderer thread 與 duration events；目前採集 categories 未提供足夠的完整頂層 task
證據，不以巢狀事件加總宣稱 CPU busy、TBT 或 TTI。需補針對導航／互動的 task 與 server span 才能完成歸因。
分析腳本 `analyze.py` 與去識別摘要 `trace-analysis.json` 留在同一暫存證據目錄。

續驗時確認未設定 `MONGODB_BASELINE_URI`／`MONGODB_INDEX_TEST_URI`，也沒有本機 `.vercel` 連結或
`VERCEL_TOKEN`。現有 explain 工具要求明確驗收目標，不自動採用應用程式 DB URI；
本次沒有執行 DB explain、啟用 profiler 或核對部署 commit。代表性資料量／多批展開仍待獨立驗證。


## 同日續驗：36 筆既有支出

由仍有效的 Chrome 登入狀態建立隔離 context，唯讀巡覽 2 個進行中與 5 個封存旅程，
挑出本輪觀測筆數最多的 36 筆旅程，再以明確等待首筆列表的腳本獨立驗收。
巡覽使用導航後固定等待，僅用於尋找樣本，不將零列觀測判定為空旅程，也不作完整資料盤點。

1440×900 與 390×900 均通過：初始 20 筆、展開至 36 筆、更多按鈕消失；
搜尋第 36 筆的描述可找到結果，不存在字串為零筆，清除後重設 20 筆，兩組均無 page error。
這增加不同旅程的列表覆蓋，但仍只有一次展開，未完成超過 40 筆的多批驗收或代表性大資料量量測。

證據 `inventory.json`、`lists36.mjs`、`list36-result.json`、`list36-1440.png` 與
`list36-390.png` 留於上述本機暫存目錄。本輪未修改正式資料。

## 同日續驗：圖片收據檢視器

使用既有登入狀態建立兩個隔離 Chrome context，在既有支出中展開明細並選取圖片收據。
1440×900 與 390×900 均通過：點擊「檢視」開啟對話框、圖片載入完成且自然寬度大於零、
Escape 關閉、重新點擊後圖片再次正常載入、再次關閉；兩組均無 page error。

這是圖片收據的正常流程驗收，未覆蓋 PDF 內容呈現、簽名 URL 過期、簽名請求失敗、
來源圖片失敗、真實手機觸控或 iOS Safari。不得由重新開啟成功推論短效簽名過期恢復已通過。

腳本 `receipts.mjs`、結果 `receipt-result.json` 及 `receipt-1440.png`／`receipt-390.png`
保留在上述本機暫存證據目錄。正式資料未新增、修改或刪除。
