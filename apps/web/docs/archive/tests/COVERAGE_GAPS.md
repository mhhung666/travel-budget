# 測試覆蓋歷史基準（2026-09-04）

此快照未隨後續補測更新，不作現行缺口清單。

- 當時 101 個測試檔、976 項通過；3 個 live provider suites／3 項跳過。
- `src` statements 36.88%，核心 `lib` 84.96%；公開 API、認證、外部服務與頁面協調 hooks 是當時主要缺口。
- 優先保護授權、金額寫入、失敗復原與離線；不為百分比逐一測薄頁面、型別或 library wrapper。
- 要重新排補測，在 `apps/web` 執行 `pnpm test:coverage`，查看 `coverage/index.html` 與實際斷言。覆蓋率不能證明瀏覽器或外部服務可用性。
