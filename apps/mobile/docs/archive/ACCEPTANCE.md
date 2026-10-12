# 驗證歷史摘要

整理於 2026-10-12，來源截至 `402c2321`；本次未重跑驗收。成果見 [archive](README.md)，未驗與可重跑操作見 [LOCAL_ACCEPTANCE](../LOCAL_ACCEPTANCE.md)。不逐輪追加；需要完整舊數據、原始範圍及失敗記錄時查 Git：

```bash
git show 402c2321:apps/mobile/docs/LOCAL_ACCEPTANCE.md
git show 402c2321:apps/mobile/docs/archive/README.md
git show 402c2321:apps/mobile/docs/ROADMAP.md
```

`/tmp` 與 `/var/folders` 是當時私有產物，可能被清理；不提交帳密、token 或測試帳務正文。腳本就緒、mock／AX、工程匯出與實際原生操作分開計算；歷史通過不是最新工作樹的通過保證。

## B1–B3 與帳本審查

B1 共用單位／v2、B2 PWA／Web、B3 SQLite／Mobile 的開發、隔離 DB／HTTP 與必要檢查有交接證據。B2 當時 PWA 10 組通過，B3 380 項 DB 通過；後續三項修正獨立重跑 Web 35、Mobile／SQLite 23、DB 126 項通過。最新合併開發基線 Web 2,226、Mobile 1,205＋工具 40、隔離 DB 350 項通過，當輪未操作裝置。

舊 v1 相容測試是退役前證據，不要求恢復入口；現行 B5 退役決策見 archive，B4 仍待驗。原 PWA 證據 `travel-budget-offline-vktBOU/results.json`、HTTP `travel-budget-mobile-GHq2CY/next.log`／`travel-budget-mobile-EGI0Ds/next.log` 位於當時 `/var/folders/m4/fgf8qnv17_zcmkxf4s9cmd440000gn/T/`。

## U 靜態審查修正交接（2026-10-08）

已修有效重試期限／resolved 顯示、原幣代碼重複、入口與列表可見數量、負零、revision 重讀與付款標籤索引；姓名採旅程名冊、唯一名不加碼，同名／歷史退路依現行 FEATURES。原「TripChrome 重試無效」指控不成立：options 成功可解除 catalog 隱藏，不放寬授權保護。鍵盤完成列／scope hook 全面整併仍延後。

Mobile 顯示／查詢回歸與工程檢查通過，未重寫交易引擎或契約；歷史名冊一致性限制與 iOS 真實朗讀仍需驗收，不以短測試 ID 宣稱長 ObjectId UX 已驗。

## G2 獨立程式審查（2026-10-08）

三項 P2（衝突保留原額／幣別／匯率整組、一般成員可讀參考匯率、429 落盤失敗保留原期限）及 P3（SQLite／HTTP 等待前捕捉並維持世代）已修並複驗。最後 P3 重跑幣別畫面 22 項及 Mobile check 通過；開發交接 Mobile 1,206＋必要檢查／匯出通過，最後複驗未重跑全套或原生。

## U0／U3a 設計基線

U0 的 26 張 iOS／5 張同資料 Web，加既有資料共 66 張在私有 `/tmp/tb-u0a-20261007/index.html`；[U0 原型及四張原圖](design/u0c.html) 保留於 repository。U3a 以 `8f3c3313` disposable 資料重拍六頁，原圖／metadata 與 [搜尋量測](design/u3a-baseline/search-measure.json) 隨 [索引](design/u3a-baseline/index.html) 歸檔。

目標稿 2× 不是原生最大字級；當時沒有確認帳務。U3a 的 1,000 筆搜尋 getMore／CSOT 問題已於 U3c-2 修正，原失敗不是有效延遲樣本。當時 API／Metro 已停止、DB 已清理，重跑須重建 fixture 並讀實際 bundle 核對環境，避免 Expo 舊 `.env` 誤連正式站。

## E1–E4 原生驗收（2026-10-06～07）

兩平台 Expo Go 已核對建立／加入、寄碼／重設、維護支出、登記／撤銷還款、UUID／DB 單次副作用；包括丟回應、真程序終止前後、SQLite 結案失敗、同程序換帳號、跨旅行互斥／共用期限及 401 refresh 等待競態。iOS／Android 四語各 16 組危險確認通過；最後 Mobile 723／Web 2,054 與工程檢查通過，442 項隔離案例未於最後一輪執行。

原始逾時、定位、環境誤連、事件檔覆寫與工具失敗沒有改寫為通過；只計後續 UI／HTTP／SQLite／DB 完整交叉核對的情境。iOS 部分 gate 事件遺失以原 pending 快照、成功 HTTP 與 DB receipt 補核對；隔離 gate／Keychain 錯誤注入不是實體故障。localhost 收件匣不代表外部郵件投遞，真機／development build／完整閱讀器仍待驗。

當時的 E 私有證據入口（細分操作與失敗脈絡查上述 Git 原文）：

