# 已完成項目

本區合併保存已完成工作的成果與驗證摘要，不新增逐輪報告。現行功能見 [FEATURES](../FEATURES.md)，未完成工作見 [ROADMAP](../ROADMAP.md)，重跑方式見 [本機驗收](../LOCAL_ACCEPTANCE.md)；詳細修改查 Git，新變更仍記根目錄 [changelog.md](../../../../changelog.md)。

## 登入與線上記帳（截至 2026-10-05）

| 項目             | 已完成範圍                                                                                                              | 驗證摘要                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 登入／旅行       | 登入、旅行列表／摘要、session 恢復、換帳號與私人快取隔離                                                                | 兩平台 Expo Go 模擬器通過四語、生命週期、HTTP 網路故障、JWT 自然到期與字級／外觀基線；本次兩平台四語／預設字級／淺色登入回歸通過。                                                               |
| A 支出／結算唯讀 | 支出分頁、明細、結算 API／畫面與撤權快取保護                                                                            | 真 MongoDB 23 個案例及隔離 HTTP 通過；本次兩平台四語／預設字級／淺色 `ledger` 通過，涵蓋三頁支出、明細、結算與帳號隔離。                                                                         |
| B 共用新增 API   | 共用新增服務、成員選項、均分預覽、冪等寫入／結果查詢；UUID 歷史相容與金額上限修正                                       | 真 replica set 174 個案例及隔離 HTTP 通過，含併發／重播、拒絕後不寫入與逐分金額核對。                                                                                                            |
| C 已完成部分     | TWD 均分新增、SQLite 待確認恢復、預覽撤權與登入世代保護；修正明細／儲存頁返回清單、iOS 重開表單的鍵盤完成列及無障礙狀態 | 兩平台各十個核心情境通過；四語 × 預設／最大字級 × 深淺色共 32 組配置通過，預設字級跑 `entry-create`，最大字級跑 `entry-appearance`。儲存頁三個按鈕可捲到，摘要與清單兩種新增入口的返回堆疊通過。 |

模擬器為 iPhone 18 Pro（iOS 27）與 Pixel 9（API 36）。十個核心情境涵蓋新增、提交後丟回應的查詢／重試／重啟、未送出的重試、換帳號、撤權、session 失效、明確拒絕與預覽撤權；這些情境與四語／字級／外觀配置分別驗證，並非每個故障都跑全部配置。新增流程同時核對畫面、隔離 DB 的支出／receipt 筆數與實際金額、代理看到的寫入／查詢／帳號；只有 UI、DB 與流量斷言皆通過才計成功。refresh 400／413／415 故障使用真 SQLite 配合模擬 HTTP，不能當作真 API／裝置注入證據。iOS 軟體鍵盤仍受外接鍵盤設定阻擋，依使用者指示先完成其他驗收；VoiceOver／TalkBack 完整朗讀與操作也尚未通過，原生樹的角色／勾選狀態檢查不代替此項。

建置基線（2026-10-05）：補齊五個套件的 React 型別依賴後，原 53 個 Web 型別錯誤已消除；根 frozen install、contracts check、型別／lint／格式檢查、Web 正式 build、Mobile 三平台匯出及 Expo 相容性檢查通過，未放寬檢查或混用 React runtime。Web 2,006、Mobile 399、真 replica set 交易整合 174 與讀取／金額整合 23 個案例通過；一般 Web 測試另有 364 個選擇性案例跳過，不計通過。

模擬器證據不代表真機、development build、部署或上架驗收。C 剩餘鍵盤與螢幕閱讀器驗收依 2026-10-05 決定暫緩，不計通過；下一階段改為 D1 草稿保存。現行待驗範圍保留在 [本機驗收](../LOCAL_ACCEPTANCE.md#尚未完成的驗收)。

## 本機證據

以下為當時私有暫存位置，可能被系統清理；產物不提交，需複驗時使用現行驗收工具重跑。

- A：`/tmp/tb-a-reaccept-{tests,db,edge,check,build,ios,android}.log`、`/tmp/tb-a-reaccept-edge.test.ts`；裝置產物 `travel-budget-native-IGhYLg`（iOS）、`travel-budget-native-cmMvHo`（Android）。
- B：`/tmp/tb-b-final-{tests,db,http,edge,check,build,quality,export}.log`、`/tmp/tb-b-reaccept-edge.test.ts`。額外 DB 案例可暫放 Web `src/__tests__`，以隔離 replica set 和 Vitest `-t 'REVIEW:'` 重跑後移除。
- C：`/tmp/tb-c-refresh-{tests,check,export,edge,ios}.log`、`/tmp/tb-c-reaccept-edge.test.ts`；裝置產物 `travel-budget-native-Xj5Q1H`（session）、`travel-budget-native-JP7UDx`（預覽撤權，log：`/tmp/tb-c-reaccept-ios.log`）。完整裝置產物路徑見對應 log。
- C 收尾與建置基線：`/tmp/tb-c-close-{frozen,final-check,deliverable-check,tests,final-mobile-tests,build,final-export,expo-check,db,read-db,http}.log`；裝置矩陣 log 為 `/tmp/tb-c-close-matrix.log`、最後返回／丟回應回歸為 `/tmp/tb-c-close-ios-final-matrix.log`；逐項核對摘要為 `/tmp/tb-c-close-evidence-summary.json`，各平台產物路徑見對應 log。產物含畫面與 `entry-results.json`／`auth-trace.json`，只保留在私有暫存目錄。
