# Q：查詢錯誤狀態與前端延遲載入

更新日期：2026-09-08

## 分階段交付

每個可獨立交付階段驗證後 commit；行為變更依 AGENTS.md 更新版本。不 push 或操作正式資料。

| 階段 | 範圍 | 狀態 |
| --- | --- | --- |
| Q1a | 旅程列表 query 錯誤、重試、背景更新提示及快速記帳的列表錯誤 | 已實作 |
| Q1b | 其他 queries 與消費頁逐一配對，補錯誤 UI、auth-null 邊界及 stale data 顯示 | 待處理 |
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

## 待處理重點

- 仍吞錯的 queries：current user、copyable checklists、friends、collections／links、map photos、
  comments／counts、activity log、visited places、notifications／counts、notes、photos。
- 調整 query 時必須同步檢查所有消費元件；不得只 throw 卻讓 UI 仍顯示空資料或無限 loading。
- 保留真正成功的 auth-null；內部服務故障不得當成未登入自動導頁。
- 動態 import 需有可關閉的載入介面，檢查開關／重開、草稿狀態及 metadata 查詢次數。
- Cursor pagination 依真實資料量門檻另行評估，不能為滿足清單而直接更動全量清單契約。
- Production build 與瀏覽器 Network／Performance 驗證尚未執行；先建立可比較量測條件，
  不把前次正式站的少量冷／熱混合樣本當成改善前後基準。
