# 歷史與維運索引

日常看 [Web 文件](../README.md)；新變更只記根目錄 [changelog.md](../../../../changelog.md)。本區摘要保留當時結果與限制，不是現行待辦。中間嘗試查 Git，原始證據不改寫。

| 主題             | 查閱入口                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UX 改善          | [四輪合併摘要](history/UX_IMPROVEMENTS.md)                                                                                                                                                                                                       |
| 表單／Web 手機版 | [表單驗收](tests/FORM_UIUX_REVIEW_2026-09-17.md)、[手機版驗收](tests/MOBILE_UIUX_REVIEW_2026-09-17.md)                                                                                                                                           |
| 金額             | [跨頁一致性與 migration 結果](tests/AMOUNT_CONSISTENCY_ACCEPTANCE_2026-09-16.md)                                                                                                                                                                 |
| 離線支出         | [交付／重跑](history/OFFLINE_EXPENSE_COMPLETION.md)、[正式複驗](tests/PRODUCTION_ACCEPTANCE_2026-09-14.md)、[重送契約](details/OFFLINE_EXPENSE_RETRY.md)                                                                                         |
| 背景通知         | [交付摘要](history/EXPENSE_BACKGROUND_DELIVERY.md)、[驗收／維運／回退](tests/EXPENSE_DELIVERY_ACCEPTANCE.md)                                                                                                                                     |
| 行程一致性       | [交易、部署與清理](history/ITINERARY_CONSISTENCY_PROGRESS.md)                                                                                                                                                                                    |
| 查詢／效能       | [交付](history/QUERY_UX_PROGRESS.md)、[量測方法](tests/QUERY_UX_PERFORMANCE.md)、[09-12](tests/PRODUCTION_ACCEPTANCE_2026-09-12.md)、[09-15](tests/PRODUCTION_ACCEPTANCE_2026-09-15.md)、[09-16 補驗](tests/PRODUCTION_ACCEPTANCE_2026-09-16.md) |
| MongoDB          | [基線方法](tests/MONGODB_QUERY_BASELINE.md)、[初測](tests/MONGODB_BASELINE_RESULTS.md)、[索引結果與回退](tests/MONGODB_INDEX_RESULTS.md)、[線上抽查](tests/MONGODB_LIVE_ACCEPTANCE.md)                                                           |
| AI               | [歷史規劃](plans/AI_IMPORT_PLAN.md)、[初期交付](history/AI_ITINERARY_IMPORT_PHASES_0_2.md)、[評估](tests/AI_ACCURACY_2026-09-17.md)、[修正](tests/AI_FIXES_2026-09-18.md)、[原始證據](tests/evidence/AI.md)                                      |
| 可及性／真人測試 | [UI 規則](details/UI_UX_SPEC.md)、[驗證狀態](tests/UI_UX_EVALUATION.md)、[測試提綱](tests/USABILITY_TEST_PHASE4.md)、[舊 coverage](tests/COVERAGE_GAPS.md)                                                                                       |
| 維運             | [遷移](details/MIGRATIONS.md)、[個人統計](details/PERSONAL_STATS_DASHBOARD.md)、[Trip Shell 基線](details/TRIP_SHELL_PERFORMANCE.md)                                                                                                             |
| Agent            | [工作流程](claude/WORKFLOW.md)、[注意事項](claude/ARCH-NOTES.md)、[維護提醒](claude/LESSONS.md)                                                                                                                                                  |
| 其他歷史         | [里程碑](history/CHANGELOG.md)、[09-16 快照](history/STATUS_2026-09-16.md)、[改善候選](plans/IMPROVEMENTS.md)、[功能候選](plans/ROADMAP.md)、[舊架構入口](details/ARCHITECTURE_FULL.md)、[已下線會籍配色](details/TIER-COLORS.md)                |

封存項目的「已完成」以各文件列出的範圍為限；接受免驗與實測通過分開記錄。不要把舊文件中的「下一步」直接加入工作排程。
