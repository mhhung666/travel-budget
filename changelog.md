# Changelog

只記錄變更要點；版本以各應用的 `package.json` 為準，提交紀錄見 Git。

## Unreleased

### 2026-10-03

- Mobile：修正網路／前景狀態競態；登入與旅行的生命週期、HTTP 故障、四語、大字體／外觀、iOS 鍵盤及 JWT 自然到期通過模擬器驗收，補上線上記帳分階段規劃。
- Mobile／Web：新增支出分頁、明細與結算唯讀 API／畫面及相關測試。撤權快取修正通過獨立複驗（33 個回歸＋9 個邊界案例），兩平台英文 ledger 重跑通過，可交接 B；完整語系／外觀矩陣仍待驗。線上新增、離線、真機與 development build 尚未完成。
- Web／測試：修正相簿去重測試的併發順序假設；A 的 HTTP／MongoDB 驗證通過，本機 check／build 仍受乾淨 HEAD 相同的 53 個既有型別錯誤阻擋。

### 2026-10-02

- Mobile／測試：補上登入撤銷與 session 到期的原生驗收及隔離控制通道；iOS、Android 模擬器通過，弱網與完整真機驗收仍待完成。
- 文件：統一變更紀錄，合併四輪 UX 紀錄，精簡歷史報告與已完成規劃；開發規則要求每次更新本檔，只記重點。

## 歷史摘要

此前里程碑見 [Web 歷史摘要](apps/web/docs/archive/history/CHANGELOG.md)；該檔不再追加。
