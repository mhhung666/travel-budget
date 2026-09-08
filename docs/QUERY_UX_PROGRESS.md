# Q：查詢錯誤狀態與前端延遲載入

更新日期：2026-09-08

## 分階段交付

每個可獨立交付階段驗證後 commit；行為變更依 AGENTS.md 更新版本。不 push 或操作正式資料。

| 階段 | 範圍 | 狀態 |
| --- | --- | --- |
| Q1a | 旅程列表 query 錯誤、重試、背景更新提示及快速記帳的列表錯誤 | 已實作 |
| Q1b | 其他 queries 與消費頁逐一配對，補錯誤 UI、auth-null 邊界及 stale data 顯示 | 已完成 |
| Q2 | 全域快速記帳與大型 dialogs／AI／lightbox 的 mount 與動態載入 | 待處理 |
| Q3 | 支出搜尋 deferred rendering、常用頁 prefetch 評估與 production build／瀏覽器量測 | 待處理 |

## Q1a

- `useTrips` 不再將 ActionResult 失敗轉成空陣列；共用 unwrap 工具保留 error code。
- 旅程列表首次失敗提供重試；只有成功取得空陣列才顯示真正的空資料狀態。
- 已有快取（包含空陣列）時，背景請求不切回整頁 skeleton；更新失敗保留內容並提示可重試。
- 同步涵蓋共用 `useTrips` 的地圖頁與收藏表單旅程選單；選單無資料時停用，重試按鈕不提交表單。
- QueryFeedback 提供四語的初次錯誤、背景更新／失敗與等待連線訊息，不直接向畫面輸出內部 error。
- `useTrips(enabled)` 允許關閉的快速記帳停止主動查詢；快速記帳查詢失敗不進入建立旅程流程。
- 快速記帳的列表錯誤採阻擋重試，避免依過期資格自動選團；已開啟支出表單的 metadata 錯誤另於 Q1b 處理。

驗證：新增真實 QueryClient＋旅程頁測試，涵蓋錯誤保留、重試恢復、背景 transport failure、
空快取與 enabled gating；另驗證快速記帳失敗不進建立流程／不發出誤導事件、關閉 gating 與離線等待訊息。
本階段新增 10 項測試通過；全套回歸為 1,302 通過、37 項 opt-in 跳過。
lint、Prettier 與 TypeScript 檢查通過；未執行真實 provider／DB 整合測試。
其他頁面尚未全面導入，本階段不代表 Q 結案，也不宣稱已解決正式站長尾。

## Q1b 第一批：隨手記、相簿與活動紀錄

- 三個 query 改用 `unwrapActionResult` 保留錯誤與 code，不再把失敗寫成成功的空清單。
- 隨手記頁、相簿頁與 ActivityFeed 使用共用 QueryFeedback：冷載入失敗提供重試，
  背景更新失敗保留快取內容；離線暫停且沒有資料時顯示等待連線，不顯示空清單。
- 旅程首頁共用照片 query 的每日照片也加上更新／失敗提示及重試；仍由 `isMember` 啟用，
  不新增公開 fallback，不改伺服器授權、照片 DTO、寫入與 mutation 流程。
- 登入／會員判斷、相簿 lightbox 的行程 metadata 與其他次要查詢仍屬後續批次，未宣稱全部完成。

驗證：三個真實 QueryClient＋頁面／元件各四情境，共新增 12 項測試，涵蓋初次失敗、
手動重試成功、背景 transport failure、權限拒絕及離線暫停。全套 1,314 通過、37 項 opt-in 跳過；
lint、Prettier、TypeScript 通過。沒有操作正式站、DB 或真實 provider；production build／瀏覽器量測仍待 Q3。

## Q1b 收尾：其餘查詢、登入與表單

Q1b 程式交付完成；Q2／Q3 仍獨立保留，不以本機測試冒稱正式站效能驗收。

| 查詢群組 | 消費端處理 |
| --- | --- |
| current user／members | 成功 auth-null 才代表未登入；服務錯誤保留 error，會員資格須完成解析，加入旅程／設定頁提供重試，不把故障判成未登入或無權限 |
| friends／collections／links | 好友頁、加入好友、建立旅程、收藏清單與帶入活動狀態提供重試；未知好友關係不顯示可發邀請，未知帶入狀態不執行帶入 |
| comments／counts、notifications／count | 留言與通知清單失敗不顯示空清單；計數失敗保留快取並提示，通知鈴可見失敗標記、面板可重試 |
| copyable checklists、行程日 metadata | 複製清單與筆記轉行程選單區別載入／失敗／成功空清單；未開啟的筆記選單不主動讀取 |
| map photos／visited places／collections | 地圖依目前模式彙整必要查詢，無資料失敗時可重試，背景失敗保留既有地圖 |
| shell／expenses／checklists／settlement／stats | 旅程頁面與次要摘要提供失敗／更新提示，快取不因背景失敗被清空或切回整頁錯誤 |
| exchange rates／year in review／loyalty | 匯率服務失敗不再寫入成功的 TWD-only 結果；回顧、會員與收藏表單的次要讀取有錯誤提示 |

新增 QueryStatus、combineReadStates 與 QueryReadDialog，統一區分 undefined、成功 null／空值與錯誤。
新增／編輯支出必須完成必要 metadata 才開啟；失敗、暫停與資格不足都有可關閉、可重試的介面，
取代原本可能無限等待的遮罩。表單 readiness 只彙整已啟用查詢，不為關閉表單強制取資料。

**保護性例外**：登入／會員資格發生錯誤時，設定與加入操作先要求重試，不依過期資格開放操作；
資料仍保留於快取。一般清單與圖表則保留 stale content。可選 metadata 不阻止不依賴它的操作，
但會顯示失敗提示。伺服器授權仍為最終防線，沒有新增公開路由或放寬權限。

**驗證**：新增其餘 11 種 action query 的失敗／重試與背景失敗測試、auth-null／會員解析、
disabled gating、匯率 service failure、五類記帳依賴失敗、可關閉的失敗／離線表單，
以及好友／收藏／留言／通知消費端與加入旅程防誤判測試。本批新增 46 項測試；最終全套 1,360 通過、37 項 opt-in 跳過。
lint（無警告）、Prettier、TypeScript 與 production build 均通過。
不跑正式站壓測／業務寫入／真實 AI provider；不需要 migration 或新增環境參數。

## Q2／Q3 待處理重點

- 動態 import 需有可關閉的載入介面，檢查開關／重開、草稿狀態及 metadata 查詢次數。
- Cursor pagination 依真實資料量門檻另行評估，不能為滿足清單而直接更動全量清單契約。
- Q1b production build 已驗證；Q2／Q3 的 bundle 比較與瀏覽器 Network／Performance 量測尚未執行。先建立可比較量測條件，
  不把前次正式站的少量冷／熱混合樣本當成改善前後基準。