- `/tmp/tb-e-matrix-extra-android-en-1791358034281/display-final-audit.json`
- `/tmp/tb-e-matrix-extra-ios-en-1791358590765/display-final-audit.json`
- `/tmp/tb-e-account-rate-ios-en-1791348868746/account-rate-evidence.json`
- `/tmp/tb-e-account-rate-android-en-1791350211876/account-rate-evidence.json`
- `/tmp/tb-e-account-boundary-ios-en-1791349381853/account-boundary-evidence.json`
- `/tmp/tb-e-account-boundary-android-en-1791350755714/account-boundary-evidence.json`
- `/tmp/tb-e-advanced-android-en-1791302003408/advanced-evidence.json`
- `/tmp/tb-e-advanced-ios-en-1791303051535/advanced-evidence.json`
- `/tmp/tb-e-boundary-rest-android-en-1791304805247/boundary-evidence.json`
- `/tmp/tb-e-boundary-ios-en-1791338028770/boundary-evidence.json`
- `/tmp/tb-e-boundary-android-en-1791304538336`
- `/tmp/tb-e-completion-android-en-1791338651973/completion-evidence.json`
- `/tmp/tb-e-completion-ios-en-1791339776733/completion-evidence.json`
- `/tmp/tb-e-rate-{e1,e1-lookup,e3,e4}-{android,ios}-en-*/rate-evidence.json`
- `/tmp/tb-e-rate-e4-ios-en-1791343293256/rate-evidence.json`
- `/tmp/tb-e-rate-cross-trip-e1-android-en-1791342774719/cross-rate-evidence.json`
- `/tmp/tb-e-rate-cross-trip-e1-ios-en-1791348556959/cross-rate-evidence.json`
- `/tmp/tb-e-payment-pair-evidence.json`
- `/tmp/tb-e-coordinator-e1-android-en-1791347616274/coordinator-evidence.json`
- `/tmp/tb-e-coordinator-e1-ios-en-1791347616275/coordinator-evidence.json`
- `/tmp/tb-e-presend-android-en-1791348428842`
- `/tmp/tb-e-presend-ios-en-1791349677087`
- `/tmp/tb-e-presend-body-android-en-1791351432290`
- `/tmp/tb-e-postsend-android-en-1791352287328`
- `/tmp/tb-e-postsend-ios-en-1791353011294`
- `/tmp/tb-e-guard-rate-mutation-before-fetch-android-en-1791353353932`
- `/tmp/tb-e-guard-rate-mutation-before-fetch-ios-en-1791354653224`
- `/tmp/tb-e-guard-rate-mutation-after-refresh-android-en-1791354801201`
- `/tmp/tb-e-guard-rate-mutation-after-refresh-ios-en-1791355651829`
- `/tmp/tb-e-guard-rate-mutation-before-sqlite-insert-android-en-1791356192385`
- `/tmp/tb-e-guard-rate-mutation-before-sqlite-insert-ios-en-1791356625533`
- `/tmp/tb-e-live-scope-android-en-1791357155426`
- `/tmp/tb-e-live-scope-ios-en-1791357622043`
- `/tmp/tb-e-acceptance-ios-en-1791281610222`
- `/tmp/tb-e-acceptance-android-en-1791281534379`
- `/tmp/tb-e-faults-ios-en-1791285121386`
- `/tmp/tb-e-faults-android-en-1791284774392`
- `/tmp/tb-e-final-basic-audit.json`
- `/tmp/tb-e-supplement-android-en-1791361397646/display-final-audit.json`
- `/tmp/tb-e-supplement-ios-en-1791363439453/display-final-audit.json`
- `/tmp/tb-e-visual-qa-evidence.json`
- `/tmp/tb-e-*.mjs`
- `/tmp/tb-e-supplement-resume.mjs`
- `/tmp/tb-e-*`

## 本機證據

以下為當時私有暫存位置，可能被系統清理；產物不提交，需複驗時使用現行驗收工具重跑。

- D 最後補驗（2026-10-06）：`/tmp/tb-d-final-native/verified-results.json` 保存 22 個原生案例的後端獨立核對，`events.json`、`ios-sqlite/`、`android-sqlite/` 保存時序及 SQLite 檢查點，`ios-chip/`、`android-chip/` 保存最大字級深淺色選取結果與截圖。身分格式 UI 流程 log 為 `/tmp/tb-d-final-ios-identity-final.log`、`/tmp/tb-d-final-android-identity.log`，產物分別為 `travel-budget-native-TeiGxM`／`travel-budget-native-jRfuf2`；早期工具失敗不計通過。最終開發檢查為 `/tmp/tb-d-final-all-tests.log`、`/tmp/tb-d-final-check-final.log`、`/tmp/tb-d-final-export.log`。

