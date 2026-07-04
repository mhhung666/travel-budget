# 判斷力手冊：rubric 與 checklist

> 讀者：在此 repo 工作的任何 Claude 模型。每條規則附一正例一反例。
> 模型選擇與外派見 [DISPATCH.md](DISPATCH.md)；交辦範本見 [PROMPTS.md](PROMPTS.md)。

## §1 何時升級模型

**規則**：升級的觸發是「錯誤軌跡」，不是「感覺很難」。haiku 錯一次升 sonnet；sonnet 同一子任務連錯兩次、帶完整失敗軌跡升 opus；同一件事最多重試兩輪（門檻數值以 [DISPATCH.md](DISPATCH.md) §5 為準）。任務**開始前**就該用 opus 的只有三類：架構/重構規劃、安全邊界變更（auth、公開端點、隱私契約）、對抗審查。

- ✅ 正例：sonnet 兩次都把 offline mutation 的 replay 修壞 → 收集兩次 diff + 測試輸出，升 opus 並附軌跡。
- ❌ 反例：「這個 i18n 任務看起來很繁瑣」→ 直接用 opus。繁瑣 ≠ 難，checklist 明確的機械工作用 sonnet 就夠。

## §2 何時算真的完成（Definition of Done）

**通用底線**（每個任務都適用）：
1. 需求逐條對回原始請求（不是對自己中途改寫過的版本）。
2. `pnpm test:run` 綠、`npx tsc --noEmit` 乾淨、`pnpm lint` 過。
3. 下方對應的型態 checklist 逐條用 Grep/指令**驗證**過，不是憑印象。

**型態 checklist**：

改/新增使用者可見字串：
- [ ] 四份 catalog 都有該 key：`grep -l "該key" src/i18n/messages/*.json` 列出 4 檔
- [ ] 元件用 `useTranslations`/`getTranslations` 取字串，無 hardcode

新增 server action：
- [ ] `'use server'`；回傳 `ActionResult<T>`（絕不 throw 過邊界）
- [ ] `withAuth(...)` 或 `getSession()` + UNAUTHORIZED early return
- [ ] 碰 trip 資料 → `getTripMembership` 驗證；輸入過 Zod（src/lib/validation.ts）
- [ ] 從 `src/actions/index.ts` re-export；tripIdOrCode 雙接受（除 /api/public/*）

改 Mongoose model / 資料形狀：
- [ ] 既有資料要 backfill → 寫 migrate-mongo 腳本（冪等 + down），不用讀端 fallback 苟且
- [ ] DTO mapper、Zod schema、前端型別同步；提醒使用者其他環境要 `pnpm migrate:up`

刪除路徑（trip/expense/avatar…）：
- [ ] Mongo 手動級聯（無 FK cascade）；R2 blob best-effort 刪（失敗只 log 不擋操作）

PWA / service worker 相關：
- [ ] 只改 `src/sw.ts`，不碰 `public/sw.js`
- [ ] 驗證用 `pnpm build && pnpm start`（dev 模式 SW 停用，看不出結果）

- ✅ 正例：加了字串後跑 grep 確認 4 檔都有 key，才回報完成。
- ❌ 反例：「我已在 en 和 zh 加上翻譯，其他語系應該類似」→ 這叫做了一半，不叫完成。

## §3 何時停下來問使用者

**要問**（滿足任一）：
1. 不可逆或外發：刪資料、寄信/推播給真人、部署、push 到遠端、動線上資料庫。
2. 規格二選一且會改變 UX 或資料形狀（例：新欄位要不要 migration backfill 舊資料）。
3. 發現既有行為疑似 bug，但 CLAUDE.md/docs/git log 查不到是否刻意（見 DIAGNOSIS.md §3）。
4. 要動「動前先問」清單裡的檔案（見 [MAINTENANCE.md](MAINTENANCE.md)）。

**不要問**（自己決定並在回報中說明）：可逆的實作細節、命名、repo 已有慣例可循的選擇、測試怎麼寫。

- ✅ 正例：「/api/public/trips 沒驗 session，看起來像漏洞但 CLAUDE.md 說是刻意——不動，已確認。」
- ❌ 反例：「請問這個 helper 要叫 formatAmount 還是 formatMoney？」→ 這不是使用者的決定，照 repo 現有命名選一個。

## §4 方向錯的訊號（換路，不要再重試）

出現任一訊號，停止當前做法——重新讀錯誤全文、檢查最初假設，然後換方法或升級：

1. 同一個錯誤修了兩次都沒好（第三次重試被禁止，見 §1）。
2. 修 A 壞 B、修 B 又壞 A → 你選的抽象層錯了，退一層看。
3. 一個「小修」滾成 >5 個檔案的連鎖改動 → 大概违反了 repo 既有設計，先讀 CLAUDE.md 對應段落。
4. 需要繞過 type check / lint / test（`as any`、skip、delete test）才能過 → 方向錯，不是驗證太嚴。
5. 開始懷疑「是不是框架/函式庫的 bug」→ 99% 是你的用法錯，先查官方文件（派 agent 查，不憑記憶）。

- ✅ 正例：改 Leaflet z-index 蓋住 dialog 修不好 → 想起 `.leaflet-container { isolation: isolate }` 是既有解法，查 globals.css 而不是繼續加 z-index。
- ❌ 反例：測試一直紅就把 `expect` 改成符合現狀 → 這是把儀表板貼膠帶。

## §5 品質底線怎麼驗（驗證不自驗）

1. **機器驗證優先**：`pnpm test:run`（單檔 `pnpm vitest run <path>`）、`npx tsc --noEmit`、`pnpm lint`。這三樣不過，任何「看起來對」都無效。
2. **實跑**：行為變更至少手動走一次該流程；PWA/SW 必須 production build 驗。
3. **fresh-context 驗證**：>100 行的變更、安全邊界、資料遷移 → 派一個沒參與實作的 agent，給它「驗收條件清單 + 檔案路徑」，要它逐條回 ✓/✗（範本見 PROMPTS.md §審查）。寫程式的 agent 的「我驗過了」不算數。
4. **高風險判斷**：拿 2 個獨立答案（不同 agent 或不同方法）互相對照，不一致處就是要深挖的地方。

- ✅ 正例：改完 settlement 邏輯 → 跑 `pnpm vitest run src/__tests__/settlement.test.ts` + 全套 test:run，再派 agent 覆核 epsilon 邊界案例。
- ❌ 反例：「diff 看起來正確，型別也對，應該沒問題」→ 沒跑過就不是驗證。
