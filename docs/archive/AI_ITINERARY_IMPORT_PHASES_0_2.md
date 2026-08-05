# AI 行程匯入 Phase 0–2 歸檔摘要

> 歸檔日期：2026-08-05
> 範圍：2026-08-04 完成的低流量受限試用基線

## 交付結果

AI 行程匯入由「貼上外部規劃文字」開始，模型只產生結構化草稿，不直接寫入資料。旅程 admin 可在四語響應式預覽中修正、取消項目並確認；既有日期只附加活動，不覆蓋內容。寫入以日期為單位回報，部分失敗可重試，冪等 key 防止同一確認重送造成重複活動。

## Phase 摘要

| Phase | 完成內容 |
| --- | --- |
| 0 | 31 份匿名 fixture、Zod 草稿契約、日期正規化、重複提示、限制與離線評分工具 |
| 1 | admin-only 解析 endpoint、最小旅程 context、Gateway／OpenAI provider、timeout、限流與安全錯誤分類 |
| 2A | 可編輯、可取消單項的四語預覽；既有日、歧義、重複與敏感確認碼提示 |
| 2B | 明確確認、逐日寫入結果、部分成功重試、server-only 冪等保護與既有 action 驗證 |
| 2C 已落地 | 行動版與可及性、持久化 global／user／trip 配額、成本預留、去敏 funnel 事件、五天腳本化驗收與完整自動化測試 |

## 保留的產品與安全決策

- Phase 0–2 只接受純文字或 Markdown，不接受檔案、圖片、網址或語音。
- 模型只收到解析必要的旅程日期範圍，不收到成員、支出、附件或邀請碼。
- confirmation code 可解析，但預覽預設遮罩，且不得進入 log 或分析事件。
- 模型輸出先通過專用 Zod schema，再由確定性程式處理日期與衝突；確認時重新驗證 session、admin 與既有 action payload。
- 每日配額使用 MongoDB UTC bucket，依 global／user／trip 原子保留；成本以 micro-USD 最壞情況預留，失敗無 usage 時採保守結算。
- AI 未設定、額度用盡或 provider 失敗時，其餘手動功能正常運作，來源文字只留在瀏覽器供重試。

## 當時驗證結果

- `openai/gpt-4.1-nano` 成功生成的 10 份樣本全數為合法 schema，79 個核心欄位答對 78 個，約 98.7%。
- Free Tier 完整 31 份執行只有 10 份到達模型，其餘 21 份遭 429，provider 可用率為 32.3%。
- 自動化測試、typecheck、lint、format 與 production build 均通過；五天／十活動的腳本化寫入驗收通過。

## 尚未完成的擴流門檻

- 完整 31 份 fixture 至少 90% provider 可用率。
- 真人計時驗證相較手動建立五天行程至少節省 50%。

因此產品狀態維持「低流量受限試用」，不得宣稱一般流量正式可用。現況與架構細節請分別查閱 [FEATURES.md](../FEATURES.md) 及 [ARCHITECTURE.md](../ARCHITECTURE.md)。
