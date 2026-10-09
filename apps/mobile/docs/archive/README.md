# 已完成項目

本區合併保存已完成工作的成果與驗證摘要，不新增逐輪報告。現行功能見 [FEATURES](../FEATURES.md)，未完成工作見 [ROADMAP](../ROADMAP.md)，重跑方式見 [本機驗收](../LOCAL_ACCEPTANCE.md)；詳細修改查 Git，新變更仍記根目錄 [changelog.md](../../../../changelog.md)。

## 登入與線上記帳（截至 2026-10-05）

| 項目             | 已完成範圍                                                                                                              | 驗證摘要                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 登入／旅行       | 登入、旅行列表／摘要、session 恢復、換帳號與私人快取隔離                                                                | 兩平台 Expo Go 模擬器通過四語、生命週期、HTTP 網路故障、JWT 自然到期與字級／外觀基線；本次兩平台四語／預設字級／淺色登入回歸通過。                                                               |
| A 支出／結算唯讀 | 支出分頁、明細、結算 API／畫面與撤權快取保護                                                                            | 真 MongoDB 23 個案例及隔離 HTTP 通過；本次兩平台四語／預設字級／淺色 `ledger` 通過，涵蓋三頁支出、明細、結算與帳號隔離。                                                                         |
| B 共用新增 API   | 共用新增服務、成員選項、均分預覽、冪等寫入／結果查詢；UUID 歷史相容與金額上限修正                                       | 真 replica set 174 個案例及隔離 HTTP 通過，含併發／重播、拒絕後不寫入與逐分金額核對。                                                                                                            |
| C 已完成部分     | TWD 均分新增、SQLite 待確認恢復、預覽撤權與登入世代保護；修正明細／儲存頁返回清單、iOS 重開表單的鍵盤完成列及無障礙狀態 | 兩平台各十個核心情境通過；四語 × 預設／最大字級 × 深淺色共 32 組配置通過，預設字級跑 `entry-create`，最大字級跑 `entry-appearance`。儲存頁三個按鈕可捲到，摘要與清單兩種新增入口的返回堆疊通過。 |

模擬器為 iPhone 18 Pro（iOS 27）與 Pixel 9（API 36）。十個核心情境涵蓋新增、提交後丟回應的查詢／重試／重啟、未送出的重試、換帳號、撤權、session 失效、明確拒絕與預覽撤權；這些情境與四語／字級／外觀配置分別驗證，並非每個故障都跑全部配置。新增流程同時核對畫面、隔離 DB 的支出／receipt 筆數與實際金額、代理看到的寫入／查詢／帳號；只有 UI、DB 與流量斷言皆通過才計成功。refresh 400／413／415 故障使用真 SQLite 配合模擬 HTTP，不能當作真 API／裝置注入證據。本次已斷開 iOS 外接鍵盤，以軟體鍵盤完成 `entry-create`：必填／小數驗證、三成員預覽、改值使預覽失效、重新預覽與明確確認，並核對單筆 receipt／尾差／副作用。VoiceOver／TalkBack 記帳／恢復流程仍未全部通過，原生樹的角色／勾選狀態檢查不代替此項。

建置基線（2026-10-05）：補齊五個套件的 React 型別依賴後，原 53 個 Web 型別錯誤已消除；根 frozen install、contracts check、型別／lint／格式檢查、Web 正式 build、Mobile 三平台匯出及 Expo 相容性檢查通過，未放寬檢查或混用 React runtime。Web 2,006、Mobile 399、真 replica set 交易整合 174 與讀取／金額整合 23 個案例通過；一般 Web 測試另有 364 個選擇性案例跳過，不計通過。

