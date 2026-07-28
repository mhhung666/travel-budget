# UI/UX 實作與驗證狀態

> 更新日期：2026-07-28
> 介面規則的權威來源是 [UI_UX_SPEC.md](./UI_UX_SPEC.md)。本文件只記目前狀態與尚未完成的驗證。

## 結論

Phase 1–4 的程式基線已完成。自動化測試能證明元件契約與部分可及性規則，但不能取代真實瀏覽器、輔助科技或真人任務測試。

| 階段 | 狀態 | 已交付 |
| --- | --- | --- |
| 1A 金額與日期 | complete | 集中金額格式、原幣/基準幣層級、嚴格十進位輸入、本地日曆日期 helper |
| 1B 可及性基線 | complete | 44px 操作目標、focus-visible、accessible name、Dialog/Sheet 描述、reduced motion |
| 2A 首次成功流程 | complete | 空狀態 CTA、漸進式建旅程、建立後下一步、邀請返回 |
| 2B 全域快速記帳 | complete | App Shell 常駐 flow、旅行選擇規則、PWA `/quick-add` 共用入口 |
| 3 資訊架構 | complete | 全域導覽收斂、旅行首頁依階段顯示、compact trip shell、邀請流程簡化 |
| 4 驗證與量測 | code-complete | axe 測試、固定且去識別化的產品事件 taxonomy、可用性測試腳本 |

## 現行產品基線

- 全域主要入口固定為旅行、地圖、記一筆、我的；桌機與行動端維持同一心智模型。
- 旅行空間固定為行程、支出、相簿、結算；低頻頁放入子分頁。
- 新增支出順序以金額為先，送出前顯示付款人、日期、分攤人數與換算摘要。
- 行動長表單使用全高 `ResponsiveFormSheet`，送出區納入 safe area。
- 空狀態必須說明結果並提供可執行 CTA。
- 離線新增支出需顯示 queued/synced/failed 狀態，不得靜默丟失輸入。
- 產品事件不得包含 ID、名稱、描述、邀請碼、日期、位置、精確金額或自由文字。

完整可檢查規則見 [UI_UX_SPEC.md](./UI_UX_SPEC.md)。

## 尚未完成

| 驗證 | 狀態 | 完成條件 |
| --- | --- | --- |
| 真人任務測試 | pending | 依 [USABILITY_TEST_PHASE4.md](./USABILITY_TEST_PHASE4.md) 完成 5–7 人測試與報告 |
| 真實瀏覽器可及性 | pending | 驗證 360×800、200% zoom、鍵盤、reduced motion、至少一套螢幕閱讀器 |
| 正式環境指標基準 | pending | 有足夠匿名事件樣本後，建立 activation、快速記帳、錯帳修正與離線同步基準 |
| 色彩對比與裝置矩陣 | pending | 在亮/暗模式與主要行動裝置人工驗證；jsdom axe 不涵蓋 layout/canvas |

## Agent 驗收入口

1. 介面變更先核對 [UI_UX_SPEC.md](./UI_UX_SPEC.md)。
2. 執行 `pnpm test:a11y` 與受影響測試；高風險 UI 再跑完整 build。
3. 不把「自動化通過」寫成「真人測試完成」。
4. 新發現若是未實作能力，放 `ROADMAP.md`；若是技術風險，放 `IMPROVEMENTS.md`。
