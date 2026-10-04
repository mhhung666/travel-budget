# 已完成項目

本區合併保存已完成工作的成果與驗證摘要，不新增逐輪報告。現行功能見 [FEATURES](../FEATURES.md)，未完成工作見 [ROADMAP](../ROADMAP.md)，重跑方式見 [本機驗收](../LOCAL_ACCEPTANCE.md)；詳細修改查 Git，新變更仍記根目錄 [changelog.md](../../../../changelog.md)。

## 登入與線上記帳（截至 2026-10-04）

| 項目             | 已完成範圍                                                                        | 驗證摘要                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登入／旅行       | 登入、旅行列表／摘要、session 恢復、換帳號與私人快取隔離                          | 兩平台 Expo Go 模擬器通過四語、生命週期、網路故障、JWT 自然到期與字級／外觀基線；iOS 軟體鍵盤通過。                                                                                   |
| A 支出／結算唯讀 | 支出分頁、明細、結算 API／畫面與撤權快取保護                                      | Web 1,849、Mobile 124、真 MongoDB 23、額外 QueryClient 9 個案例及隔離 HTTP 通過；兩平台英文／預設字級／淺色 `ledger` 通過。                                                           |
| B 共用新增 API   | 共用新增服務、成員選項、均分預覽、冪等寫入／結果查詢；UUID 歷史相容與金額上限修正 | Web 2,006、Mobile 135、真 replica set 174、額外 DB 5 個案例及隔離 HTTP 通過。                                                                                                         |
| C 已完成部分     | TWD 均分新增、SQLite 待確認恢復；預覽撤權、晚到回應及 refresh 錯誤保留紀錄修正    | Mobile 393、額外 5 個案例、Mobile check 與三平台匯出通過；兩平台 `entry-create`／`entry-lost-restart`、iOS `entry-preview-revoked`／`entry-session` 曾通過。完整 C 裝置驗收仍列待辦。 |

以上為各次驗收結果，並非同一提交重跑的完整矩陣。模擬器為 iPhone 18 Pro（iOS 27）與 Pixel 9（API 36）；C 最後修正只重跑 iOS `entry-session`，其他裝置結果沿用前輪。refresh 400／413／415 故障使用真 SQLite 配合模擬 HTTP，不能當作真 API／裝置注入證據。

當時限制：根 check／正式 build 仍受既有 53 個 Web 型別錯誤阻擋；B／C 的一般 Web 測試有 364 個選擇性案例跳過，不計通過（交易套件另行執行）。四語／字級／外觀完整矩陣、螢幕閱讀器、真機與 development build 尚未完成，也未宣稱已部署或可上架。現行待驗範圍保留在 [本機驗收](../LOCAL_ACCEPTANCE.md#尚未完成的驗收)。

## 本機證據

以下為當時私有暫存位置，可能被系統清理；產物不提交，需複驗時使用現行驗收工具重跑。

- A：`/tmp/tb-a-reaccept-{tests,db,edge,check,build,ios,android}.log`、`/tmp/tb-a-reaccept-edge.test.ts`；裝置產物 `travel-budget-native-IGhYLg`（iOS）、`travel-budget-native-cmMvHo`（Android）。
- B：`/tmp/tb-b-final-{tests,db,http,edge,check,build,quality,export}.log`、`/tmp/tb-b-reaccept-edge.test.ts`。額外 DB 案例可暫放 Web `src/__tests__`，以隔離 replica set 和 Vitest `-t 'REVIEW:'` 重跑後移除。
- C：`/tmp/tb-c-refresh-{tests,check,export,edge,ios}.log`、`/tmp/tb-c-reaccept-edge.test.ts`；裝置產物 `travel-budget-native-Xj5Q1H`（session）、`travel-budget-native-JP7UDx`（預覽撤權，log：`/tmp/tb-c-reaccept-ios.log`）。完整裝置產物路徑見對應 log。
