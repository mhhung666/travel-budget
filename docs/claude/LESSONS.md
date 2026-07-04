# 踩雷教訓簿（append-only）

> 格式與觸發時機見 [MAINTENANCE.md](MAINTENANCE.md) §3。新條目加在檔尾。超過 30 條或 200 行照 §4 整併。

## 2026-07-04 · 文件會自相矛盾，改文件前先跑事實查核
- 情境：重寫 CLAUDE.md 制度時派 agent 查核全部主張。
- 錯誤：舊 CLAUDE.md 寫著不存在的路徑 `src/app/[locale]/map/`（實際是 `(app)/map/` 與 `(share)/map/`），且與它自己的 i18n 段落矛盾；docs/ARCHITECTURE.md 的 hash_code regex 也與程式碼不符（`{6,8}` vs 實際 `{6,10}`）。
- 教訓：引用任何文件裡的路徑/regex/參數前，用 `ls`/Grep 對程式碼驗證一次；兩份文件說法不同時，以程式碼為準並順手修文件。
- 已回寫：CLAUDE.md 重寫時修正；ARCHITECTURE.md 兩處已修。
