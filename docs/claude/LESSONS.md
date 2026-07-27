# 踩雷教訓簿（append-only）

> 格式與觸發時機見 [MAINTENANCE.md](MAINTENANCE.md) §3。新條目加在檔尾。超過 30 條或 200 行照 §4 整併。

## 2026-07-04 · 文件會自相矛盾，改文件前先跑事實查核
- 情境：重寫 CLAUDE.md 制度時派 agent 查核全部主張。
- 錯誤：舊 CLAUDE.md 寫著不存在的路徑 `src/app/[locale]/map/`（實際是 `(app)/map/` 與 `(share)/map/`），且與它自己的 i18n 段落矛盾；docs/ARCHITECTURE.md 的 hash_code regex 也與程式碼不符（`{6,8}` vs 實際 `{6,10}`）。
- 教訓：引用任何文件裡的路徑/regex/參數前，用 `ls`/Grep 對程式碼驗證一次；兩份文件說法不同時，以程式碼為準並順手修文件。
- 已回寫：CLAUDE.md 重寫時修正；ARCHITECTURE.md 兩處已修。

## 2026-07-27 · 完成實作時同步更新規劃文件的執行狀態
- 情境：完成 UI/UX Phase 1A 後只更新 CHANGELOG，原評估文件仍顯示為待辦，使用者指出相關文件沒有更新。
- 錯誤：把「完成紀錄」與「規劃狀態」視為二選一，只寫了已做事項，沒有同步原始 roadmap 的完成度、驗收結果與下一步。
- 教訓：由規劃文件驅動的實作，完成時除了 CHANGELOG，也要回到原規劃文件更新狀態、驗收證據、commit 與剩餘限制。
- 已回寫：[UI_UX_EVALUATION.md](../UI_UX_EVALUATION.md) 已建立 Phase 狀態表與逐 Phase 驗證區。
