# AI Agent 工作流程

> 適用於在此 repo 進行非平凡任務的 coding agent。硬規則仍以根目錄 [AGENTS.md](../../AGENTS.md) 與 [CLAUDE.md](../../CLAUDE.md) 為準。

## 1. 開始前

1. 讀根目錄規則與 [docs/README.md](../README.md)。
2. 依任務只讀一份權威文件；碰特殊子系統再讀 [ARCH-NOTES.md](./ARCH-NOTES.md) 對應小節。
3. 用 `rg` 先定位入口與所有同步契約，不整份讀 lockfile、catalog、生成資產或 build artifact。
4. 確認工作樹狀態，保留使用者既有變更。

## 2. 任務邊界

- 回答/審查：只做讀取、診斷與有證據的結論，不自行改程式。
- 實作：完成要求內的程式、測試、i18n 與必要文件，不做無關的順手重構。
- Schema 變更：先寫可重現且可逆的 migration，再改讀寫端。
- 既有程式看似有 bug：先查 `CLAUDE.md`、`ARCH-NOTES.md` 與 Git 歷史，避免改掉刻意設計。
- 是否能委派或並行工作由目前執行環境與上層指令決定；本 repo 不強制使用特定 agent 或模型。

## 3. 常見同步契約

| 變更 | 必須一起確認 |
| --- | --- |
| 使用者可見文字 | `en`、`zh`、`zh-CN`、`jp` 四份 catalog |
| Server Action | `'use server'`、auth、membership、Zod、`ActionResult<T>`、必要 re-export |
| 刪除旅程資源 | Mongo 手動 cascade、R2 best-effort cleanup、終身紀錄只解除連結 |
| 通知導向 | 站內通知、Web Push、Email 三處語意一致 |
| persisted query shape/key | bump `PERSIST_BUSTER` |
| schema/index/backfill | migrate-mongo `up`/`down`、冪等、部署前提醒 `pnpm migrate:up` |
| shipped behavior + commit | 依 [AGENTS.md](../../AGENTS.md) 判斷 Semantic Versioning bump |

## 4. 驗證

依風險由小到大執行，不用為純文件變更跑完整產品測試：

```bash
git diff --check
pnpm format:check
pnpm lint
npx tsc --noEmit
pnpm test:run
pnpm build
```

- 先跑受影響的單檔測試，再跑完整 suite。
- PWA/Service Worker 行為必須用 `pnpm build && pnpm start`；dev 模式不會啟用 SW。
- i18n 用搜尋確認新 key 出現在四份 catalog，不靠記憶。
- 文件變更檢查 Markdown 相對連結、過時路徑與重複狀態。

## 5. 完成回報

- 先說結果，再列重要檔案與驗證結果。
- 清楚區分：已完成、未驗證、刻意未做、需要使用者決定。
- 不宣稱未執行的測試通過，也不把自動化可及性測試說成真人驗證。
- 只有使用者要求 commit 時才 commit；版本、tag、push、release、deploy 的權限彼此獨立。
