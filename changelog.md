# Changelog

只記錄變更要點；版本以各應用的 `package.json` 為準，提交紀錄見 Git。

## Unreleased

### 2026-10-05

- Web／workspace：補齊 React PDF、next-themes、cmdk 與 React Leaflet／core 的 React 型別依賴，修復 53 個型別錯誤；frozen install、根 check、Web 正式 build、Mobile 三平台匯出與 Expo 相容性通過。
- Mobile：完成 C 表單無障礙與返回／鍵盤修正，既有核心與四語配置驗收通過；新增 D1 的 SQLite 隔離草稿、續填／捨棄、保存提示與原子交接 C，並修正捨棄後失效成員問題；D2 新增最小旅行快照、受限本機身分與離線重啟草稿入口；D3 定義離線均分規則確認，實作多筆 SQLite 待送佇列、未送出紀錄移回草稿／捨棄及前景同步，重讀成員／後端預覽後原子接回 C，未確認草稿不自動入帳。依使用者決定，D1／D2／D3 實作完成後再統一進行兩平台裝置複驗，並補驗 C 暫緩鍵盤／螢幕閱讀器；未驗項目、真機與 development build 仍待驗。
- 測試／工具：D1／D2／D3 的 SQLite 升級／重開、原子交接與當機恢復、帳號／環境隔離、快照撤權、429 持久化等待及 409 衝突回歸通過；撤權檢查延伸至每次 HTTP fetch 前，涵蓋 C 序列／SQLite 等待與 refresh 重送，保留原 UUID／凍結內容。D2 P1 與 D3 P2 修正經複審未發現新問題。Mobile 532 個測試、check、三平台匯出、Expo 相容性與根 frozen install 通過；既有 DB／流量核對、字級／外觀還原及 Web 驗證摘要見 Mobile archive。

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
