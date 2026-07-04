# 快速診斷：此環境最漏 token、最易失焦、最易出錯的三件事

> 讀者：在此 repo 工作的任何 Claude 模型（特別是 Sonnet / Haiku）。
> 每節格式：症狀 → 為何發生 → 修法（照做即可，不需要自行判斷）。
> 本檔是 [DISPATCH.md](DISPATCH.md)、[JUDGMENT.md](JUDGMENT.md) 的依據，改那兩份前先讀這份。

## 1. Token 最大漏洞：主對話自己大範圍讀檔

**症狀**：在主對話直接 Read 整個大檔、跑不加範圍的 `git diff`，或為了找一個函式連續 Read 五、六個檔案，context 被原始碼淹沒後開始忘記任務。

**此 repo 的地雷大檔**（主對話一律禁止整檔 Read）：

| 檔案 | 原因 | 正確做法 |
|---|---|---|
| `pnpm-lock.yaml` | 上萬行 | 永遠不讀；查依賴用 `pnpm ls <pkg>` |
| `public/sw.js` | 編譯產物（gitignored） | 永遠不讀不改；改 `src/sw.ts` |
| `public/geo/countries.geojson` | 生成資產 | 永遠不讀不手改 |
| `src/i18n/messages/*.json`（4 份） | 每份數千行 | 用 Grep 找 key，用 Edit 改該 key，不整檔 Read |

**修法**：
1. 「找東西」一律先 Grep / Glob 收斂到 ≤3 個候選檔，再 Read 需要的區段（用 `offset`/`limit`）。
2. 回答問題需要掃 ≥5 個檔案 → 不要自己掃，派 Explore subagent（見 [DISPATCH.md](DISPATCH.md)），只收「結論 + 檔案:行號」。
3. Read 陌生檔案前先 `wc -l`，超過 500 行就只讀區段。

## 2. 最易失焦：多檔同步契約做一半就以為完成

**症狀**：此 repo 有幾個「一改就是 N 個地方」的契約，模型常改了 1–2 處就宣告完成：

- 使用者可見字串 = **四份** catalog 全改（`en` / `zh` / `zh-CN` / `jp`），最常漏 `zh-CN` 和 `jp`。
- 新 server action = `'use server'` + `ActionResult` + auth + membership + Zod + `src/actions/index.ts` re-export（六件事）。
- 刪除資源 = 手動級聯：Mongo 無 FK cascade，R2 blob 也要 best-effort 刪。

**為何發生**：契約散在多個檔案，中途被工具輸出打斷後，模型憑印象續作。

**修法**：
1. 動手前把該任務型態的 checklist（[JUDGMENT.md](JUDGMENT.md) §2 有現成的）攤進 TodoWrite，一項一勾。
2. 收尾時逐條用 Grep **驗證**（例：`grep -l "新增的key" src/i18n/messages/*.json` 應列出 4 個檔），不憑印象宣告完成。

## 3. 最易出錯：把刻意設計當 bug「順手修正」

**症狀**：repo 有多處看起來像疏漏的刻意設計，模型傾向好心改掉，造成安全或建置事故：

- `/api/public/*` 沒有 session 檢查 → **刻意**（公開分享端點）。加了 auth = 破壞功能。
- `pnpm build` 用 `next build --webpack` 而非 Turbopack → **刻意**（Serwist 需要 webpack plugin，Turbopack 會靜默跳過 SW）。改回預設 = PWA 靜默失效。
- public expenses route 對 `toExpenseDto` 傳 `attachments: false` → **刻意**（收據隱私契約）。
- `hash_code` 長度上限 10（< 12）→ **刻意**（避免與 12-byte ObjectId 混淆）。
- Service worker 不快取 POST / `/api/*` mutation → **刻意**（server action 是 POST RPC）。

**修法**：
1. 先讀 CLAUDE.md 的 NEVER 清單（常載，一定在 context 裡）。
2. 遇到「這看起來是 bug」的**既有**程式碼：先 `git log -S "<該段關鍵字>" --oneline -5` 看提交訊息、查 CLAUDE.md 與 docs/ 是否記載為設計。
3. 查完仍然像 bug → **回報使用者，不要直接改**（判準見 [JUDGMENT.md](JUDGMENT.md) §3）。
