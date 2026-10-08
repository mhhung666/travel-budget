# Changelog

只記錄變更要點；版本以各應用的 `package.json` 為準，提交紀錄見 Git。

## Unreleased

### 2026-10-08

- Mobile U1／U2：完成既有頁面、帳號／旅行表單、本機／佇列恢復顯示與共用身分格式整理；保留 C／D／E、UUID、原期限及撤權，提交相應 patch。開發檢查／iOS 待驗見 [本機驗收](apps/mobile/docs/LOCAL_ACCEPTANCE.md)，Android 延後，未部署。
- Mobile U review／規劃：修正有效等待、原幣代碼、可見筆數、名冊同名短碼／歷史消歧及顯示負零，memo 還款標籤並移除期限暖快取額外讀取；980 項測試、check 與三平台匯出通過；唯一姓名／朗讀文字與未知名冊不加碼，清單更新／錯誤重試一起重讀名冊、隱藏時略過一般名冊更新，明確重試仍走原授權流程，現名／歷史限制見交接。[修正交接](apps/mobile/docs/LOCAL_ACCEPTANCE.md#u-靜態審查修正交接2026-10-08)記未驗範圍與延期整理；G 規格已盤點，該輪以 Mobile patch 交付，未改交易／撤權保護或部署。
- G1／G2／Web／Mobile：分片完成旅行／成員／存取管理、幣別設定、外幣新增草稿與均分編輯；歷史帳務、原 UUID、SQLite 與共用限速保留。G2 的 3 項 P2／1 項 P3 修正經獨立複驗通過，新增 15 個回歸，Mobile 1,206 項、check／contracts／三平台匯出通過，裝置待驗見 [交接](apps/mobile/docs/LOCAL_ACCEPTANCE.md#g2-獨立程式審查2026-10-08)。補齊 [B0–B4 基準幣別規格](apps/mobile/docs/ROADMAP.md#b旅程基準幣別改造規格2026-10-08)，定案全幣別兩位小數與舊 v1 安全阻擋；明訂 v2 單位、統計分組、持久化恢復及逐片驗收，優先於 G3／G4。本輪 B 僅文件、格式檢查通過，尚未實作／開放非 TWD；原生認領及 F 另排，未部署。

### 2026-10-07

- Mobile CI：依 Expo 相容性檢查更新五個套件的 patch 與根 lockfile，修正檢查回報相依過期；frozen install、workspace 檢查／測試、Web build 與三平台匯出通過。未重新執行原生裝置驗收，未調整產品版本或部署。
- Mobile U0～U1b：交付 iOS／Web 對照與共用深淺色元件，新增全域／旅行分頁、我的、選旅行與本機記帳入口；表單獨立、保留根登入／草稿／佇列引擎及原 UUID 流程。U1a／U1b 提交各調升 Mobile patch；U1b 新增 18 個案例，Mobile 771 項測試、check 與三平台匯出通過。iOS 原生字級／手勢／閱讀器與 Maestro 導覽更新由其他人驗收，Android 延後，資訊重排接續 U1c／U2。
- Mobile 文件：依 E1–E4 最新驗收更新狀態、合併完成摘要至 archive，精簡 roadmap 並排定 U Web／Mobile 體驗對齊與 F 原生建置、帳號恢復／刪除及真機試用；細化 U0 對照／設計決策、U1 共用元件／導覽與 U2 五組核心流程的交付及驗收，於試用包前完成。未重跑歷史驗收或實作 F。

### 2026-10-06～2026-10-07

- E1／E2：修正多成員加入通知重複鍵及重設碼保護／重寄，新增 localhost 收件匣供原生驗收；Email 配額被耗盡的限制仍見 [E2 契約](apps/mobile/docs/BACKEND_CONTRACT.md#e2-註冊與-email-驗證碼重設)。
- E3／E4／Web：完成手機支出維護與還款，修正衝突保留輸入、第三人登記通知及同名成員結算身分／預填；Android 離開警告改為短標題與完整訊息，增加原生操作 ID 與 SQLite 故障工具。
- 驗收：兩平台程序中斷、限速、身分隔離與基本顯示完整矩陣通過，四語完整 16 組警告／危險確認亦通過；Mobile 723／Web 2,054 項與檢查、匯出及 Web build 通過。真機、完整閱讀器與外部郵件仍待驗；本次提交包含兩應用 patch 調版，未部署，見 [本機驗收](apps/mobile/docs/LOCAL_ACCEPTANCE.md)。

### 2026-10-05～2026-10-06

- Web／workspace：補齊 React PDF、next-themes、cmdk 與 React Leaflet／core 的 React 型別依賴，修復 53 個型別錯誤；frozen install、根 check、Web 正式 build、Mobile 三平台匯出與 Expo 相容性通過。
- Mobile：完成 C 返回／鍵盤與無障礙修正及 D1–D3 草稿、離線入口和均分佇列；409／原 C 待確認只阻擋同旅行，429 獨立按帳號／環境持久化，捨棄與重啟不解除等待。修正 SQLite 等待期間新增限速仍送出的競態，在 POST／receipt／refresh 重送前同步攔截；本機身分 schema 不相容仍可用有效 token 線上刷新，最大字級成員選項改用固定圓角。
- Mobile 驗收：修正本機攔截把 120 秒期限延長至 149 秒的 P2，C／D 沿用原始毫秒期限；599 個測試、check、三平台匯出與 Expo 相容性通過。兩平台補驗長名稱最大字級深淺色／選取、身分格式刷新與離線隔離，以及 22 個原生跨旅行／共用限速／重啟／競態案例，核對每 UUID 僅一筆 expense／receipt。D 僅剩 VoiceOver 實際忙碌朗讀、完整手勢與 C 手動恢復，以及 TalkBack 人工驗收；真機／development build 另列 F，見 [本機驗收](apps/mobile/docs/LOCAL_ACCEPTANCE.md#尚未完成的驗收)。依使用者決定，剩餘驗收全部暫緩，不阻擋合併 master 與進入 E；未驗不計通過，對外測試前補齊，產品尚未發布。

### 2026-10-04

- Web／Mobile：B 共用新增服務與 API、UUID 相容／冪等及金額上限修正通過複驗；Web 2,006、Mobile 135、交易整合 174、額外邊界 5 個案例與 HTTP 驗收通過，根 check／build 仍受既有 Web 型別錯誤阻擋。
- Mobile：完成 C 線上新增支出、後端分攤預覽與 SQLite 待確認恢復；修正預覽撤權、晚到回應與 lint，區分 refresh 與支出錯誤，refresh 失敗保留待確認紀錄、跨登入世代回報取消，避免誤清紀錄後重複記帳。Mobile 393 個測試、原 5 個獨立案例、check、三平台匯出與 iOS 登入失效恢復流程通過。
- 文件／測試：精簡 Mobile roadmap，排定 C 收尾與 D 草稿／離線開發，已完成成果與歷史驗收合併至 archive；補上 refresh 重送成功回應晚於換帳號的回歸測試。

### 2026-10-03

- Mobile：修正網路／前景狀態競態；登入與旅行的生命週期、HTTP 故障、四語、大字體／外觀、iOS 鍵盤及 JWT 自然到期通過模擬器驗收，補上線上記帳分階段規劃。
- Mobile／Web：支出分頁、明細與結算唯讀 API／畫面（含撤權快取修正）通過獨立驗收；新增線上記帳後端：成員資料、均分預覽、冪等新增與結果查詢 API 及共用契約，Web 與 HTTP 共用同一個新增支出服務，Web 因此也拒絕不存在的日期、重複成員與超出安全範圍的金額。手機新增畫面、離線、真機與 development build 尚未完成。
- Web／測試：新增 replica set 整合測試與 CI 工作（併發重複、重播、刪除與失去資格、回滾），隔離驗收環境改為單節點 replica set，B 待獨立驗收；修正相簿去重測試的併發順序假設；本機 check／build 仍受乾淨 HEAD 相同的 53 個既有型別錯誤阻擋。

### 2026-10-02

- Mobile／測試：補上登入撤銷與 session 到期的原生驗收及隔離控制通道；iOS、Android 模擬器通過，弱網與完整真機驗收仍待完成。
- 文件：統一變更紀錄，合併四輪 UX 紀錄，精簡歷史報告與已完成規劃；開發規則要求每次更新本檔，只記重點。

## 歷史摘要

此前里程碑見 [Web 歷史摘要](apps/web/docs/archive/history/CHANGELOG.md)；該檔不再追加。
