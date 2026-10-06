# Changelog

只記錄變更要點；版本以各應用的 `package.json` 為準，提交紀錄見 Git。

## Unreleased

### 2026-10-05～2026-10-06

- Web／workspace：補齊 React PDF、next-themes、cmdk 與 React Leaflet／core 的 React 型別依賴，修復 53 個型別錯誤；frozen install、根 check、Web 正式 build、Mobile 三平台匯出與 Expo 相容性通過。
- Mobile：完成 C 返回／鍵盤及無障礙修正，新增 D1 隔離草稿／原子交接、D2 最小快照／受限離線入口，以及 D3 明確均分確認／多筆前景佇列；修正 409 無 receipt／同旅行 C 未結案阻塞其他旅行，等待落盤，衝突與 429 限速期限分開保存／判斷，以獨立帳號／環境資料保存限速，C 恢復／查詢／重試與新增共用，捨棄／移回／結案及重啟不解除等待；本機身分 schema 不相容仍保留有效 token 供線上刷新；修正提交依規範升 patch，尚未發布。未確認草稿不自動入帳，分攤仍由後端決定。
- Mobile 驗收／工具：兩平台以原生 SQLite、隔離 MongoDB 與 HTTP 核對保存／當機恢復、撤權、佇列及持久化 429／409；C 序列、refresh 重送及晚到回應撤權補驗通過，完成 D 的 32 組配置操作與 iOS 鍵盤／VoiceOver 錯誤及私人資料焦點核對。兩項限速 P2 複審確認修正，含 schema 6 升級與交易回滾；新增 12 個回歸案例後，585 個既有測試（554 行為／31 工具）、Mobile check、三平台匯出與 Expo 相容性通過。另重現 C 重試在 SQLite 等待期間新增跨旅行 429 後仍 POST 的 P2 競態，待修正。產品修正的兩平台複驗仍待執行；iOS 最大字級長成員名稱另有 P2 視覺缺陷，閱讀器剩餘項目／TalkBack 人工驗收見 [本機驗收](apps/mobile/docs/LOCAL_ACCEPTANCE.md#尚未完成的驗收)，D 尚未結案；真機／development build 另排。

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
