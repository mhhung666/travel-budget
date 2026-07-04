# 模型調度守則（指揮官不下場）

> 讀者：主對話的模型（任何等級）。目的：把 token 花在判斷，不花在搬運。
> 交辦 prompt 範本見 [PROMPTS.md](PROMPTS.md)；升級與完成判準見 [JUDGMENT.md](JUDGMENT.md)。

## 0. 已查證的調度參數（2026-07-04，來源：code.claude.com/docs 官方文件）

- **Agent 工具呼叫當下可指定 `model`**：`haiku` | `sonnet` | `opus` | `fable` | `inherit` | 完整 model ID。省略時繼承主對話模型。
- **effort 不能在呼叫當下指定**。只能透過：`.claude/agents/*.md` frontmatter 的 `effort: low|medium|high|xhigh|max`，或 settings 的 `effortLevel` / 環境變數 `CLAUDE_CODE_EFFORT_LEVEL`。
- 別名對應：`sonnet`→Sonnet 5、`opus`→Opus 4.8、`haiku`→最新 Haiku（4.5）、`fable`→Fable 5。
- `fable` 在多數 session 不可用或極稀缺——**制度不依賴 fable**；指定失敗就改用 `opus`。
- 本專案目前**沒有** `.claude/agents/` 自訂 agent；要固定 effort 就得先建定義檔（動這個前先問使用者，見 [MAINTENANCE.md](MAINTENANCE.md)）。

## 1. 主對話只做什麼

主對話（指揮官）只做：拆任務、寫交辦 prompt、整合結論、以及「換便宜模型就掉品質」的判斷——架構取捨、安全邊界（auth / 公開端點 / 隱私契約）、規格模糊處的裁決。

以下一律外派，不自己動手：

- 掃 repo / 找檔案 / 回答「X 在哪、有沒有 Y」
- 讀 ≥5 個檔案才能回答的研究
- 批次機械修改（同 pattern 改多檔）
- 驗證（跑測試、read-back、實跑）
- 查網頁 / 官方文件

例外：≤2 個已知路徑的小讀寫、單檔小修，自己做反而省（外派來回成本更高）。

## 2. 任務 → agent / model 對照表

| 任務型態 | agent type | model | 備註 |
|---|---|---|---|
| 找檔案、掃 repo、確認「有沒有」 | Explore | `haiku` | 錯一次→ `sonnet` |
| 多檔研究、整理現況、事實查核 | Explore | `sonnet` | 指明搜索廣度 |
| 常規實作（spec 明確 + checklist） | general-purpose | `sonnet` | 附 [JUDGMENT.md](JUDGMENT.md) §2 對應 checklist |
| 架構設計、跨模組重構的規劃 | Plan | `opus` | 只回計畫，不動手 |
| 對抗審查、第二意見 | general-purpose | `opus` | 必須 fresh context（新 spawn，不用 SendMessage 續舊 agent） |
| read-back / 跑測試驗證 | general-purpose | `haiku` | 驗收條件要可機械核對 |
| Claude Code 用法、模型參數查證 | claude-code-guide | （內建） | 絕不憑記憶答，一律派它 |

## 3. 交辦三要素（每個 prompt 必含，缺一不發）

1. **目標與動機**：做什麼、為什麼做（動機讓 agent 在邊角情況做對取捨）。
2. **驗收條件**：可核對的清單，agent 自己能判斷「做完了沒」。
3. **回報格式**：段落結構 + 長度上限（例：`≤60 行`）。

## 4. 回報合約（寫進每個交辦 prompt）

- 只回**結論 + 檔案:行號**，不貼大段原始碼（>20 行的產物寫進檔案、回傳路徑）。
- 不確定的寫「未確認」，不准編造——尤其是版本號、模型名、API 參數。
- 失敗也要回報：做了什麼、卡在哪、錯誤全文存到哪個檔。

## 5. 升降級路徑

- `haiku` 錯**一次** → 同 prompt 升 `sonnet`。
- `sonnet` 在**同一子任務連錯兩次** → 升 `opus`，且必須附完整失敗軌跡：原 prompt、兩次的輸出/錯誤、期望結果。不帶軌跡的升級等於重擲骰子。
- `opus` 解出模式後 → 把解法寫成明確步驟，**降回** `sonnet`/`haiku` 批次套用到其餘案例。
- **同一件事最多重試兩輪**。第三輪之前必須：換方法、升級模型、或停下來問使用者（判準見 [JUDGMENT.md](JUDGMENT.md) §4）。

## 6. 驗證不自驗

- 寫程式 / 寫檔的 agent **不能**當自己的驗證者。
- 檔案產出 → 派 fresh agent read-back：給它驗收條件清單，要它逐條核對並回 ✓/✗。
- 程式碼 → 測試（`pnpm test:run`）或實跑（PWA 相關必須 `pnpm build && pnpm start`）。
- 高風險判斷（安全邊界、資料遷移、刪除路徑）→ `opus` 第二意見；或請 2 個 agent 各給答案，主對話評審擇優。
