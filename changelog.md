# Changelog

只記錄變更要點；版本以各應用的 `package.json` 為準，提交紀錄見 Git。

## Unreleased

### 2026-10-06

- Web／Mobile：依 [E 規格](apps/mobile/docs/ROADMAP.md#e-規格基本使用流程) 實作 E1 建立／加入旅行、邀請複製與分享；共用交易服務與 HTTP receipt 防重複旅行／成員／站內副作用，撤權／刪除後不重播加入。E2–E4 仍待實作。
- Mobile：確認後以獨立 SQLite 操作表保存固定 UUID，重啟／回前景只查結果，明確原內容重試才送出；保存失敗零 HTTP，終局結果清除邀請 payload，429 與 C／D 共用帳號期限。未確認表單只留畫面，離開提醒；邀請碼不進一般快照。
- 開發驗證：新增 45 個 Mobile 案例與 4 個隔離交易案例；Web 2,006、Mobile 644 個測試、真 HTTP／MongoDB、根 check／build、frozen install、三平台匯出及 Expo 相容性通過。兩平台 E1 基本操作與四語／字級／鍵盤／分享驗收交由其他人，清單見 [E1 交接](apps/mobile/docs/LOCAL_ACCEPTANCE.md#e1-旅行入口驗收交接)。未部署或執行遠端 migration。

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