- A：`/tmp/tb-a-reaccept-{tests,db,edge,check,build,ios,android}.log`、`/tmp/tb-a-reaccept-edge.test.ts`；裝置產物 `travel-budget-native-IGhYLg`（iOS）、`travel-budget-native-cmMvHo`（Android）。
- B：`/tmp/tb-b-final-{tests,db,http,edge,check,build,quality,export}.log`、`/tmp/tb-b-reaccept-edge.test.ts`。額外 DB 案例可暫放 Web `src/__tests__`，以隔離 replica set 和 Vitest `-t 'REVIEW:'` 重跑後移除。
- C：`/tmp/tb-c-refresh-{tests,check,export,edge,ios}.log`、`/tmp/tb-c-reaccept-edge.test.ts`；裝置產物 `travel-budget-native-Xj5Q1H`（session）、`travel-budget-native-JP7UDx`（預覽撤權，log：`/tmp/tb-c-reaccept-ios.log`）。完整裝置產物路徑見對應 log。
- C 收尾與建置基線：`/tmp/tb-c-close-{frozen,final-check,deliverable-check,tests,final-mobile-tests,build,final-export,expo-check,db,read-db,http}.log`；裝置矩陣 log 為 `/tmp/tb-c-close-matrix.log`、最後返回／丟回應回歸為 `/tmp/tb-c-close-ios-final-matrix.log`；逐項核對摘要為 `/tmp/tb-c-close-evidence-summary.json`，各平台產物路徑見對應 log。產物含畫面與 `entry-results.json`／`auth-trace.json`，只保留在私有暫存目錄。

- D 核心／原生交易：`/tmp/tb-d-device-{d-ios,android,android-rest,android-members,open-ios}.log`、`/tmp/tb-d-native-crash-{ios,android}.log`；主要產物 `travel-budget-native-pmFpKb`／`K1aMqt`／`q47sNQ`／`16kv1b`／`x93FkR`／`PWAi3q`，完整路徑見 log。iOS 當機案例保留原失敗結果，以 `corrected-gate-verification.json` 更正跨案例事件範圍。MongoDB UUID／實際份額／副作用證據在 `/tmp/tb-d-native-db.jsonl` 及各產物的 receipt 核驗檔；只計通過的斷言。
- D HTTP／身分／競態／環境：`/tmp/tb-d-native-errors-{ios-final,android-final,android-rest}.log`（`X2uyyM`／`ocTg4V`／`jfefy1`）；憑證／legacy 為 `/tmp/tb-d-native-auth-{android,android-rest,ios-rest}.log`（`9ADr7o` 前兩項、`h3MiqY` legacy、`USvJAd` 前三項），競態最終重跑 `/tmp/tb-d-native-race-{android,ios}-final.log`（`ntCsji`／`A1z91t`）。跨環境 `/tmp/tb-d-last-{ios,android}-en-default-light.log`（`nyNgXU`／`cSlKtD`）；iOS 原測試只在第二次清理遇到 App 已停止，`corrected-environment-verification.json` 獨立核對 SQL／HTTP／DB 並完成清理。上述未通過的後續案例不計通過。最後顯示阻擋：`/tmp/tb-d-last-{ios,android}-zh-largest-dark.log`、`/tmp/tb-d-last-matrix-results.json`。
- C 鍵盤／VoiceOver：`/tmp/tb-d-c-soft-keyboard-ios-final.log`（`XGbUtv`）；`/tmp/tb-d-a11y-evidence/` 保存實際 `speech.jsonl`、SQL 檢查點及 `verified-{draft,pending}-evidence.json`。VoiceOver 觀察器 `/tmp/tb-d-voiceover/Bridge.xcresult` 逾時不計整體通過，後續 `Bridge2.xcresult` 正常結束；觀察器退出不是功能斷言，已驗操作逐項核對 SQL／流量／DB。

- D 剩餘補驗：`/tmp/tb-d-remaining-{android-refresh-revocation,android-late-races,ios-races}.log`（`CexLDX`、`dIeTHi`；Android 晚到案例路徑見 log）。C 序列 Android 原跑次 `5FkXVa` 保留失敗總結，以 `verified-serial-revocation.json` 獨立核對 enqueue 在真 C probe 後、實際拒絕前，release 後確實到達 HTTP guard。繁中最大／深色重啟為 `pjqAnC`、iOS `7JQNPM` 原失敗及 `/tmp/tb-d-remaining-ios-manual/verified-manual-{restoration,discard}.json`。
- D 顯示／視覺：`/tmp/tb-d-display-{android,android-2,android-3,android-4,ios-2}.log`、`/tmp/tb-d-remaining-matrix-evidence.json` 核對 32 組操作；iOS 原生輔助產物 `/tmp/tb-d-display-ios-manual/<語系>-<字級>-<外觀>/verified.json` 保存 SQL、HTTP、DB 與截圖。日文預設深色觀察器暫時讀取失敗，保留原 log 並獨立補讀捨棄後同一 scope，JSON 註記限制；其餘原工具失敗亦保留。P2 截圖：`/tmp/tb-d-display-ios-manual/jp-largest-dark/members-light.png`，程式位置 `src/components/ui.tsx:294`。
- VoiceOver 錯誤／私人資料：`/tmp/tb-d-remaining-ios-manual/verified-voiceover-errors-privacy.json`、`/tmp/tb-d-remaining-vo-*.json` 保存實際朗讀與核對。`Remaining.xcresult` 觀察器逾時、`Remaining2.xcresult` 正常結束；退出狀態不代替功能通過。最新開發檢查為 `/tmp/tb-d-remaining-final-{tests,check,export,expo}.log`。
