# 封存資料

本區保存測試結果、歷史進度、詳細設計與暫不處理的規劃。文件保留歸檔時的狀態，內文的「目前」「下一步」「待驗收」屬於當時脈絡，不自動成為現行待辦，也不代表已完成或通過驗收。

日常先看 [現有功能](../FEATURES.md) 與 [架構摘要](../ARCHITECTURE.md)。需要追溯或修改特定子系統時，再查以下資料；封存內容不持續同步，與程式碼衝突時以實作為準。

## AI 評測與修正

現行設定及測試指令見 [AI 維護與測試](../AI.md)。以下依時間閱讀，避免把修正前結果當成現況。

- [代表案例與模型對照（2026-09-17～18，修正前）](tests/AI_ACCURACY_2026-09-17.md)
- [OpenAI 相容性與五項缺陷修正驗證（2026-09-18）](tests/AI_FIXES_2026-09-18.md)
- [原始評測證據索引](tests/evidence/AI.md)

## 測試與驗收

日期報告、量測基準與測試方法；JSON 原始證據保存在 [evidence/](tests/evidence/)。

- [測試覆蓋缺口報告（09-04 歷史基準）](tests/COVERAGE_GAPS.md)
- [P 支出背景處理：驗收與啟用清單](tests/EXPENSE_DELIVERY_ACCEPTANCE.md)
- [MongoDB 首次唯讀基線（2026-09-05）](tests/MONGODB_BASELINE_RESULTS.md)
- [MongoDB 索引 before／after（2026-09-05）](tests/MONGODB_INDEX_RESULTS.md)
- [O 線上唯讀與登入驗收](tests/MONGODB_LIVE_ACCEPTANCE.md)
- [MongoDB 查詢基線與索引驗證](tests/MONGODB_QUERY_BASELINE.md)
- [正式站補充驗收（2026-09-11～09-12）](tests/PRODUCTION_ACCEPTANCE_2026-09-12.md)
- [S 正式站驗收（2026-09-14）](tests/PRODUCTION_ACCEPTANCE_2026-09-14.md)
- [正式站背景更新補充驗收（2026-09-15）](tests/PRODUCTION_ACCEPTANCE_2026-09-15.md)
- [正式站檢視器、支出列表與效能補驗（2026-09-16）](tests/PRODUCTION_ACCEPTANCE_2026-09-16.md)
- [同趟旅行金額一致性本機驗收（2026-09-16，第五輪修正及 MongoDB 複驗通過）](tests/AMOUNT_CONSISTENCY_ACCEPTANCE_2026-09-16.md)
- [全站表單 UI／UX 檢查（2026-09-17，F01～F10 結案）](tests/FORM_UIUX_REVIEW_2026-09-17.md)
- [手機 UI／UX 實際操作檢查（2026-09-17，M01～M07 結案）](tests/MOBILE_UIUX_REVIEW_2026-09-17.md)
- [Q3：預載決策與可重跑效能量測](tests/QUERY_UX_PERFORMANCE.md)
- [UI/UX 實作與驗證狀態](tests/UI_UX_EVALUATION.md)
- [Phase 4 可用性測試套件](tests/USABILITY_TEST_PHASE4.md)

## 暫存規劃與待辦

保留候選功能、技術改善及 AI 規劃，暫不據此安排工作。

- [AI 智慧輸入規劃](plans/AI_IMPORT_PLAN.md)
- [技術改善與驗收待辦](plans/IMPROVEMENTS.md)
- [功能 Roadmap](plans/ROADMAP.md)

## 詳細設計與操作

架構全文、UI 規格、離線機制、統計口徑及資料庫遷移操作。

- [架構說明（Architecture）](details/ARCHITECTURE_FULL.md)
- [資料庫遷移（migrate-mongo）](details/MIGRATIONS.md)
- [離線支出安全重送](details/OFFLINE_EXPENSE_RETRY.md)
- [個人統計維護說明](details/PERSONAL_STATS_DASHBOARD.md)
- [會籍等級 tag 顏色規則（TIER-COLORS）](details/TIER-COLORS.md)（會籍功能已下線，僅供歷史參考）
- [Trip Shell 效能基線](details/TRIP_SHELL_PERFORMANCE.md)
- [UI/UX 實作規格](details/UI_UX_SPEC.md)

## 歷史進度與交付

包含整理前的專案狀態快照；舊失敗結果應連同後續複驗閱讀。

- [AI 行程匯入 Phase 0–2 歸檔摘要](history/AI_ITINERARY_IMPORT_PHASES_0_2.md)
- [重要完成里程碑](history/CHANGELOG.md)
- [支出背景通知：實作進度與接續設計](history/EXPENSE_BACKGROUND_DELIVERY.md)
- [R：行程與跨 collection 一致性](history/ITINERARY_CONSISTENCY_PROGRESS.md)
- [S 分階段完成紀錄](history/OFFLINE_EXPENSE_COMPLETION.md)
- [Q：查詢錯誤狀態與前端延遲載入](history/QUERY_UX_PROGRESS.md)
- [專案狀態與文件入口](history/STATUS_2026-09-16.md)
- [UX 優先改善項目（2026-09-17 結案）](history/UX_IMPROVEMENTS_2026-09-17.md)
- [UX 改善項目第二輪（2026-09-17 結案）](history/UX_IMPROVEMENTS_ROUND2_2026-09-17.md)
- [UX 改善項目第三輪（2026-09-17 結案）](history/UX_IMPROVEMENTS_ROUND3_2026-09-17.md)
- [UX 改善項目第四輪（2026-09-17 結案）](history/UX_IMPROVEMENTS_ROUND4_2026-09-17.md)

## Agent 維護參考

工作流程、子系統注意事項與歷史教訓；根目錄 AGENTS.md 與 CLAUDE.md 仍為規則入口。

- [子系統工作守則（非顯而易見的 gotchas）](claude/ARCH-NOTES.md)
- [踩雷教訓簿（append-only）](claude/LESSONS.md)
- [AI Agent 工作流程](claude/WORKFLOW.md)