模擬器證據不代表真機、development build、部署或上架驗收。C 軟體鍵盤已補驗，完整螢幕閱讀器仍待完成；D1／D2／D3 主要裝置情境已通過，未驗組合仍不計通過。現行待驗範圍保留在 [本機驗收](../LOCAL_ACCEPTANCE.md#尚未完成的驗收)。

## D 草稿、離線入口與待送佇列（2026-10-05）

已實作每個環境／帳號／旅行一份原始輸入草稿、保存狀態與失敗重試、續填／明確捨棄、重新授權與失效選項修正，以及同一 SQLite 交易交給 C 的 UUID／凍結內容。D2 保存最小旅行名稱與成員選項快照、更新時間和持久化拒絕標記；SecureStore 將本機帳號身分與憑證原子保存，離線冷啟動可在受限模式建立／續填草稿。未確認的草稿不自動寫帳；直接入帳須線上授權、新預覽與確認，D3 的均分規則確認另見下述成果及契約。

開發驗證涵蓋真 SQLite 重開、schema 升級、修訂／捨棄／快照與拒絕競態、晚到選項回應、保存／交接／清理失敗、子程序終止、帳號／環境隔離、429 持久化等待、409 衝突及 refresh 失敗。D3 複審修正撤權檢查至每次 fetch 前，包含 C 序列／SQLite 等待與 refresh 重送；原 UUID／內容保留，後续回應不縮短等待或消除衝突。產品複審修正 409／C 未結案的旅行內等待、有效 refresh token 的保留，以及 schema 6 帳號／環境限速持久化：C 恢復與手動操作共同遵守，捨棄／移回／結案不清除期限。驗證結果見根目錄 [changelog](../../../../changelog.md)。2026-10-06 再修正 D 將本機攔截套用新 429 最少 30 秒退避、造成原 120 秒期限延至 149 秒的 P2；C 回傳原始毫秒期限，D 原樣持久化。四個真 SQLite 回歸確認 load／receipt／POST／refresh 在剩 999 毫秒時攔截，重啟後於原期限沿原 UUID 恢復。

裝置複驗（2026-10-05～06，本輪已收束）：iPhone 18 Pro／iOS 27 與 Android API 36 Expo Go，使用獨立一次性 MongoDB replica set、隔離帳號、模擬器原生 SQLite 與 HTTP 代理。以下通過基本情境，不代表全部 D 操作表完成：

| 情境               | 實際證據與範圍                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 草稿重啟／捨棄     | 兩平台保留部分金額 `12.`、不完整日期、說明、分類及付款人，重啟前後 SQLite 原始輸入與 draft ID 相同；明確捨棄後重啟不復活。未確認流程 HTTP／expense／receipt 均為零。                                                                                                                                                                                                         |
| 離線冷啟動／身分   | iOS 使用 HTTP 斷線；Android 開啟模擬器飛航模式並關閉 Wi-Fi 與行動數據，重啟仍可續填，線上恢復按鈕在真斷網時停用，預覽／確認不可送出。恢復有效登入本身未自動入帳。iOS 真機飛航未驗。                                                                                                                                                                                          |
| 私人資料／撤權     | 兩平台 A→B→A，B 看不到 A 原始輸入或未載入的選項，A 可續填；旅行收到實際後端 404 後隱藏，斷線冷啟動仍不顯示。SQLite 最小快照只有旅行名稱、成員／分類、更新時間及拒絕標記，無帳務、token 或預覽。跨 API 環境另已補驗；拒絕存檔失敗另見快照故障。                                                                                                                               |
| SQLite 故障        | 兩平台真 DB 觸發器阻擋保存、捨棄、入佇列與 pending 插入，畫面顯示失敗、原落盤內容保留、HTTP／DB 零寫入。DB 開啟失敗阻擋表單送出，還原原 DB 後可續填；結案清理失敗保留 queue／pending，重啟查原 receipt 清理，只入帳一次。                                                                                                                                                    |
| 多筆／凍結恢復     | 兩平台兩筆 100／200 的 UUID／原始意圖跨重啟不變，成功後 queue／pending 清空；每 UUID 只送一次。兩平台三成員分攤與尾差已重跑，receipt 實際份額 100 元為 33.34／33.33／33.33，200 元為 66.67／66.67／66.66。提交後丟回應／斷線並冷啟動，只查 receipt，POST 一次；native pending 的 UUID／payload SHA-256 與 HTTP 一致。MongoDB 核對原 UUID receipt、實際份額及每筆副作用一次。 |
| 修改／成員異動     | 兩平台 queued 可移回草稿修改、重新確認或捨棄，prepared 不可修改／捨棄；成員異動暫停，原名單恢復仍不自動送出，明確重新確認才入帳一次。                                                                                                                                                                                                                                        |
| 交易當機           | 兩平台在草稿 pending 插入前／後、COMMIT 後與清理前強制結束；佇列另涵蓋確認 INSERT 前／後與 prepared 交易前／後。未提交回滾、已提交保留原 UUID／凍結內容，重啟查原 receipt，後端只入帳一次。iOS 最後總結曾混入前一案例事件，依案例重驗 gate 證據已通過。                                                                                                                      |
| 登入到期／快照故障 | 兩平台離線捨棄後可建立不完整新草稿；後端 session 到期後要求登入，原輸入保留且未入帳。快照更新失敗不覆蓋舊資料／時間；拒絕標記寫入失敗時目前執行立即隱藏並顯示讀取錯誤，修復後拒絕落盤，成功重新取得選項才解除。                                                                                                                                                              |
| SQL 等待撤權       | 兩平台在 prepared 交易插入 pending 後實際暫停，等待期間後端撤權、App 收到拒絕，再釋放 SQLite；保留原 UUID／凍結內容，HTTP POST 與後端寫入均零。另已完成兩平台 C 序列等待及真 refresh 重送前撤權；同一原 UUID／凍結內容保留，後續 POST 為零。                                                                                                                                 |
| HTTP 限速／衝突    | iOS 的 POST 與 receipt lookup 429 已驗：實際 180 秒等待跨冷啟動及 C 手動操作保持，期限後沿原 UUID／內容恢復。409 後查詢被拒絕，仍持久化衝突且不自動重送。Android POST／查詢 429 與 409 也已通過；查詢 429 使用提交後丟回應並立即斷線，避免 Android HTTP 自動重試先行消耗故障。                                                                                               |
| VoiceOver 已驗部分 | iOS 27 使用原生 VoiceOver 取得實際朗讀：保存狀態、輸入、radio／checkbox 選取狀態、停用提交與離線確認說明可讀。實際單點選取焦點、雙點切換成員及捨棄可操作；捨棄後輸入清空。主要續填／佇列操作另見下述補驗；必填／格式／日期／逾時錯誤與換帳號／撤權焦點另已補驗；其餘閱讀器限制見下述摘要。                                                                                   |

兩平台 refresh 500 與憑證輪替保存失敗已驗：原 UUID／凍結內容保留，換 B 帳號不洩漏，回 A 後只入帳一次；兩平台舊格式憑證離線不可當作已驗證身分，重新授權後原草稿保留。憑證保存失敗為原生 adapter 在 SecureStore 寫入前注入錯誤，不代表實體 Keychain 損壞。兩平台延遲保存返回／捨棄也已通過，核對新世代確實落盤後冷啟動不復活舊輸入。兩平台跨 API 環境隔離也已通過：另一環境看不到原草稿、選項或佇列，返回原環境 UUID／內容不變，HTTP／DB 零入帳。兩平台晚到選項／預覽也已補驗：真後端 200 保留至切背景、另一表單學到實際 404 後才釋放，原 UUID／原始輸入保留，queue 為 access attention、pending 為零，快照拒絕且無選項，POST／DB 零寫入。這些不能以已有開發測試取代裝置證據；D 核心交付完成，完整裝置驗收仍有暫緩項目；完整契約及待驗清單見 [本機驗收](../LOCAL_ACCEPTANCE.md#d1-草稿驗收交接)。真機與 development build 另列 F。

VoiceOver 已實際完成文字／數字輸入、SQLite 保存失敗重試、離線冷啟動續填、均分入佇列及移回草稿。重新授權後取得新預覽並明確送出；丟回應保留 pending，連線恢復由前景 receipt 查詢清理，POST／expense／receipt／副作用各一次。另取得必填、金額格式、無效日期、逾時錯誤與停用按鈕的實際朗讀；保持閱讀器開啟完成 A→B→A，登出及撤權後焦點移至一般入口／無權限提示、原私人欄位與選項隱藏，回 A 原始草稿保留。忙碌 AX 狀態已確認，實際忙碌朗讀與完整觸控手勢／C 手動恢復操作尚未全部核對。2026-10-06 使用者決定 TalkBack 保留待人工驗收：Android 視窗無法接入電腦操作工具，不把角色樹當作實際閱讀器證據。

D 顯示的 32 組操作與資料核對已完成：每平台四語 × 預設／最大字級 × 深淺色，涵蓋真 SQLite 保存失敗／重試、明確均分入佇列、101 元內容、移回續填、快照更新時間及捨棄，全部 HTTP／DB 零入帳。Android 一組最終捲動及 iOS 14 組由原生輔助操作獨立補證；保留原自動化失敗，不稱整次工具執行通過。iOS 最大字級仍用既有 deep link，旅行卡片導覽未驗；原生 AX 設值也不代替所有配置的完整軟體鍵盤。先前繁中最大／深色的 Android 冷啟動續填已重跑通過，iOS 不完整日期原樣恢復／捨棄已有獨立手動 SQL／HTTP／DB 證據。

視覺驗收發現的 P2 已修正：iOS 最大輔助字級的多行長名稱，原本超出 `borderRadius: 999` 的橢圓背景，淺色已選取白字難以辨識。共用 Chip 改為固定圓角並保留完整名稱與字級縮放；兩平台隔離原生畫面使用產品 Chip 補驗，最大字級深淺色的長名稱完整落在背景內，文字可辨識，選取→取消→再選取均通過。此項為共用元件視覺及點選驗證，不宣稱重跑整份表單矩陣。D 僅剩 VoiceOver 未核對範圍與 TalkBack 人工驗收；依 2026-10-06 使用者決定，剩餘驗收暫緩，不阻擋合併 master 與進入 E，未驗項目不計通過。真機／development build 另列 F，完整待辦見 [本機驗收](../LOCAL_ACCEPTANCE.md#尚未完成的驗收)。

2026-10-06 身分／佇列補驗：兩平台 `draft-incompatible` 經真正 SecureStore 保存有效 token 與缺欄位的舊身分 DTO，離線冷啟動不開啟私人資料，恢復線上後刷新身分、再次離線可續填原草稿，HTTP／DB 零入帳。另以隔離原生測試畫面執行產品 C／D 引擎、expo-sqlite 與 SecureStore，每平台 11 個、共 22 個案例通過：A 的 409／原 C pending 只阻擋 A，B 可送且重啟後仍正確；429 期限跨捨棄／移回／結案／衝突及冷啟動保留；SQLite 讀取／狀態等待與 refresh 回應完成、憑證發布前新增 429，剩不到一秒仍阻擋 POST／receipt，原期限到期後同 UUID／內容只入帳一次。使用真實 120 秒等待，HTTP 代理注入 409／429／401，成功寫入由隔離真後端處理；獨立 MongoDB 核對全部 22 個 UUID 的 expense／receipt／成功 POST 各一。這些是原生引擎整合證據，不取代完整 UI 或閱讀器手動操作。599 個測試（568 個功能、31 個工具）、Mobile check、三平台匯出與 Expo 相容性檢查通過。

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

## E1–E4 基本使用流程（2026-10-06～2026-10-07）

完成建立／加入旅行與邀請、註冊／Email 驗證碼重設、支出編輯／刪除、還款／撤銷；保留 C／D 的持久化、帳號／環境隔離、UUID、撤權與限速保護。修正多成員通知、重設碼恢復、衝突保留輸入及同名成員結算識別；現行規則見 [FEATURES](../FEATURES.md) 與 [契約](../BACKEND_CONTRACT.md)，已完成設計細節查 Git。

最新紀錄：兩平台 Expo Go 基本操作、程序終止／恢復、限速與隔離故障矩陣，以及四語／字級／外觀與危險確認通過；Mobile 723／Web 2,054 項、開發檢查、三平台匯出與 Web build 通過。一般 Web 測試另 442 項隔離整合案例未在最後一輪執行，不計該輪通過。實際證據、早期失敗與補驗範圍保留於 [E 原生驗收紀錄](../LOCAL_ACCEPTANCE.md#e1e4-原生驗收紀錄2026-10-062026-10-07)，本次文件整理未重跑。

限制：development build、真機、完整閱讀器與外部郵件投遞未驗；Email 額度遭他人耗盡仍是已知待修問題，見 [E2 契約](../BACKEND_CONTRACT.md#e2-註冊與-email-驗證碼重設)。後續統一列 [F](../ROADMAP.md)，未部署／執行遠端 migration。

## G1 旅行與成員管理（2026-10-08）

已分片提交 G1a 設定／個人封存（`afaf593`）、G1b 全名冊／虛擬建立與更名（`82e1cc0`）、G1c 角色／移除／退出／旅行刪除及 Web 認領連結（`5e4b7e6`）。Web／HTTP 共用交易與授權，確認版本、SQLite／原 UUID 恢復及同旅行互斥延用既有機制；移除保留帳務，退出／刪除以最小 receipt 結案並隱藏本機資料。

開發交接記錄 Web 2,093、Mobile 1,078、隔離交易 249 項及根檢查／建置／匯出通過；本輪另重跑 Mobile 85、Web API 35 項重點回歸通過，未重跑歷史全套證據。詳細檢查與未驗項目集中於 [G1 交接](../LOCAL_ACCEPTANCE.md#g1a-旅行資料與封存交接)。

此處封存已實作範圍，不代表完整獨立驗收、部署或裝置通過。目的地僅保留／清除／手動地址與真實座標；認領使用 Web，原生表單／deep link 未做。iOS／閱讀器待驗、Android 延後；後續功能依 [G2 規劃](../ROADMAP.md#g2多幣別記帳)。

## B5 v1 退役與 v2 整併（2026-10-09）

B5a–B5e 已逐片審查並合併 master，結案提交 `bea57178`；詳細變更查 Git。

- **完成範圍**：共用 auth／會員／公開 handler 與帳務服務；Mobile 新請求及 C／D／E 只用 v2；移除 32 個原生 v1 route、11 個舊公開 route、20 個舊 action 身分及無呼叫服務。OpenAPI 只發布 v2；非 TWD 參考匯率 503 與 AI 行程匯入 context 已修正。
- **退役決策與保留邊界**：使用者於 2026-10-09 確認沒有已分發給真實使用者的 App／PWA，舊待送資料僅為可丟棄 fixture，因此取消原舊 client 終局拒絕協議的前置要求。舊本機意圖不改標、不重送，僅依明確捨棄／未 prepare 草稿恢復流程處理；歷史缺欄位 TWD、decoder、receipt 指紋／UUID 規則、原環境識別與帳號隔離保留。不清空歷史帳務，也不把原生 v2 結果不明操作視為可任意捨棄。
- **結案複驗**：Web 2,308 項、Mobile 1,234 項＋工具 48 項、7 檔隔離 DB 259 項、真 HTTP 34 段、正式 PWA 11 項，以及 frozen install、contracts generate／check、根 check、build、三平台匯出通過。實作者另報較廣 DB 531 項通過與帳號索引／行程並發 7 項既有失敗；結案複驗未重跑該無關範圍，不宣稱全 DB 套件通過。

此處封存程式交付，不代表原生裝置或部署通過。iPhone／iPad、跨端／閱讀器待驗集中在 [B 交接](../LOCAL_ACCEPTANCE.md#b-基準幣別驗收b1b2b3-實作交接)，Android 延後，非 TWD 建立仍預設關閉；部署／開放另依使用者指示。後續整理已移除共用服務內的 v1 分支（已審查通過，見下段），不阻擋 [G3](../ROADMAP.md#下一階段g3-起)。

**B5 後續：共用服務 v1 分支整理（已審查通過）**：移除服務內的 v1 分支與版本判斷，只留 v2 路徑；無版本 receipt 拒絕重播，歷史 TWD 資料與 v2 指紋／UUID 規則保留。付款、支出維護、成員、旅行管理的首次回應與保存的終局一致（含 `ledger`），相片 DTO 移除錯誤的 TWD `ledger`。服務測試逐次建立獨立 context，保留 v2 指紋金樣、v1 receipt 拒絕與版本分支防回歸檢查。

獨立複驗：根 check、Web 2,311 項、隔離 replica set 14 檔 349 項、真 HTTP 34 段通過。實作者另報 frozen install、Mobile 1,234 項、build、三平台匯出、PWA 11 項及較廣 DB 531 項通過（另有帳號索引／行程並發 7 項既有失敗）；本輪審查未重跑該額外範圍。未操作原生裝置，未部署。
