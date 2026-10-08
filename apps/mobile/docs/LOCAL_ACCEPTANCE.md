# 本機登入與旅行驗收

此流程啟動 `apps/web` 的實際 HTTP routes 與獨立 MongoDB，提供可丟棄的測試帳號。自動檢查不依賴正式資料或遠端服務，也不取代原生 SecureStore、操作介面與真機驗收。

## B 基準幣別驗收（B1／B2／B3 實作交接）

固定案例、新舊版本矩陣與 B1–B4 條件統一見 [B0 規格](ROADMAP.md#b旅程基準幣別改造規格2026-10-08)。B1 後端已實作，契約／開關見 [B1 API](../../web/docs/MOBILE_API.md#b1-基準幣別契約)；B2 Web 已實作，行為與恢復見 [B2 架構](../../web/docs/ARCHITECTURE.md#b2-web-帳本與恢復)；B3 Mobile／SQLite 已實作，見 [B3 架構](ARCHITECTURE.md#b3mobile-帳本與舊資料恢復)；B4 獨立操作仍待完成，非 TWD 建立預設關閉。

B5a 已完成靜態依賴盤點、保守過渡決策與 [新請求／歷史恢復矩陣及退役門檻](ROADMAP.md#b5a-呼叫依賴與退役門檻)；產品程式未變更，舊版外部使用未確認，完整 v1 保留。B5b-1（v2 auth／me、明確回應契約）已實作，Web 單元、帳號真 DB 整合與 `test:mobile-api` 真 HTTP 已獨立複驗通過，程式審查未發現阻擋問題；B5b-2（會員業務 route 共用操作）已通過獨立審查，Web 2,303 項、8 檔隔離 DB 236 項與真 HTTP 複驗通過；B5b-3～e 待實作，矩陣中其餘新增案例與 iPhone／iPad 升級操作尚未執行；驗收由其他人補證據，Android 延後，不把 B5a 文件核對列為裝置或退役通過。

| B1 開發檢查              | 結果／範圍                                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 單元／行為               | Web 2,139 項；Mobile 1,172 項＋工具 34 項通過。新增 20 個契約／分角／匯率／請求隔離案例；未連外取得即時匯率。                                                                                                                                                                      |
| 隔離 MongoDB replica set | 14 檔 347 項通過，含新 B1 15 項：TWD／USD／JPY 建立、建立開關、相同 UUID 併發、v1 加入拒絕、USD 20.10 分攤、3.35 部分付款及撤銷、錯單位終局、actor 預算、設定不改基準、損壞單位／回滾與退出後重播。只用工具自建可丟棄資料庫。                                                      |
| 真 HTTP                  | `pnpm --filter @travel-budget/web test:mobile-api` 通過原 C／E／G 案例及 `verify-ledger-api.mjs` 的 v2 schema、v1 篩選／深連結／加入阻擋、原 UUID／版本隔離與 v2 丟回應恢復、USD 支出／付款／撤銷與缺單位 503。原 v1 receipt 指紋與回應保留；核對 expense／payment／receipt 筆數。 |
| 工程檢查                 | frozen install、contracts、根 check／test:run／build、三平台匯出與 Expo 相容性通過。原生 bundle 不等於裝置驗收。                                                                                                                                                                   |

B2 開發檢查：Web 單元／行為 2,168 項、Mobile 1,172 項＋工具 34 項、隔離 replica-set 15 檔 362 項通過（含新 Web 帳本 15 項）；frozen install、根 check／contracts／build、三平台匯出與 Expo 相容性通過。涵蓋四種分攤、USD／JPY、舊 TWD／v1 阻擋、衝突與撤權、設定 receipt、原 UUID 恢復、429 保存失敗與雙分頁舊摘要基線。正式 build 下 PWA 10 組通過：真 IndexedDB／SW 離線重啟、丟回應只寫一次、撤權後修正、存檔失敗不送出、雙分頁、連續拒絕恢復、讀取快取遺失、新舊公開 HTTP 隔離、外幣／非均分基本編輯一次更新，以及 JPY 0.01。只用工具自建的本機可丟棄資料庫及合成匯率；本輪沒有操作裝置。真 HTTP v1／v2、E／G 寫入回歸及非 TWD 關閉開關／損壞資料拒絕矩陣亦通過。合成證據：PWA `/var/folders/m4/fgf8qnv17_zcmkxf4s9cmd440000gn/T/travel-budget-offline-vktBOU/results.json`；HTTP 診斷 `/var/folders/m4/fgf8qnv17_zcmkxf4s9cmd440000gn/T/travel-budget-mobile-GHq2CY/next.log`。

B3 開發檢查：Mobile 65 檔 1,203 項＋工具 34 項、Web 2,168 項及隔離 replica-set 15 檔 380 項通過；frozen install、根 check／contracts／build、三平台匯出與 Expo 相容性通過。新增案例涵蓋 USD 20.10 均分／TWD 外幣、JPY 0.01／100.01、四語閱讀／結算與表單、缺 ledger／錯單位阻擋、v2 丟回應查原 UUID、加入前未知基準、舊 v1 恢復、真 SQLite schema 8→9 中斷回滾／檔案重開、429 原期限與非 TWD 不入 D 佇列。真 HTTP v1／v2、C／E／G 寫入及資料庫筆數矩陣通過；只用隔離資料庫及合成匯率，HTTP 診斷 `/var/folders/m4/fgf8qnv17_zcmkxf4s9cmd440000gn/T/travel-budget-mobile-EGI0Ds/next.log`，Mobile 故障案例見 `src/features/expenses/ledger.test.ts`。未操作裝置，不把 mock 畫面或匯出視為原生驗收。

帳本審查修正已實作：Web 明確寫入拒絕保存 rejected 並解鎖，補查拒絕仍保留未知結果；已刪支出的新更新保存 RESOURCE_GONE，已提交更新重播沿用原 receipt／實際 BSON revision。建立地點經 schema 驗證，帳本／金額錯誤保留原碼；結算改只讀 snapshot，跨旅行驗證固定兩次子文件探查，C 由服務查原 UUID，表單恢復公開 GET／SW 日快照及共用換算。回歸涵蓋存檔失敗、邀請碼修正、刪除後重播、連續改付款人／分攤、撤權、40 趟批次查詢與公布日期不一致；補齊四語 RESOURCE_GONE 及恢復被拒後保留說明／關閉不刪紀錄，年度回顧保留所有名冊預算的單位檢查。與本次補修合併的最新開發檢查見下方；未操作裝置或宣稱 PWA 實際離線畫面驗收，非 TWD 建立仍關閉。

**獨立程式審查修正（2026-10-08）**：`edb94f22` 至 B4 及未提交修正的三項發現已補修並通過獨立程式複驗，未發現這三項修正的新增阻擋問題。本輪實際重跑 Web 35 項、Mobile／真 SQLite 23 項、隔離 MongoDB 交易 126 項及 contracts 同步檢查，全部通過；未重跑完整工程檢查、真 HTTP 或裝置操作。原暫時探針已改為以下保留的回歸案例。

- **P1／v2 新增驗證拒絕：已修**。合法凍結請求的付款人／分攤／金額等業務拒絕，在寫支出前、同一授權父旅行交易保存 `VALIDATION_ERROR` receipt；原 UUID／指紋與終局不變，先核對既有提交。真 replica-set 涵蓋 TWD／USD／JPY 的預覽後退出、重新加入／不同 body／新確認、併發拒絕、已提交後成員退出、已知驗證與收據保存失敗回滾；真 SQLite 檔案重開涵蓋拒絕／丟回應補查、恢復原始輸入及下一筆正常送出。一般 400、schema 拒絕與未知故障仍不清除不明操作，v1 保留原行為。
- **P2／非 TWD AI 草稿：已修**。文字與收據兩入口使用伺服器 v2 context；真權限服務的 USD／JPY route 回歸確認可取草稿，撤權及其他旅行收據 key 在 provider／private storage 前拒絕；舊 v1 非 TWD 阻擋保留。
- **P2／旅行列表查詢：已修**。共用列表改 `validateLedgerChildrenBatch`；1／20／40 趟混合幣別固定兩次子文件探查，摘要仍整批兩次；Mobile 分頁每次固定相同查詢數，仍會讀完整帳號列表。損壞支出／還款單位在摘要前拒絕，舊 v1 過濾及空帳號保留。

本次開發檢查：Web 2,226 項、Mobile 1,205 項＋工具 40 項、隔離 replica-set 13 檔 350 項、真 HTTP、frozen install、根 check／contracts／build、三平台匯出及 Expo 相容性通過；實作回歸使用合成資料／provider stub 與自建可丟棄 DB，不代表瀏覽器／原生畫面驗收。

**他人仍待驗**：新舊 Server Action／HTTP 完整矩陣；B4 核對 Web、iPhone＋iPad 的操作／重啟、原 UUID、舊草稿／SQLite、撤權／429、公開輸出及精確資料庫帳務。Android 裝置延後，未驗不計通過；未部署、未跑遠端 migration、未開啟非 TWD。

### B4 隔離工具與操作交接

工具已補齊；**B4 獨立 Web／iPhone／iPad 驗收仍待執行**，不因 HTTP 或核對工具通過而開放非 TWD。以下只操作工具自己建立的 loopback 資料庫，fixture／控制憑證及輸出保留在暫存目錄，不提交 Git。

```bash
# 根目錄：預設保留正式規則，非 TWD 建立關閉，但提供既有 USD／JPY 旅行
pnpm --filter @travel-budget/web dev:mobile-api
# 要驗「建立非 TWD」時，改用這個指令；開關只影響該次自建後端
pnpm --filter @travel-budget/web dev:mobile-api --ledger-creation
```

輸出的 `fixture.json`（0600）新增 `ledgerAcceptance`：帳號 `b4-a`／`b4-b`／`b4-c`，依序為 A（管理員）／B／C；密碼沿用該次 fixture。三趟空旅行為舊 TWD（DB 缺基準）、USD、JPY，邀請碼與 ID 在檔案內。USD 預設記帳 JPY、自訂 JPY 0.0067／TWD 0.03，A 私人預算 10 USD。非 TWD 關閉開關時，既有旅行仍可讀寫；一般模式與本機開啟模式都需核對。啟動先跑真 HTTP／DB 核對，再清除這三趟工具產生的帳務與 receipt，保留空旅行給操作者；其他 fixture 不變。

```bash
# 另一個終端：建立供新版 Mobile 使用的故障代理，不啟動或操作裝置
pnpm --filter travel-budget-mobile exec node scripts/serve-ledger-network.mjs \
  --fixture /tmp/該次路徑/fixture.json --port 8109
# Expo 的 EXPO_PUBLIC_API_BASE_URL 使用 http://127.0.0.1:8109/api/v1；v2 自動派生
# 代理會顯示 network.json；以下命令不需把 token 貼到 shell
pnpm --filter travel-budget-mobile exec node scripts/serve-ledger-network.mjs \
  --control /tmp/代理路徑/network.json --command drop-write-response-offline
# 在恢復／重啟前，讓 transport 上線
pnpm --filter travel-budget-mobile exec node scripts/serve-ledger-network.mjs \
  --control /tmp/代理路徑/network.json --command online
```

`drop-write-response`／`drop-write-response-offline` 只丟下一筆已確認 POST／PATCH／DELETE 的上游回應，涵蓋建立／加入、支出新增／維護與還款／撤銷；preview、receipt、登入與 refresh 不消耗它。`write-429`、`mutation-lookup-429`、C 的 `post-429`／`lookup-429` 注入一次 180 秒等待且不轉送；`disconnect`／`timeout` 可驗連線失敗。注入前保持畫面在確認前，避免背景請求先消耗 fault；`online` 會清除未使用 fault。代理終端輸入 `snapshot` 保存累積事件，`quit`／Ctrl+C 保存最後一份並關閉；事件只有帳號 ID、UUID、請求位元組雜湊、路徑／狀態／時間，不保存 token 或正文。snapshot 同時核對已觀察 UUID 的 endpoint／版本／method／body hash 與查詢帳號；缺少較早寫入基線會明列，違反固定請求則記失敗、工具退出碼非零，不能把這份 wire 證據當作 DB 或裝置通過。舊 `test:native` 流程未宣告涵蓋 B4，新操作由驗收者執行。

固定案例在**同一趟空旅行**由 A 代記：A 付款、A／B／C 均分，再由 A 登記 B→A 的部分還款並撤銷。TWD／JPY 為 100.01、匯率 1、付款 0.01；USD 為 3,000 JPY × 0.0067、付款 3.35 USD，精確值見 [B0 固定案例](ROADMAP.md#b旅程基準幣別改造規格2026-10-08)。每個階段可用只讀核對指令，HTTP 透過受保護的 fixture 控制通道取得一致的 DB snapshot：

```bash
pnpm --filter @travel-budget/web exec node scripts/check-ledger-acceptance.mjs \
  --fixture /tmp/該次路徑/fixture.json --currency USD --stage expense \
  --output /tmp/該次路徑/usd-expense.json
```

`--stage` 支援 `empty`／`expense`／`partial`／`revoked`；幣別支援 TWD／USD／JPY。核對原額／匯率／幣別、成員份額、精確餘額、expense／payment／terminal receipt 筆數、UUID、版本、單位與 resource ID；額外支出、缺 receipt、同 UUID 不同操作或錯單位皆失敗。固定案例要求由 A 操作，其他故障／衝突案例使用新 fixture；不要清除未結案 UUID 來讓核對通過。`--output` 不覆寫舊證據且權限為 0600；輸出明示裝置待驗。

fixture 終端的 `b4-state` 取得三趟完整帳務與 receipt 白名單 snapshot；`b4-usd-leave-a`／`b4-usd-rejoin-a`（另有 twd／jpy）供撤權／恢復操作。撤權後 receipt 仍須受正式權限限制；fixture 控制不是產品 API。需保存 snapshot 時，使用既有 `controlUrl`／`controlToken` 的 POST 通道，勿把憑證寫入證據。此工具不直接連外部 DB、不重建使用者端 UUID、不遷移或設定遠端。

| 他人操作核對                 | 必留證據／目前狀態                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 固定案例、Web ↔ iPhone／iPad | 一端新增、另一端讀回；每台重新啟動後單位與數值一致，附 DB 核對輸出與畫面。待驗。                                                     |
| 丟回應／重啟／換帳號         | 保存前後同 UUID／body hash、receipt 與 DB 筆數；A→B→A 不顯示／送出 A 的操作，查原版本恢復。待驗。                                    |
| 編輯／衝突／還款／撤銷       | Web 先改後 Mobile 重確認；基本編輯保留原額／匯率／附件；付款及撤銷丟回應不重複扣抵，附 snapshot 與原 UUID。待驗。                    |
| 舊 TWD／SQLite／429／撤權    | 用舊包建立 C／D／E 與草稿再升級，原 body 不變；保存失敗不送出、等待跨重啟有效、撤權晚到回應不得解鎖。SQLite 故障沿用原生工具，待驗。 |
| 預算／跨旅程統計／公開／匯出 | USD 私人預算只對 A；TWD／USD 分組、不混算；JPY .01 顯示／朗讀／匯出完整，舊公開入口阻擋非 TWD、新入口不含私人欄位。待驗。            |
| 建立開關／回退               | 本機關／開模式分別核對新建、既有帳務及原 UUID 恢復；服務不支援 v2 不改走 v1。正式部署／開放另依指示，待驗。                          |

開發檢查：Mobile 1,203 項行為測試與工具 40 項、Web 核對工具 7 項通過；根 check／contracts／build、三平台匯出及 Expo 相容性通過。一般關閉與本機開啟建立模式的完整真 HTTP 均通過；三種幣別各完成新增／部分還款／撤銷共 9 次丟回應，原 UUID 查回並由 CLI 核對 DB 精確值／筆數，沒有操作裝置。合成 wire 證據 `/var/folders/m4/fgf8qnv17_zcmkxf4s9cmd440000gn/T/travel-budget-ledger-network-9c3XRK/traffic-2.json`，HTTP 診斷 `/var/folders/m4/fgf8qnv17_zcmkxf4s9cmd440000gn/T/travel-budget-mobile-gjfmkn/next.log`；只使用自建資料庫，結束已清理。

驗收者在本節更新結果，附 commit、應用版本來源、裝置／OS、操作者、證據路徑與未完成項；先保留 iPhone＋iPad 必要案例，Android 延後。必要帳務或 iOS 案例未完成，B4 不結案、非 TWD 不開放，G3／G4／F 維持原安排。

## U 靜態審查修正交接（2026-10-08）

核對基準 `5eadc40`；本輪已實作 1–3、5、6，並整理 8、量測後修正 7。只修改 Mobile 顯示與查詢，未修改交易引擎、HTTP 契約或 catalog 撤權保護；以 Mobile patch 交付，當時依使用者指示先不做 G1。9a／9b 的整體重構延後。

| 編號        | 修正結果與限制                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1／P2       | 佇列只顯示未到期的 row／共用等待，resolved 不顯示列內等待。畫面時鐘在到期時重畫，較長的新期限繼續倒數；不清除或重設 SQLite 期限。涵蓋 nextAt、rateLimitUntil、共用 deadline、到期及 resolved。                                                                                                                                                                                                                                                                                                    |
| 2／P2       | 四個支出畫面共用 originalAmount helper。KRW／SGD／GBP 代碼只出現一次，JPY／USD 等仍明確識別幣別；涵蓋四語及小數。                                                                                                                                                                                                                                                                                                                                                                                 |
| 3／P2       | 本機入口與佇列／E 清單共用 scope、catalog 可見性規則；待處理數排除終局提示，讀取失敗／載入仍分開。Queue 保留 local 操作，E 清單與入口限 signedIn；舊回呼登入世代檢查保留。涵蓋撤權、換帳號／環境及失敗，不刪紀錄。                                                                                                                                                                                                                                                                                |
| 4／不列缺陷 | 原指控不成立：options 新請求成功並保存後可解除隱藏；本輪不更改權限保護，不新增直接解除 blocked 的重試。                                                                                                                                                                                                                                                                                                                                                                                           |
| 5／P2       | 已修正「所有姓名顯示完整 ID」的確定 UX 問題，原長 ID 測試亦已改正規格。唯一姓名不加碼，同名按目前整份名冊使用末 6 碼／延長消歧；名冊未知時不加碼、不推斷歷史資格，已讀名冊的歷史有 ID 帶短碼，null 只顯示已移除。規則與歷史跨畫面限制見 [成員識別](FEATURES.md#成員識別)。合法 24 碼案例涵蓋同名／尾碼碰撞、分頁、歷史、本人／虛擬與無障礙文字；上層共用名冊 Query，不在列／標籤掛載查詢；支出下拉／空清單更新／錯誤重試一起重讀名冊，離線或 catalog 隱藏時不重讀；明確名冊重試保留授權恢復入口。 |
| 6／P3       | 只在格式化捨入為零時移除負號；涵蓋 -0、極小負值、捨入邊界與 ±0.01 四語。未改帳務原值／尾差算法，不視為已證實回歸。                                                                                                                                                                                                                                                                                                                                                                                |
| 7／P3       | 真 QueryClient／QueryObserver 量測：舊 mount effect 在冷載入合併為一讀，暖快取進行中的讀取會取消重開為兩讀。移除初次額外 refetch，保留 revision 更新、scope 切換與手動重讀；補冷／暖、多頁同 scope、帳號／環境切換及較長新期限案例。hook effects 由測試 harness 執行，未量測原生按鈕閃動。                                                                                                                                                                                                        |
| 8／P3       | 還款頁按 context／latest、語系與本人各建 memo 標籤索引，輸入重畫不重建，不重複 find／掃描 peers；衝突前後名稱不混用。補快取與衝突畫面案例，未量測實際效能。                                                                                                                                                                                                                                                                                                                                       |
| 9a／9b      | 整體鍵盤工具列與登入世代守衛重構延後；這次僅共用紀錄可見性判斷，保留各頁不同登入／本機策略及非同步前後守衛。「下一欄」與平台替代入口不變。                                                                                                                                                                                                                                                                                                                                                        |

開發檢查：Mobile 980 項（946 Vitest／52 檔＋34 工具）通過，名冊 UX 校正新增／擴充 33 項案例（含名冊未知、載入後唯一姓名不跳碼、更新／重試與隱藏守衛）；型別、lint、格式與 iOS／Android／Web 匯出通過。期限來源仍有真 Node SQLite 重開與 E 429 案例；畫面／hook 回歸使用 mock 原生介面，Query 量測使用真 observer，另核對冷／暖名冊共用、無新增掛載重讀及帳號／環境隔離，不取代原生操作。裝置、完整流程與 iOS 最大字級／VoiceOver 仍由其他人驗收；Android 延後，不把單元測試或匯出寫成實機通過。G1a 後續已另行開發，見下節交接。

## G1a 旅行資料與封存交接

2026-10-08 獨立範圍核對（`5e4b7e6`）：核對 G1a–c 路由、契約、共用服務與恢復接線；本輪 Mobile 7 檔 85 項、Web API 3 檔 35 項重點回歸通過。未重跑全套測試、真 MongoDB／HTTP 故障矩陣或裝置操作，不等於完整獨立驗收；下列完整開發數據沿用各片交接。

已實作／分片提交：概覽旅行設定入口、管理員名稱／說明／目的地／日期編輯、本人封存／取消封存，Web／HTTP 共用交易、獨立 revision 與原 UUID 結果恢復。目的地首片是保留／清除／手動真實座標與地址，搜尋另排；G1b／G1c 已另行實作，見下節；F 暫緩。

開發檢查涵蓋嚴格日期／輸入、部分日期範圍、保留地點／私人欄位、Web 併發版本與只套用原變更、降權／移除、UUID 重播／回滾、本人封存隔離、真 SQLite 重開只查詢、存檔失敗不送、C 同旅行互斥、429 跨重啟及登入／撤權後晚到回應；新增畫面與刷新回歸使用原生 mock，交易用獨立 replica set，不取代畫面驗收。Web 2,068 項、Mobile 1,028 項（994 Vitest／56 檔＋34 工具）及隔離旅行交易 76 項通過；frozen install、根 check／contracts、Web build、三平台匯出與 Expo 相容性通過。

交其他人驗 iOS（iPhone／iPad）：一般成員只能封存、管理員可編輯，四語／大字級／鍵盤下一欄，日期與目的地保留／清除、Web 先改後保留輸入重新確認，以及 POST／PATCH 丟回應、重啟查原 UUID、換帳號、撤權、429、提交成功但讀取失敗。核對只有一次資料更新／receipt，其他成員封存狀態與帳務未被修改；日期變動只重綁 auto 相片。Android 延後。未進行本輪原生／真機驗收、部署或遠端 migration。

## G1b 成員與虛擬成員交接

已實作／分片提交：旅行概覽成員入口、一般成員全名冊、管理員虛擬建立／更名，帳務選擇器與結算／歷史還款的虛擬旗標。更名保留 ID、帳務及現名規則；共用服務、全名冊 revision、跨旅行認領 User fence 與 E 原 UUID 恢復。後續存取管理另見 G1c；F 暫緩。

開發檢查：Web 2,080 項、Mobile 1,058 項（1,024 Vitest／59 檔＋34 工具）、隔離交易 214 項（G1b 12＋既有成員／支出／還款 202）通過。涵蓋同 UUID 競爭只建一 User／membership、不同 UUID 舊名冊拒絕、Web 變動、降權／移除／認領（含跨旅行競爭）、交易回滾、真 SQLite 重開只查原 UUID、保存失敗、C 同旅行互斥、429 跨重啟、晚到帳號／撤權回應，以及四語虛擬／同名／歷史標籤；真 HTTP／隔離 DB 另核對丟 POST／PATCH 回應、原結果／重送筆數及私人欄位。原生畫面測試使用 mock，不取代實際操作。frozen install、根 check／contracts、Web build、三平台匯出與 Expo 相容性通過。

交其他人驗 iOS（iPhone／iPad）：名冊加入順序、四語／大字級／鍵盤完成、同名與短碼碰撞、虛擬建立／更名後各帳務頁／離線快照更新、一般成員無管理操作。故障核對雙擊、丟回應、重啟、換帳號、降權／移除、Web 新增成員或認領後重新確認、429 等待與保存／成功後重讀失敗。每 UUID 只一 receipt、建立只一 User／membership，更名不能改真人或任何支出／分攤／還款金額與參照。VoiceOver 實際朗讀仍待驗；Android 延後。沒有本輪裝置／真機驗收、部署或遠端 migration。

## G1c 權限與危險操作交接

已實作／分片提交：名冊管理入口、管理員角色／移除／刪除、本人退出，兩步線上確認、固定 UUID、SQLite 與本機撤權原子結案。最後真人管理員不能退出；移除／退出保留帳務，旅行刪除沿用既有清理工作。虛擬轉真人是手機提供認領連結、對方在既有 Web 註冊／登入；沒有原生認領憑證表單或認領 deep link，不保管他人密碼。詳細行為及限制見 [FEATURES](FEATURES.md#g1c-角色退出與刪除)／[契約](BACKEND_CONTRACT.md#g1c-權限與危險操作)。

開發檢查：Web 2,093 項、Mobile 1,078 項（1,044 Vitest／60 檔＋34 工具）及隔離交易 249 項（G1c 14＋身分／成員／寫入／支出／還款 235）通過。涵蓋角色／自身 ID 大小寫、最後管理員與並行退出、Web 成員變動／同筆數帳務更新、移除帳務與共享 User 保留、cascade／個人記錄解除連結、receipt／刪除／移除一起回滾；真 SQLite 重開、隱藏後只有 receipt 可讀、不明結果不重送、429／換帳號／本機結案失敗，以及 mock 畫面重新確認／雙擊／背景／認領入口。真 HTTP 另核對 POST 丟回應、退出與刪除結果重播、其他 receipt／名冊拒讀及 DB 筆數。frozen install、根 check／contracts、Web build、三平台匯出與 Expo 相容性通過；沒有部署／遠端 migration。

交其他人驗 iOS（iPhone／iPad）：四語／大字級／VoiceOver，管理員與一般成員入口、危險說明及明確確認、最後真人管理員（含剩餘虛擬 admin）、多人修改角色／新增支出後重新確認。雙擊、丟回應、重啟、換帳號、撤權、429、SQLite 保存／結案失敗，核對退出後本機名冊／草稿／佇列隱藏、只能查原 UUID 最小結果、不重送／不開舊旅行。每 UUID 一 receipt；移除／退出的支出／分攤／還款筆數、金額與參照不變，刪除只影響目標旅行且保留個人飛行／住宿記錄。認領連結複製／系統分享交給指定對象，Web 新註冊／連結既有帳號、已是成員拒絕、分享碼撤換與認領後刷新各帳務頁另行實測。Android 延後；本輪沒有裝置驗收。

## G2 獨立程式審查（2026-10-08）

範圍 `5e4b7e6..beb44a8`（G2a–c）；獨立審查基線為 Mobile 1,191 項、Web 重點單元 79 項、隔離 replica-set 交易 155 項與根 check／contracts 通過。審查以臨時案例重現下列缺口，當時未修改產品程式；探測檔已移除。

**G2 本次程式審查的 3 項 P2 與 1 項 P3 均已修正並通過獨立複驗。** P3 最後複驗核對點擊至 SQLite／HTTP 等待、transport 送出前及套用結果前的世代保護；重新執行幣別畫面 22 項測試與 Mobile check 通過，涵蓋斷線重連／背景返回／輸入變更，以及失效後明確重新核對。

完整開發檢查沿用修正交接：Mobile 1,206 項（1,172 Vitest＋34 工具）、check／contracts 及三平台匯出通過；最後複驗未重跑全套、匯出、Web／隔離交易／真 HTTP。只改 Mobile，未更動 Web／契約／SQLite schema／交易引擎；**裝置與完整流程仍待驗，本次程式審查結案不代表原生驗收完成。**

- **P2／衝突合併改變金額單位：已修**。原額／幣別／匯率作為整組輸入；任一有實質修改便保留整組，整組未改才取最新值。涵蓋 100 JPY 改 120、Web 改 20 USD × 30，僅改幣別／匯率、未完成金額與純格式變更；畫面回呼核對保留 120 JPY、重新預覽且使用最新 revision，未自動寫入。
- **P2／一般成員讀不到參考結果：已修**。共用唯讀區顯示旅行常用幣別的參考值／發布日期／來源，兩種角色均可讀；管理員的自訂輸入不被改寫，一般成員仍不能編輯／確認設定。
- **P2／429 落盤失敗遺失等待期限：已修**。保留未保存的原絕對期限，沿用新增／編輯的 read guard，在新請求前先重試落盤；失敗時零 HTTP，成功後仍等待原期限，不因重試延長。回歸涵蓋 120 秒、過 31 秒重試、期限前 1 毫秒及恰好到期。
- **P3／晚到讀取恢復已取消的確認：已修並通過複驗**。點擊核對即捕捉世代，斷線／背景／輸入變更使其失效，不再於 SQLite guard 等待結束後採新世代。永久回歸分別暫停 HTTP 與 SQLite `retryAt`；斷線重連／背景返回／改輸入後放行 SQLite，舊操作零 HTTP、無確認且保留輸入，busy 正常解除；明確重新核對才讀取並顯示確認。transport 守衛亦檢查同一世代，後端 revision／寫入流程保持原樣。

## G2a 幣別設定與匯率交接

已實作：旅行設定 → 幣別與匯率；一般成員唯讀、管理員常用／預設幣別／自訂匯率，明確讀取每日參考值與發布日期。確認前無草稿保存，確認後原 UUID／SQLite 恢復；只影響之後預填，不改舊支出、已確認內容或 D 佇列。規則與 API 見 [FEATURES](FEATURES.md#g2a-旅行幣別與匯率)／[契約](BACKEND_CONTRACT.md#g2a-旅行幣別與參考匯率)。G2b／G2c 已實作見下節；舊 App 仍以 TWD 均分新增。

開發檢查：Web 2,104 項、Mobile 1,114 項（1,080 Vitest／62 檔＋34 工具）、隔離交易 31 項（G2a 8＋G1 設定／存取 23）通過，涵蓋共用設定、金額保留、版本／權限競態與交易回滾；真 SQLite 重開、原 UUID、存檔失敗／429／帳號隔離與四語 mock 畫面亦通過。真 HTTP 含丟回應／UUID 重播、嚴格輸入與撤權；參考供應商用 mock 驗方向、日期／缺值與失敗。frozen install、根 check／contracts、Web build、三平台匯出與 Expo 相容性通過。沒有遠端 migration 或部署。原生驗收尚未執行；iPhone＋iPad 優先、Android 延後，由其他人核對：

- 四語／深淺色／最大字級／VoiceOver、ISO 搜尋與最多 30 列、預設幣別、移除預設外幣回 TWD、TWD 1 不可改、小數鍵盤完成與從欄位拖曳捲動；確認摘要能讀完整數字。
- Web 與 Mobile 修改同一設定；同時改設定需重讀並再確認，名稱／封存更新不誤判幣別衝突；管理權降級變唯讀，成員移除隱藏且不再發起寫入。換帳號／環境不顯示前一份輸入或待確認項目。
- 參考值呈現 `1 原幣 = ? TWD`、發布日期與 Frankfurter；缺幣別／503 保留手動輸入，不把缺值當 1、取得值不覆蓋自訂匯率；日期與秒級資料取得時間不能混為即時報價。
- 斷線／背景清除預備確認；存檔失敗不送 HTTP；丟 POST 回應後重啟只查原 UUID，結果不明不能換 UUID／重填；以原內容重試只留一筆 receipt，且不覆寫之後 Web 新設定。
- 429 保存帳號等待 120 秒，重啟過 31 秒與另旅行仍不送；期限結束才可操作。DB 核對 expense／payment 原幣、歷史匯率、分攤／TWD 值與筆數完全不變，C 已確認 body／D TWD 佇列亦不變。

## G2b 外幣新增與草稿交接

已實作：旅行常用／預設與自訂匯率預填、明確讀取及套用每日參考值、原幣／完整匯率／TWD 與後端分攤確認；任何輸入修改取消預覽。外幣草稿離線保存與重啟續填，C 原 UUID／內容交接及恢復相容既有 schema 8；D 佇列在所有入列／prepare／同步邊界維持 TWD。外幣編輯已於 G2c 實作。規則及 HTTP 現況集中在 [FEATURES](FEATURES.md#g2b-外幣新增與草稿)／[契約](BACKEND_CONTRACT.md#g2b-原幣預覽與新增)。

開發檢查：Web 2,119 項、Mobile 1,149 項（1,115 Vitest／63 檔＋34 工具）、隔離支出交易 116 項通過；涵蓋原幣分角／TWD 尾差、JPY 兩位小數、小／大匯率／換算上限／取整零額、完整匯率不回寫格式化值、設定變動後重播／併發去重及交易回滾。SQLite 重開保留原始字串／來源／原 UUID、舊紀錄原樣、交接當機／存檔失敗／原內容重送、429／換帳號／撤權與 D 邊界，四語畫面使用 mock。真 HTTP／隔離 DB 另核對 socket 丟回應及改設定後原 UUID 查回／重送，只一 expense／receipt。frozen install、根 check／contracts、build、三平台匯出與 Expo 相容性通過；沒有部署、遠端 migration 或本輪裝置驗收。

交其他人驗 iOS（iPhone／iPad），Android 延後：

- 四語／深淺色／大字級／VoiceOver；預設外幣／TWD，切幣別保留數字，原幣及完整匯率鍵盤完成／捲動；設定改變只影響新草稿，續填保留舊值。
- 自訂優先预填；每日參考有 Frankfurter／發布日期，讀取不覆蓋手動輸入，明確套用才改值。缺值／503 可保留輸入或手動修正，不使用 1；讀取期間改幣別／匯率／換帳號／撤權，晚到資料不回填。
- JPY 小數、極小／大匯率、TWD 上限及取整零額；確認原幣／匯率／TWD／各份额，修改任何輸入不能確認舊預覽。金額／分攤與 DB 及 Web 逐分相同。
- 外幣草稿重啟／續填／捨棄及失敗提示；离線只保存，TWD 可以確認入 D，外幣不能入列，既有 D 仍可同步。
- 雙擊、丟 POST 與查詢回應、交接當機、SQLite 保存／清理失敗後重啟：只能查原 UUID 或同內容重試，不套最新設定，不生成替代請求。每 UUID 一 receipt／expense。
- 429 等 120 秒、重啟過 31 秒、另一旅行不得送出；換帳號／環境隔離、移除成員保留固定原請求且不能重播／查詢，送出前等待 SQLite／refresh 時撤權仍阻止新 POST。

## G2c 外幣編輯交接

2026-10-08：契約／四語 mock 編輯回歸、SQLite 原 body 重開、隔離交易及真 HTTP PATCH 丟回應案例已補齊。Web 2,119 項、Mobile 1,191 項（1,157 Vitest＋34 工具）、隔離交易 31 項及真 HTTP 通過，涵蓋精度／上限、舊 body 相容、衝突／撤權、429／存檔失敗、原 UUID／丟回應與回滾；frozen install、根 check／contracts、Web build、三平台匯出與 Expo 相容性通過。不代表裝置／獨立驗收。iPhone＋iPad 優先、Android 延後，由其他人核對：

- JPY 外幣均分支出先改旅程預設／匯率，再進編輯：基本模式不改任何原幣／匯率／份額。明確切均分沿用此筆完整匯率，切幣別保留數字，新幣別自訂預填／缺值需手填，切回原幣恢復舊率；TWD 1 不可改。
- 原幣小數、極小／大率及換算上限；確認新舊原幣／匯率／TWD／份額與 Web／DB 逐分一致。改欄位、模式、背景／斷網及晚到預覽不能使用舊確認。非均分／缺歷史／已移除成員只能基本更新，附件／標籤／行程保留。
- Web 在預覽中或確認前修改金額／幣別／匯率／份額／成員：顯示最新內容，核對後保留本人明確編輯，rate 與其 currency 成對保留，重新預覽；新帳務不再均分時回 basic，不自動送出。
- 確認前不保存新離線編輯草稿；確認後雙擊、丟 PATCH／查詢回應、SQLite 保存／清理失敗及程序中斷：只能原 UUID 查回或原內容重試，核對一 receipt／一次更新活動，不套最新匯率。
- 429 120 秒、重啟過 31 秒與其他旅行等待；讀取等待落盤失敗仍阻止新請求。換帳號／環境／撤權，輸入與 pending 不外露、資格消失不能重播／查詢；明確重新載入 context 可恢復成功授權，晚到舊回應不能解除新撤權。
- 四語／深淺色／最大字級／VoiceOver、完整匯率／新舊金額、原幣與匯率鍵盤 Next／Done／完成列及欄位起手拖曳；返回／衝突／成功重讀仍為原 E 流程，待驗不計通過。

## U0 畫面與設計交接

2026-10-07 已補本輪 **26 張實際 iOS 代表畫面與 5 張同資料／英文 Web 對照**，私有 [截圖索引](/tmp/tb-u0a-20261007/index.html) 合併既有 Web／匿名預覽，共 66 張。配置、commit、案例 ID 及範圍見 `manifest.json`／`screens.json`；結論與設計界線只維護在 [ROADMAP U0](ROADMAP.md#u0盤點對照與設計定案)。本輪只保存專用本機草稿、讀取預覽與盤點畫面，未確認帳務、寄信／重設密碼、修改產品程式或執行獨立帳務驗收。

iOS 由 Xcode **Device Hub** 提供原生畫面；沒有 Simulator.app 不代表裝置不可操作。續作取目前 `57e9dff` commit，API 沿用隔離 `49587`、Metro `8095`，原生 bundle 目的地已核對。使用 `u0a-*` 專用帳號，不沿用其他 Metro／E fixture；帳密僅在私有 `private-fixture.json`，不貼進文件／截圖。App 實際為英文／淺色，字級 3 與草稿代表值 11；系統切語言不等於 App 語系已驗。工具配置已恢復，截圖原檔保留 Device Hub 視窗；索引僅以 CSS 裁切顯示。

**依使用者決定，以 iOS 為主要開發與交付基準；Android 補拍與裝置工作延後交給其他人。** iOS 非空佇列／結果不明、離線／拒絕／讀取失敗／冷啟動、提交終點及完整四語／外觀／字級仍未驗；不能將空佇列、正常預覽或歷史 E 證據當成上述狀態通過。重新開啟前先核對本機後端與 Metro 是否仍運作；`/tmp` 清除後須重建資料，不能沿用過期 ID。首輪 U1／U2 實作交接後由其他人執行 iOS 獨立驗收，Android 未驗不計通過。

U0c 的 [對照原型](design/u0c.html) 與 [ROADMAP 視覺規格](ROADMAP.md#u0c對照稿與交接) 已交接：兩份核心完整稿、列表／結算排列、正常／空／錯誤／本機與結果不明。原型 1×／2×、繁中／英文與深淺色是設計檢視；2× 不代表原生最大字級，不能記為裝置或帳務驗收。選用四張 disposable TEST 基線保存在 repository，來源 metadata 與完整原圖隨原型；其餘 66 張盤點仍在上述私有位置。U1a 已套入共用元件，實作與未驗範圍見 [ROADMAP U1](ROADMAP.md#u1共用視覺導覽與旅行入口)。

## U1a 元件驗收交接

2026-10-07：共用色彩／字級、Action 變體、Notice／Badge 語意、Chip 勾選與 TextField 聚焦已實作；Mobile 753 項測試（含 30 個新增案例）、check 與三平台匯出通過。這些是開發檢查，未執行本輪原生驗收。以本分支最新工作樹啟動 App，U0a 的舊 commit／截圖只作改版前對照。

- iOS 先核對登入、旅行列表／摘要、支出列表／明細、新增／編輯、結算／還款及本機／待確認入口；正常、忙碌、停用、選取、保存失敗、結果不明／409＋429 不改原操作界線。其他舊頁也需冒煙，頁面專屬排版與 Login 原生輸入依後續 U1／U2 遷移。
- 四語 × 深淺色 × 預設／最大原生字級，核對長名稱／金額／按鈕換行、48 觸控目標、卡片子按鈕可達及鍵盤不遮主動作；TextField 的 ref、decimal-pad 完成、Next／Done、多行與拖曳收鍵盤仍需實機核對。
- VoiceOver 核對 checkbox／radio、busy／disabled、提示與欄位錯誤；一般說明、自動保存及每秒倒數不反覆通知，失敗／需處理訊息才 polite，已存草稿不能讀成已入帳。以上由其他人執行；Android 延後，不計兩平台通過。

## U1b 導覽驗收交接

2026-10-07：新增 18 個回歸案例，核對實際路由樹、穩定分頁 key、選擇器交接／取消、登入 guard、離線選擇／失敗及撤權隱藏；Mobile 771 項測試、check 與三平台匯出通過。原生閱讀器、鍵盤、手勢與交易筆數本輪未驗，仍由其他人執行，Android 延後。

- iOS 先驗「旅行／我的」往返保留位置、「記一筆」取消回原入口；線上明確選旅行、離線只顯示有選項快照、無旅行建立／加入、存檔失敗與 pending 不可繞過。直接開明細／表單沒有歷史時，返回宣告的父頁；新建成功、支出成功仍回原旅行／清單。
- 概覽／支出／結算反覆切換不堆疊、邀請入口一致；表單不顯示全域列。iOS 手勢、頁首、系統 Back 與 E 未確認離開提醒一致；D 離開保存，已確認 C／D／E 卸載後只處理原 UUID，不能改頁後另送。換帳號、local 與撤權立即隱藏私有頁／名稱，登出失敗能重試。
- 四語／深淺色／最大字級檢查固定導覽、可捲動旅行名稱、表單內容與主動作；頂／底 safe area 不重複、FlatList 分頁／下拉更新保留。驗收前調整既有 Maestro 的路徑：登出先點 `nav-me`；本機先 `local-work`／`my-local-work` → `/work`；概覽改點 `trip-tab-index`（原 `expenses-back`／`settlement-back`），支出／結算仍為 `trip-expenses`／`trip-settlement`。原匿名登入及表單 IDs 保留，不可直接套用舊腳本後將未操作判為通過。

## U1c 旅行入口驗收交接

2026-10-08：22 個新增案例、Mobile 793 項測試、check 與三平台匯出通過；涵蓋四語缺日期、正／負／零餘額、長封存名稱、雙欄轉單欄、分頁／下拉更新、撤權、概覽未設／零預算與本機讀取失敗。原生畫面核對由其他人執行，以 iOS 優先，Android 延後。

- 用同一帳號／同資料比對 Web：本人分攤、應收／應付方向及分角、今日團費、人數、角色、日期與個人預算；沒有日期、只設一端、未設／零預算、自然零餘額、空旅行與封存各驗一次。列表沒有預算資料時不額外查 API，也不依日期／零餘額猜結清。
- 四語 × 深淺色 × 預設／最大 iOS 字級檢查長旅行名、長金額與建立／加入同列；本人帳務可讀、記帳／邀請可達，補充說明展開可捲動至底；VoiceOver 卡片朗讀完整狀態／人數／帳務，展開按鈕朗讀狀態。
- 分頁、下拉更新、失敗重試及離線本機入口；本機摘要零筆、讀取中、存檔讀取失敗與有待處理分開。本輪摘要為既有佇列／E 操作數，沒有推測未確認草稿數；只讀帳號／環境內紀錄，不顯示 payload 或撤權旅行名稱。
- 先快取再撤權、切換帳號與晚到錯誤時私人卡片／概覽隱藏；既有 C／D／E UUID、等待及入帳次數仍由原驗收工具核對。邀請只在明確開啟後取得，無假行程／相簿入口。

## U2a 支出閱讀驗收交接

2026-10-08：新增 26 個 Mobile／1 個 API 回歸案例，Mobile 819 項（785 Vitest＋34 Node）、Web 2,055 項通過；Web 442 項 opt-in 資料庫／外部服務案例未執行。根 check、契約同步、frozen install、Web build 與三平台匯出通過。實際畫面仍由其他人驗收，iOS 優先、Android 延後；匯出不代表原生驗收通過。

- 使用 C01 相同資料核對 Web／iOS：支出列表說明、日期、分類／付款人、本幣／原幣順序，明細原幣代碼、匯率與非均分份額（含 0 與 0.01）完全保留。四語格式對齊 U0c，未知分類仍為 Other，未知幣碼仍可讀，沒有附件／搜尋假入口。
- 本人以 ID 辨識，不因同名誤判；付款人不在分攤仍能與同名分攤辨識。長共同 ID 後綴須延長至可區分；虛擬成員由 API 旗標明示，null 參照標為已移除，不能當成另一位同名本人。舊 API 缺旗標仍可讀，不猜虛擬身分或目前成員資格。
- 四語 × 深淺色 × 預設／最大字級核對長說明、名字、金額與份額完整換行、VoiceOver 內容與操作；旅行金額雙欄採容器實寬（含卡片內距、頁面最大寬），返回靠左且維持 48 觸控高度。直橫轉向仍可讀。
- 分頁／下拉更新、empty／loading／error／stale／offline、pending 復查入口與重試；先快取後 catalog／HTTP 撤權、登出換帳號立即遮蔽明細／列／明細操作。編輯與危險刪除仍開 E3 確認，不直接寫入，原 C／D／E 同 UUID／限速與交易驗收沿用。

## U2b 新增與編輯驗收交接

2026-10-08：新增 18 個表單／結果／模式回歸案例；Mobile 837 項測試（803 Vitest＋34 腳本）、型別／lint／格式檢查與 iOS／Android／Web 匯出通過。測試直接執行畫面回呼，原生及外部邊界以 mocks 隔離，不代表鍵盤／畫面驗收。iOS 由其他人操作，Android 延後。

- 四語 × 深淺色 × 預設／最大 iOS 字級：旅行名稱明示，新增／本機金額先、基本編輯原金額唯讀；均分必須明確切換。長金額／說明與同名選項可讀，說明 Next 到日期、日期 Done 收鍵盤，兩個金額 decimal-pad 的完成列、拖曳收鍵盤與安全區域實際核對。
- 保存中／已保存短列皆未入帳、安靜更新；一般說明展開不改值。SQLite 保存／捨棄失敗與重試、重啟續填／捨棄、失效成員保留至明確修正，預覽或輸入變更後確認失效。既有穩定 testID 保留；基本編輯預覽按鈕文字改為「核對變更」，依 ID 操作 `expense-maintain-preview`。
- 確認卡完整核對說明、分類、日期、付款人、金額及所有份額（含零與同名）；均分比對新舊金額／份額，基本修改不清除外幣／非均分／未知分類／附件／行程／標籤。一般說明可摺疊，Web 衝突、刪除及離線均分規則不可藏起來，重新核對後仍要確認。
- 已成功但查詢更新失敗仍顯示已入帳；refresh 只讀，不建立第二筆。pending／結果不明走原恢復入口，丟回應、重啟、換帳號、撤權、429 與 C／D／E 同旅行協調，依既有隔離工具核對每 UUID 僅一筆 expense／receipt；本輪沒有執行裝置／資料庫驗收。

## U2c 結算與還款驗收交接

2026-10-08：新增 20 個結算／還款畫面回歸案例；Mobile 857 項測試（823 Vitest＋34 腳本）、型別／lint／格式檢查與三平台匯出通過。測試執行實際畫面回呼，原生與 HTTP／儲存邊界以 mocks 隔離；不代表畫面或資料庫驗收。iOS 由其他人執行，Android 延後。

- 四語 × 深淺色 × 預設／最大字級：本人應收／應付、本人建議、已登記還款、全員餘額順序及方向正確。無支出、沒有建議、自然零餘額與還款後結清分開，不以空建議推斷結清；長金額、備註、同名與長共同 ID 後綴完整可讀。
- 建議入口預填正確 ID／原額，手動表單先付款／收款人、金額、備註再參考結算；展開不改輸入。VoiceOver 身分／方向／金額清楚，null 參照顯示已移除。虛擬成員沿用有效 ID，現有 DTO 不提供虛擬旗標，本片沒有猜測標籤。iOS decimal-pad 完成列、備註 Done、拖曳收鍵盤、安全區域及返回提醒實際核對。
- 部分／超額／無建議及第三人代記皆核對完整確認卡；偏離建議、外部實付規則、Web 同時修改／409 的最新內容與保留輸入不可藏於摺疊中，核對後仍須再次確認。撤銷先顯示原方向／日期／金額／備註，危險確認才移除紀錄且不退款。
- 丟回應／重啟／換帳號／撤權／429 及撤銷後恢復依 E4 隔離工具核對每 UUID 一筆 payment／receipt，結算與 Web／DB 一致；成功後更新失敗只重讀，不再登記。既有 testID 保留，結算 catalog／HTTP 拒絕或登出隱藏快取；本輪未執行裝置／DB 驗收。

## U2d 帳號與旅行表單驗收交接

2026-10-08：新增 28 個帳號／旅行／邀請畫面回歸案例；Mobile 885 項測試（851 Vitest＋34 腳本）、型別／lint／格式檢查與三平台匯出通過。帳號畫面測試使用實際 AccountFlow／HTTP client，其他畫面執行實際回呼並隔離原生／E1 引擎邊界；不代表畫面、SecureStore 或資料庫驗收。iOS 由其他人操作，Android 延後。

- 四語 × 深淺色 × 預設／最大 iOS 字級：登入／註冊／寄碼／重設、建立／加入與邀請頁任務標題及操作層級一致，長說明／邀請 URL 可完整閱讀，警告及失敗不可摺疊。登入使用共用 TextField，iOS 密碼／帳號自動填入、secureTextEntry 與 VoiceOver 核對；登入 Next 到密碼、Go 登入，保留 Android 共用行高。
- 註冊／重設密碼規則就在密碼欄，驗證碼 number-pad 下一欄移到新密碼且不提交；前導零保留。寄碼／驗碼 429 各自等待原期限，已收到碼可獨立驗證，倒數安靜更新；密碼與碼不落盤，離開清除、結果不明與成功回登入沿用 E2 驗收。
- 旅行名稱 → 多行說明 → 開始／結束日期的鍵盤順序、取消提醒及離開後不恢復未確認表單核對；空日期、非法日期、日期順序及名稱長度依既有驗證。加入接受此環境的有效碼／連結；確認丟回應、重啟、換帳號與同 UUID 恢復依 E1 工具核對，確定保存後不能修改或捨棄。
- 邀請碼／連結標籤、複製成功／失敗、分享／刷新層級及返回旅行摘要核對。未開頁不抓碼，背景／換帳號／撤權立即隱藏，晚到回應不復活；兩平台 Clipboard／Share 的實際行為仍待操作。本輪未執行裝置／資料庫驗收。

## U2e 本機與恢復驗收交接

2026-10-08：新增 30 個恢復畫面／期限回歸案例；Mobile 915 項測試（881 Vitest＋34 腳本）、型別／lint／格式檢查與三平台匯出通過。畫面測試執行實際回呼並隔離原生／引擎邊界；期限案例用實際 E 引擎、模擬 429 與真 SQLite 檔案重開，確認 C／E 共用原期限、較短等待不覆蓋與帳號／環境隔離。不代表實際畫面、SecureStore 或裝置記帳驗收。iOS 交給其他人操作，Android 延後。

- 四語 × 深淺色 × 預設／最大 iOS 字級：本機旅行、佇列、待確認操作與支出，核對空列表／讀取失敗／離線／登入到期、等待／需處理／結果不明／完成／拒絕。長說明、UUID、金額、原期限與警告全文可讀，返回為頁首控制項；VoiceOver 焦點逐項可操作，期限安靜更新，不反覆朗讀整張卡片。
- 草稿保存失敗與本機快照讀取失敗各自可辨識；讀取失敗不畫成零筆。未送佇列可移回草稿或危險捨棄，已有草稿時須明確選擇替換；準備送出後不可編輯／捨棄。C／E 結果不明只查詢或允許的原內容重試，衝突仍可查、E 原內容重試停用，確定完成才移除提示，確定拒絕才保留輸入重開。
- 以既有隔離工具注入 429 等待 120 秒，重啟過 31 秒仍顯示同一原期限、查詢／重試／同步停用；期限到才恢復，查本機紀錄不受離線限制。C、D、E 共用期限及衝突標記分開，不能因完成／捨棄或切頁縮短；等待讀取失敗有重試入口。
- A→B→A、撤權及晚到結果核對私人卡片立即隱藏、舊回呼不導向其他帳號／已撤權旅行；紀錄保留不等於仍可顯示或送出。沿用 D／E 丟回應、當機與每 UUID 單筆入帳的 DB 核對工具。本輪未執行原生操作或 MongoDB 驗收。

## 先決條件

- 根目錄完成 `pnpm install --frozen-lockfile`；Node／pnpm 版本依 repository 設定。
- Docker Desktop 已啟動。第一次執行會下載 `mongo:8.0`；隔離資料庫是單節點 replica set（新增支出的交易需要）。已經開著的舊 `dev:mobile-api` 環境不是 replica set，須重啟才能使用新增 API。
- 暫停其他 `apps/web` 開發伺服器：驗收環境使用同一份 Next.js 開發產物與 lock。
- iOS：Xcode 與 iOS Simulator runtime；`xcrun simctl list devices available` 應有可開機裝置。若全域仍指向 Command Line Tools，可只在目前終端設定 `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`。
- Android：Java、Android SDK platform-tools、emulator 與符合電腦架構的 system image。設定 `ANDROID_HOME` 與 SDK 的 `platform-tools`／`emulator` 路徑，啟動 AVD 後確認 `adb devices` 可見裝置。安裝方式見 [Expo Android 模擬器文件](https://docs.expo.dev/workflow/android-studio-emulator/) 與 [Android 命令列工具](https://developer.android.com/tools)。

macOS 若使用 Homebrew 的 `openjdk@17` 與預設 Android SDK 目錄，可在目前終端設定（不必修改全域 Xcode 或 shell 設定）：

```bash
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
emulator -list-avds
# 此次建立的 AVD 名稱：TravelBudget_API36
emulator -avd TravelBudget_API36
```

## 自動 HTTP 與資料庫驗收

在 repository 根目錄執行：

```bash
pnpm --filter @travel-budget/web test:mobile-api
```

腳本建立唯一名稱的 Docker 容器、暫時資料庫、隨機密碼與簽章密鑰。MongoDB 只綁定 loopback；Next.js 使用隨機本機 port。腳本覆寫子程序的資料庫／密鑰設定，遮蔽本機 env 檔的其他設定並停用外部服務，不修改 env 檔。只對自己的資料庫套用手機 session TTL migration，不執行遠端 migration。

檢查包含帳密登入、`/me`、refresh 雜湊儲存、分頁與封存排序、到分金額、date-only、本人預算、非成員 404、空旅行、refresh 輪替／併發／重放、session 到期、改密碼失效、登出與 Web cookie 隔離、429／Retry-After，以及 no-store headers。HTTP 回應使用共用契約驗證。

支出與結算唯讀 API 使用獨立的 ledger 帳號與旅行，不影響上述金額：48 筆支出涵蓋同日同時間的游標邊界（20／20／8 筆分頁）、分頁之間插入新支出、外幣、非均分、虛擬成員付款人與缺少原幣欄位的歷史資料，另有已登記還款、已結清與無支出旅行。腳本以獨立計算的預期值對照清單順序、明細金額／分攤與結算餘額，並檢查回應沒有附件、標籤、帳號或 Email；非成員、他旅行的支出、分享碼、格式錯誤的 ID、無效游標、未登入及中途失去成員資格皆被拒絕。對應的資料庫層整合測試（`mobileReadApi.integration.test.ts`，需獨立測試 MongoDB）在 CI 的真 MongoDB 工作中執行。

線上新增支出的後端使用獨立的 writer 帳號與旅行：成員資料的順序（含加入時間相同的成員與虛擬成員）、預覽的固定順序均分與嚴格輸入、新增後以獨立計算的預期值核對儲存的支出與 receipt、再由讀取端點與結算讀回；同 key 的重播與任何大小寫拼法（含混合）、八個併發的相同請求只提交一次且通知／動態不重複、同 key 不同內容 409、他人不能看到本人的 key、支出被刪除後重播與查詢、失去成員資格者的重播／查詢／預覽／讀取皆 404，以及 二十多種無效請求都 400 且不留支出或 receipt。單筆上限 1,000,000,000 的金額從預覽、儲存的文件到結算逐分核對，超過上限（含 `10_000_000_000_000`）的預覽與新增都 400 且不留資料；另以獨立算出的舊格式 receipt（大寫與混合大小寫 key）驗證在原樣與其他拼法下的重播、結果查詢與 409，刪除支出後仍不復活；以混合大小寫 key 新增後，其他拼法的查詢、重送、改內容與刪除後重送也都對應同一筆。另模擬回應遺失：客戶端送出請求後不讀回應，伺服器仍提交，以 key 查得結果，重送不重複。結束前清空該旅行的支出、receipt、通知與動態，保留環境供裝置使用。資料庫層另有需要 replica set 的 `mobileExpenseWrite.integration.test.ts`（CI 的 `expense-writes` 工作）；本機可用：

```bash
docker run -d --rm --name tb-replica -p 127.0.0.1:27017:27017 mongo:8.0 --replSet rs0 --bind_ip_all
docker exec tb-replica mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
MONGODB_MEMBER_TEST_URI='mongodb://127.0.0.1:27017/?directConnection=true' \
  MONGODB_MEMBER_TEST_ALLOW_WRITES=1 \
  pnpm --filter @travel-budget/web exec vitest run src/__tests__/mobileExpenseWrite.integration.test.ts
docker rm -f tb-replica
```

正常結束、失敗或 Ctrl+C 都會停止自己的 Next.js 與移除容器；診斷 log 留在輸出的暫存目錄。不應把這些輸出提交到 repository。強制關機或 SIGKILL 無法觸發清理；此時只移除該次產生的 `tb-mobile-<隨機碼>` 容器，避免清除其他工作。

## 保留環境供裝置操作

```bash
pnpm --filter @travel-budget/web dev:mobile-api
```

先執行自動驗收，成功後清空測試產生的登入限制與 session，再保留資料庫與伺服器。終端顯示 API URL、一次性密碼、旅行 ID 與 fixture 日期；密碼也只寫入權限 `0600` 的暫存 `fixture.json`。每次重啟都會換 port、密碼與資料 ID，手機須更新 API 位址並重啟 Expo。

| 帳號                                                                             | 旅行與預期金額（TWD）                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mobile-a`                                                                       | 22 筆：共用旅行、20 筆未來旅行、1 筆封存旅行；共用旅行本人花費 50、應收 50.01、預算 1,000                                                                                                       |
| `mobile-b`                                                                       | 共用旅行與 B 專屬旅行；共用旅行本人花費 50.01、應付 50.01、預算 9,000                                                                                                                           |
| `mobile-empty`                                                                   | 無旅行                                                                                                                                                                                          |
| `mobile-ledger`／`mobile-ledger-b`                                               | 支出與結算 fixture：Ledger 旅行（48 筆）、Settled ledger（已結清）、Empty ledger（無支出）                                                                                                      |
| `mobile-writer`／`mobile-writer-b`／`mobile-writer-removed`／`mobile-writer-out` | 線上新增 fixture：Writer 旅行（無支出；前三者與一名虛擬成員為成員，`mobile-writer` 為管理員，`mobile-writer-out` 不是成員）；手機新增畫面的原生流程以 `mobile-writer` 與 `mobile-writer-b` 操作 |

共用旅行只有一筆 100.01 支出、2 名成員；fixture 當日全團花費為 100.01。Ledger 旅行有 4 名成員（含虛擬成員與測試用 `mobile-removed`）：總支出 5,819.9、`mobile-ledger` 應收 790.35、`mobile-ledger-b` 應收 839.5；含一筆 JPY 3,000（匯率 0.0333）= 99.9、一筆虛擬成員付款的 200 與一筆歷史資料 30，以及一筆 20.5 的已登記還款。工具會先檢查 fixture 與本機日期一致；跨日驗收時重啟後端與 Metro，使日期一致。Writer 旅行的成員依加入時間為 `mobile-writer`、`mobile-writer-b`，其後是加入時間相同的虛擬成員與 `mobile-writer-removed`；驗收腳本結束時已清空該旅行的支出、receipt、通知與動態。所有 fixture 名稱以 `TEST` 開頭；收據 key 是不可存取的測試字串。

保留環境的終端接受以下命令：

- `revoke-a`：撤銷 `mobile-a` 所有手機 session；回到 App 重新整理應回登入頁。
- `expire-a`：使 `mobile-a` 所有手機 session 到期；下次 API 請求應回登入頁。
- `reset-limits`：清除此隔離資料庫的登入次數限制，方便重複操作。
- `revoke-writer`／`expire-writer`：撤銷／使 `mobile-writer` 所有手機 session 到期（新增支出流程用）。
- `writer-leave`／`writer-rejoin`：`mobile-writer` 離開／重新加入 Writer 旅行；`removed-leave`／`removed-rejoin`：`mobile-writer-removed` 離開／重新加入。成員資格的改變直接寫在資料庫，供失去權限與寫入被拒絕的情境使用。
- `entry-state`：回報 Writer 旅行目前的支出、receipt、通知、動態筆數與支出說明／金額（唯讀）；終端機顯示結果，控制通道回傳 JSON。
- `entry-reset`：清空 Writer 旅行的支出、receipt、通知與動態，並讓上述兩位成員回到旅行中；每個新增支出流程開始前由流程自己執行。
- `quit` 或 Ctrl+C：關閉環境並清除資料庫。

另開終端，將 `PORT` 換成腳本輸出的 port；不要原樣執行占位值。

```bash
# iOS Simulator
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:PORT/api/v1 \
  NODE_OPTIONS=--dns-result-order=ipv4first \
  pnpm --filter travel-budget-mobile exec expo start --ios --localhost

# Android Emulator：同時測兩平台時使用不同 Metro port
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:PORT/api/v1 \
  NODE_OPTIONS=--dns-result-order=ipv4first \
  pnpm --filter travel-budget-mobile exec expo start --android --localhost --port 8082
```

驗收 Metro 使用 `EXPO_NO_DOTENV=1`，避免載入其他環境的公開設定；啟動 App 前核對實際 bundle 的 API／網站 origin 與 fixture 相符。同時執行不同環境時使用獨立 source 與 Metro cache。

iOS 指令固定 IPv4 優先，避免 Metro 只監聽 `::1`、Expo Go 卻連到 `127.0.0.1` 的不一致。Expo CLI 會安裝相容的 Expo Go；此階段不需要正式 App ID、簽章或 EAS project。development build 與正式套件驗收仍是後續工作。

真機與電腦連到同一個可信任區域網路，再執行：

```bash
pnpm --filter @travel-budget/web dev:mobile-api --lan
```

此選項讓測試後端綁定 `0.0.0.0`，並列出 LAN 候選位址。手機的 `EXPO_PUBLIC_API_BASE_URL` 使用可達的電腦 LAN IP；Metro 使用預設 LAN 模式並掃描 QR code。不要使用手機自己的 localhost。完成後以 Ctrl+C 關閉；本環境僅供本機開發。

保留模式另啟動獨立的 loopback 控制通道，讓原生自動化執行上述撤銷、到期與重設限制操作。它使用隨機憑證，URL／憑證只存入私有 `fixture.json`，即使指定 `--lan` 也不對區域網路開放。此通道只存在驗收腳本，不是產品 API；關閉環境時一起停止。

## 每平台操作表

iOS／Android 各自記錄裝置、OS、Expo Go／development build、語系、深淺色與結果。未操作的項目保持待驗收，不能用 API 測試或 bundle 匯出代替。

| 操作                                                                                                 | 預期                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 空欄位、錯誤密碼、正確登入 A                                                                         | 必填／錯誤提示正確；成功後顯示 A 的旅行                                                                                                                                      |
| 列表載入更多、下拉更新                                                                               | 20 筆後可載入剩餘 2 筆，無重複；封存最後                                                                                                                                     |
| 開共用旅行                                                                                           | 日期、角色、人數、支出筆數與上表金額一致                                                                                                                                     |
| 以 `mobile-ledger` 開 Ledger 旅行的支出與結算                                                        | 清單 20＋20＋8 筆無重複、外幣顯示原幣、明細分攤與金額一致；結算三種狀態、本人轉帳排前且標示尚未付款                                                                          |
| 以 `mobile-writer` 開 Writer 旅行，新增支出（說明、金額、日期、分類、付款人、分攤成員）→ 預覽 → 確認 | 金額只接受數字與至多兩位小數；100 元三人預覽為 33.34／33.33／33.33；改金額或成員立刻使預覽消失，改回原值也要重新預覽；確認後顯示已儲存，明細、旅行摘要、結算與清單的金額一致 |
| 送出時回應遺失（代理丟棄回應）、再重試或完全關閉重開 App                                             | 出現「尚未確認的支出」；查詢結果或以原內容重試都回到同一筆，資料庫始終一筆；重開 App 後自動找回，清單有該筆且不再有待確認提示                                                |
| 完全關閉 App 後重開                                                                                  | SecureStore 恢復登入並成功 refresh                                                                                                                                           |
| 背景／前景、斷線／恢復、離線登出                                                                     | 顯示離線／重試；離線登出不假稱成功；恢復可讀資料                                                                                                                             |
| 登出 A、登入 B、再登入 empty                                                                         | 預算與應收／應付切換正確；不殘留 A 資料；empty 顯示空狀態                                                                                                                    |
| 用 B 專屬旅行 ID 嘗試從 A 開啟                                                                       | 404，不顯示私人內容                                                                                                                                                          |
| 保留環境輸入 `revoke-a`／`expire-a` 後重新整理                                                       | 回到登入頁，清除私人快取；重新登入可恢復                                                                                                                                     |
| 繁中、簡中、英文、日文；深淺色                                                                       | 翻譯、數字、對比與畫面完整                                                                                                                                                   |
| 大字體、鍵盤、螢幕閱讀器                                                                             | 可捲動並操作登入、返回、載入更多；按鈕有標籤                                                                                                                                 |

HTTP／MongoDB 與下節的模擬器流程各自驗證不同層次；本表的原生操作結果須另行記錄。模擬器通過也不能直接標示兩平台真機驗收完成。

## 可重跑的模擬器驗收

`maestro/auth-trips.yaml` 透過原生畫面操作實際 API，涵蓋必填／錯誤密碼、A 的旅行摘要、冷啟動恢復登入、載入第二頁、非成員旅行拒絕、切換 B 的金額／預算，以及 empty 的空狀態。使用 Expo Go，不清除 App 或 Keychain／SecureStore；每次執行先正常登出，結束也正常登出。

`maestro/sessions.yaml` 涵蓋摘要顯示中撤銷 session、API 讀取後回到登入頁、切換 B 的預算，以及 session 到期後的冷啟動與重新登入。每次失效後再重啟一次，確認安全儲存的失效憑證已清除，不會反覆出現到期錯誤。此 suite 驗證資料庫 session 期限；access JWT 自然到期另由 `expiry` 驗證。

`--suite lifecycle` 先登入 A、開啟私人預算摘要並將 App 留在背景；主機等待 35 秒超過快取新鮮期後撤銷 session，再將同一個 App 帶回前景（不重啟、不手動更新）。斷言自動回登入頁、重啟沒有殘留憑證，且切換 B 後只顯示 B 的預算。Android 透過 adb 開啟最近使用的 App，再點選置中的專案卡片；直接啟動 Expo Go 會回到另一個首頁 task。

`--suite network --network-port 61110` 在執行期間建立 loopback 故障代理，轉送至 fixture 的隔離 API。驗證摘要更新超過產品的 15 秒逾時仍保留快取、恢復後可重試、連線中斷時登出失敗仍保留登入，以及冷啟動恢復失敗不顯示私人內容、連線恢復後可重試登入。這是 HTTP 連線中斷／逾時，不是飛航模式或完整弱網驗收。

執行 network 前重啟對應 Metro，將 API 改為 `http://127.0.0.1:61110/api/v1`（iOS）或 `http://10.0.2.2:61110/api/v1`（Android）；保留原來的 `--fixture` 與 Metro port。`61110` 可換成其他未占用 port，但須與 `--network-port` 相同。代理只在驗收程序執行時存在；結束或中斷會關閉，之後一般開發須把 Metro API 改回 fixture 後端位址。故障控制需獨立隨機憑證，不更改產品 API；中斷／逾時請求不會轉送或消耗後端 refresh 憑證。

`--suite appearance` 驗證大字體下的必填提示、表單捲動、登入、旅行金額、返回與登出，並將畫面留在私有驗收目錄。可傳 `--appearance light|dark` 與 `--text-size default|largest`，工具會暫時設定裝置並在結束、失敗或 SIGINT／SIGTERM 後還原原值；iOS 最大字級為 accessibility-extra-extra-extra-large，Android 為 font_scale 2.0。未傳入的設定不改動。旅行卡片可能高於螢幕，因此只要求部分可見後點擊；金額與操作按鈕仍須完整可見。也可手動設定如下，完成後自行還原；SIGKILL 或主機當機無法觸發工具的還原。

```bash
# IOS_UUID 換成模擬器 UUID；xcrun 指令省略最後一個參數可讀取原值
xcrun simctl ui IOS_UUID content_size accessibility-extra-extra-extra-large
xcrun simctl ui IOS_UUID appearance dark
# Android 原值：settings get system font_scale；cmd uimode night
adb -s emulator-5554 shell settings put system font_scale 2.0
adb -s emulator-5554 shell cmd uimode night yes
# 使用下方 test:native 指令，將 suite 換成 appearance；結束後還原原值
```

`--suite ledger` 以 `mobile-ledger` 操作 Ledger 旅行：載入三頁支出、外幣明細與分攤、結算金額與「尚未付款」建議、已登記還款，再以深連結檢查已結清／無支出狀態，最後登入 `mobile-a` 確認非成員看不到任何資料（含切換帳號後不殘留前一帳號的快取）。

`--suite locales` 依序以英文、繁中、簡中、日文執行完整登入／旅行、`ledger` 與 `entry-create` 流程，透過原生 App 語系偏好設定切換，結束或中斷後還原；可用 `--locales zh,zh-CN,jp` 重跑指定語系，`--locale-flows entry-create` 只跑其中的新增支出流程（可選 `auth-trips`、`ledger`、`entry-create`、`entry-appearance`）。涵蓋錯誤密碼、金額／預算、權限錯誤、空旅行與支出／結算畫面。Android 測試鍵盤使用 Gboard，須保留 English (US)；流程會選英文輸入測試帳號，App 仍使用待驗語系。

`--suite keyboard --platform ios` 要求英文字母鍵盤的 `q` 鍵在輸入時及捲至登入按鈕後皆可見，再驗證登入、摘要與登出。執行前須啟用模擬器軟體鍵盤（DeviceHub 關閉 Simulate Hardware Keyboard），並使用英文鍵盤。

`--suite entry --network-port 61110` 以 `mobile-writer`／`mobile-writer-b` 操作 Writer 旅行的新增支出與不確定結果恢復，使用上述故障代理與控制通道；可用 `--flows entry-create,entry-lost-check` 只跑其中幾個。每個流程開始時先 `entry-reset`，流程內以控制通道核對後端實際保存的支出與 receipt 筆數，主機另依代理看到的流量逐項核對（`scripts/entry-trace.mjs`），不只看畫面：

| 流程                    | 驗證                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry-create`          | 從輸入框起手的拖曳能捲動頁面（Android 中日文曾失敗）、嚴格輸入（`12abc` 不被當成 12、缺少說明被指出）、預覽的固定順序均分、改金額使預覽失效且改回原值仍須重新預覽、確認後「已儲存」、明細／旅行摘要／結算／清單金額一致；後端一筆支出、一個 receipt                                                                                 |
| `entry-lost-check`      | 代理讓後端提交後丟棄回應並斷線：顯示未確認，離線查詢維持原狀，連線後「查詢結果」找回原支出；一次寫入加一次查詢                                                                                                                                                                                                                      |
| `entry-lost-retry`      | 同上，改按「以原內容重試」：同一個 UUID 與內容重送，後端重播同一筆，仍只有一筆                                                                                                                                                                                                                                                      |
| `entry-lost-restart`    | 同上，強制關閉 App、恢復連線後重開：自動找回、清單有該筆、不再有待確認提示，只有一次寫入                                                                                                                                                                                                                                            |
| `entry-retry`           | 寫入根本沒離開手機（代理斷線）：後端零筆；查詢回報伺服器沒有紀錄（不稱失敗），重試後只寫入一次                                                                                                                                                                                                                                      |
| `entry-accounts`        | 未確認時登出，同旅行的另一帳號看不到、查不到也送不出該請求，只看得到已提交的支出；原帳號登入後找回，全程一次寫入，且寫入與查詢只來自原帳號（依代理紀錄的 JWT 帳號）                                                                                                                                                                 |
| `entry-access`          | 失去旅行成員資格時查詢得到 404：保留紀錄並提示無法確認，不稱失敗；恢復資格後找回                                                                                                                                                                                                                                                    |
| `entry-session`         | 登入到期且無法更新：回到登入頁、不顯示私人資料；同帳號重新登入後找回，從未重送                                                                                                                                                                                                                                                      |
| `entry-rejected`        | 寫入前被伺服器明確拒絕（預覽後成員被移出旅行）：回到編輯、沒有待確認紀錄、後端零筆；修正後重新預覽並確認是新的提交                                                                                                                                                                                                                  |
| `entry-preview-revoked` | 預覽成功後本人被移出旅行，再預覽得到 404：整個畫面只剩「找不到旅行」，沒有成員、分攤與確認；後端零筆寫入、重讀成員選項也被拒；斷線後離開再回來仍不顯示                                                                                                                                                                              |
| `entry-appearance`      | 裝置先設為最大字級／深色（見上方 `appearance` 指令）：表單、成員、預覽與「已儲存」都不在第一屏，逐一捲到可見後完成輸入、預覽、確認，再檢查儲存頁的三個按鈕並返回支出清單／旅行摘要（四語矩陣含摘要與清單兩種新增入口）；後端一筆支出、一個 receipt。每個步驟只要求捲到可見、不置中，因為最大字級下的區塊高過螢幕時 Maestro 無法置中 |

代理新增兩個一次性、只限「建立支出」（`POST /api/v1/trips/<id>/expenses`）的模式：`drop-response` 讓請求完整轉送並在後端提交後丟棄回應，之後代理維持連線；`drop-response-offline` 同上，之後代理斷線直到收到 `online`。預覽、查詢、其他寫入與登入不受影響；`online` 會一併解除尚未使用的丟回應設定；後端無法連線時不消耗它。`keyboard`（iOS）與 `locales` suite 也會跑 `entry-create`；大字體、深淺色則在設定好裝置後執行 `--suite entry --flows entry-appearance`（`entry-create` 的置中捲動在最大字級下不成立，只在預設字級執行）。

四語新增矩陣可用 `--suite locales --locale-flows entry-create --text-size default --appearance light`；最大字級則改成 `--locale-flows entry-appearance --text-size largest`，分別搭配 `--appearance light` 和 `dark`。`locales`／`keyboard` 也可傳 `--network-port` 以核對代理流量，Metro 必須使用同一代理位址。所有新增流程結束時獨立讀取隔離 DB，核對支出／receipt 筆數與實際金額；產物目錄的 `entry-results.json` 保存每個流程的結果，使用代理時另保存 `auth-trace.json`（含失敗時已收集的流量）。追蹤只含請求路徑、狀態、時間、帳號 ID 與 token 單向指紋，不保存 token／payload。UI、DB 與代理斷言全部通過才算該流程成功；這些證據仍不能取代螢幕閱讀器實際操作。

螢幕閱讀器須以 VoiceOver／TalkBack 實際逐項導覽與啟動：核對說明／金額／日期標籤、分類與付款人單選狀態、分攤成員勾選狀態、必填錯誤、預覽失效後的確認停用、送出中狀態，以及「已儲存」／「尚未確認」提示；切換畫面後焦點可繼續操作，撤權／換帳號後讀不到前一個帳號的私人資料。啟用服務、檢查原生樹的角色／狀態或看到焦點框，只算語意檢查，不算完整朗讀與操作通過。

所有 suite 都可加 `--flow-timeout <分鐘>`（預設 20）：單一 Maestro 流程超過時間就會被結束並判為失敗，避免卡死的測試驅動讓整輪無限等待（實測過 iOS 驅動對空的數字欄位 `eraseText` 或鍵盤動畫中的點擊都可能卡住或落空，相關流程已避開：只清除輸入過的欄位、等「完成」按鈕出現並靜止後才點、輸入後先等文字完整出現）。數字鍵盤沒有 return 鍵：iOS 用鍵盤上方的「完成」收起（軟體鍵盤與外接鍵盤模式都可），Android 用鍵盤的動作鍵。

`--suite expiry --network-port 61110` 使用上述代理設定，實際等待 access JWT 的 15 分鐘期限，再驗證後端 401、單次 refresh、使用新 JWT 重送成功，以及冷啟動可恢復輪替後的 SecureStore 憑證。過程不改時鐘、token 期限或資料庫 session。只保留請求路徑、狀態、時間與 token 單向指紋，不保存憑證，失敗時也會保留追蹤；兩平台可使用不同代理 port 同時驗收。等待期間保持主機與模擬器喚醒，macOS 可在另一終端執行 `caffeinate -di`，驗收後結束。

安裝 [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)（Java 17 以上）；macOS 可用 `brew install mobile-dev-inc/tap/maestro`。不需登入 Maestro Cloud。先依上文啟動隔離後端、模擬器及對應 API 位址的 Metro，確認 Expo Go 可開啟此專案。Android 的 localhost Metro 由 Expo CLI 設定 adb reverse。

在 repository 根目錄執行，替換 `FIXTURE_PATH` 與 `IOS_UUID`；`--metro-port` 要與該平台的 Expo 指令一致：

```bash
pnpm --filter travel-budget-mobile test:native \
  --platform ios --device IOS_UUID \
  --fixture FIXTURE_PATH --metro-port 8083

pnpm --filter travel-budget-mobile test:native \
  --platform android --device emulator-5554 \
  --fixture FIXTURE_PATH --metro-port 8082

# 兩平台各自執行；同一份 fixture 請依序驗收，避免互相撤銷 session
pnpm --filter travel-budget-mobile test:native --suite sessions \
  --platform ios --device IOS_UUID \
  --fixture FIXTURE_PATH --metro-port 8083

pnpm --filter travel-budget-mobile test:native --suite sessions \
  --platform android --device emulator-5554 \
  --fixture FIXTURE_PATH --metro-port 8082
```

兩個平台請依序執行，不要同時跑：同時執行曾使 iOS 的 XCTest 驅動無回應（`viewHierarchy` 500 或 swipe 卡住）、Android 停在 Expo Go 啟動畫面。長時間無輸出時結束該次 Maestro 程序後重跑，並先確認沒有殘留的 `xcodebuild`／`maestro-driver` 程序。

`FIXTURE_PATH` 是 `dev:mobile-api` 輸出的暫存 `fixture.json`，不是帳號設定檔。工具只接受 loopback 的隔離後端資料，帳號固定為 `mobile-a`／`mobile-b`／`mobile-empty`，密碼透過環境傳入 Maestro。勿使用正式帳號；本機診斷檔可能包含 fixture 密碼與畫面，放在每次產生的私有暫存目錄，勿提交。

預設 `--suite auth-trips`；其餘 suite 都需要保留環境輸出的控制通道。若提示缺少控制資訊，重啟 `dev:mobile-api` 並更新 Metro API 位址。各進階流程開始會清除此 fixture 的登入次數限制；撤銷／到期命令必須實際影響至少一個有效 session，否則測試失敗。控制請求由電腦上的驗收工具發出，不從手機呼叫。

預設驗證英文；裝置使用其他語系時，傳入 `--locale zh`／`zh-CN`／`jp`。此選項只切換斷言文字；`locales` suite 或明確傳 `--native-locale` 才會暫時切換原生 App 語系，結束後還原。深淺色與文字大小由裝置設定控制。第一次開啟 Expo Go 的系統提示請先完成，再跑流程。iOS 測試模擬器請在 Settings → General → AutoFill & Passwords 關閉 AutoFill Passwords and Passkeys，避免系統儲存密碼提示遮住測試；這不改動 App 的自動填寫能力，也不代表已驗證密碼管理器整合。重複執行若觸發 429，在隔離後端終端輸入 `reset-limits` 後再試。

D 基本流程使用 `--suite drafts --native-sqlite`（限隔離模擬器與 fixture）：

```sh
pnpm --filter travel-budget-mobile test:native \
  --suite drafts --platform ios --device IOS_UUID --fixture FIXTURE_PATH \
  --metro-port 8093 --network-port 61113 --native-sqlite \
  --text-size default --appearance light
```

Android 換成 `--platform android --device emulator-5554`，先 `adb root`，再建立 Metro 的 `adb reverse tcp:8094 tcp:8094`；重啟 adb 會清除此轉送。`draft-offline`／`queue-multiple` 暫時開啟模擬器飛航模式並關閉 Wi-Fi 與行動數據，流程結束會還原原設定；iOS 模擬器採 HTTP 斷線注入，不能當作真機飛航證據。D suite 在 iOS 最大字級時以既有 deep link 開啟新增表單，避免 Maestro 旅行卡片邊界定位失準；此路徑不驗證卡片導覽，其他配置仍走旅行摘要入口。`--flows` 可選 `draft-restart,draft-offline,draft-expiry,draft-snapshot,draft-accounts,draft-revoked,draft-storage,draft-open-failure,queue-storage,queue-multiple,queue-edit,queue-lost,queue-members` 的子集。

精確當機在新的 managed Git worktree 執行 `pnpm --filter travel-budget-mobile exec node scripts/instrument-native-sqlite.mjs --workspace WORKTREE_ROOT`，只在該隔離 checkout 包裝 SQLite、憑證寫入、C 序列與 HTTP 邊界；原 checkout／正式 bundle 不含暫停點。其 Metro 設定 `EXPO_PUBLIC_NATIVE_SQL_GATE_URL`（iOS loopback 或 Android `10.0.2.2`）、`EXPO_PUBLIC_NATIVE_ACCOUNT`／`EXPO_PUBLIC_NATIVE_TRIP` 為 fixture writer／writerTrip，再搭配 `--sqlite-gate-port` 與同一 proxy port 執行 `--flows draft-crash,queue-crash,queue-revocation-race`。每個案例保存 gate 時間／UUID、真 SQLite 檢查點與 HTTP 證據。

其他撤權時機用 `--flows queue-serial-revocation,queue-refresh-revocation,queue-late-options,queue-late-preview`。序列案例先排入真 C receipt lookup、暫停其 HTTP，核對 retry 已排隊後才撤權；refresh 案例注入首次 POST 401、完成真 refresh，再暫停憑證發布以核對重送前撤權。晚到選項／預覽案例保留真後端 200，切背景並從另一表單取得實際 404 後才釋放回應。只計實際 UI、SQL、gate、HTTP 與 DB 斷言；測試 adapter 不代表正式 App 有此排程。

D 顯示矩陣使用 `--suite draft-display --native-sqlite --native-locale --locales en,zh,zh-CN,jp`，每平台跑四語 × 預設／最大字級 × 深淺色共 16 組。每組涵蓋真 SQLite 保存失敗／重試、明確均分確認、待送內容、移回草稿、快照更新時間與捨棄，並核對原始輸入及零入帳；不是所有故障逐配置重跑。`--display-start en-largest-light` 可接續未完成配置；`--display-text-sizes default` 可先完成單一字級。每組開始只停止 App 並清理該 disposable fixture scope，原始證據保留。iOS 部分成員／捨棄點擊受 Maestro 畫框定位影響，仍需原生操作輔助及獨立 SQL／HTTP／DB 複核；工具失敗不可改寫成通過，操作通過也不代替視覺檢查。

refresh／憑證案例為 `queue-refresh-failure,queue-credential-failure,draft-legacy,draft-incompatible`；後三者需要隔離 checkout 與 gate。`draft-incompatible` 保留有效 token 外層格式，只使快取 user 缺少必填欄位，核對離線拒絕、線上刷新與草稿恢復。憑證失敗是在 SDK 寫入前回報錯誤，舊格式仍透過真 SecureStore 保存 token；此注入不能當作實際 Keychain 故障。快速編輯案例 `draft-edit-race` 在原生 SQL 更新前暫停，核對返回重進與捨棄競態。

跨環境使用 `--flows draft-environments --other-metro-port 8097 --other-network-port 61117`；另啟動相同專案的 Metro，API 指向第二個 proxy port（Android 使用 `10.0.2.2` 並建立該 Metro 的 adb reverse）。兩個代理仍轉送同一隔離 fixture，只改 App 的 API environment key；核對另一環境看不到原草稿／成員選項／待送紀錄，回原環境 UUID 與內容不變，HTTP／DB 零入帳。流程完成後只清理兩個測試 scope。

額外 HTTP 故障案例使用 `--flows queue-rate-post,queue-rate-lookup,queue-conflict`；代理明確標記 `injected`，分別注入 POST／receipt lookup 的 429 或 POST 409 後 lookup 403。429 保留實際 180 秒 Retry-After、不改產品計時，跨重啟與 C 手動操作核對沒有提早 HTTP；409 保存凍結紀錄、無後端寫入。衝突量測結束才停止 App、刪除這份 disposable fixture 指定帳號／環境／旅行的本機草稿／快照／queue／pending，其他 scope 不受影響。

工具保存私有 `sqlite-*.json` 與每案例不可覆寫的 `sqlite-evidence.json`、`auth-trace.json`、`entry-results.json` 與畫面；HTTP 只保存寫入 UUID、內容 SHA-256 與帳號／狀態，不保存 body 或 token。若 iOS Maestro 將完成鍵定位到舊畫框，先在目前裝置、字級與鍵盤畫面核對完成鍵位置，才可傳 `--ios-done-point x%,y%`；目前 iPhone 18 Pro／預設字級數字鍵盤使用 `89%,62%`。工具在完成鍵前後核對完整金額；此座標不能直接套到其他機型或配置。

## D1 草稿驗收交接

程式已實作；2026-10-05～06 已完成 iOS／Android 主要情境複驗，通過範圍與證據見 [archive](archive/README.md#d-草稿離線入口與待送佇列2026-10-05)。以下為完整驗收契約，部分通過不代表整表完成，未執行項目不計通過，也不計入既有 C 證據。使用隔離 fixture 與原有故障代理，核對畫面、本機草稿／pending 狀態、HTTP UUID，以及後端 expense／receipt 筆數。

| 情境             | 操作與預期                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 續填／重啟       | 輸入部分說明、`12.` 金額、不完整日期、分類與成員，等「草稿已保存」；返回再進入、切背景及強制關閉重開後可選「續填草稿」，原始文字不變，未入帳且無舊預覽。                                    |
| 捨棄／快速編輯   | 快速修改後捨棄，再重新進入；舊草稿不復活，新草稿獨立。保存中立刻返回／重進不得覆蓋最新輸入。                                                                                                |
| 帳號／環境／旅行 | A 填寫後登出換 B，B 不見 A；回 A 可續填。另一旅行及另一 API 環境也互不可見。                                                                                                                |
| 選項／撤權       | 改變旅行成員或分類後續填，失效付款人／分類要求重選，分攤成員需明確移除；不可靜默縮小分攤。撤權隱藏草稿，之後斷線仍隱藏，成功重新授權才顯示。                                                |
| 存檔失敗         | 在隔離測試 build 注入 SQLite 開啟／寫入／捨棄失敗，畫面不得顯示成功；輸入保持可重試，保存或交接失敗時 HTTP 寫入為零。已保存版本仍可恢復。                                                   |
| 交接當機         | 在隔離測試 build 於 pending 插入前、插入後尚未 COMMIT、COMMIT 後尚未 HTTP，以及伺服器已提交尚未本機清理時終止。重開只出現可編輯草稿或原 UUID 的 pending；不得同時出現可再次提交的來源草稿。 |
| 單次記帳         | 「續填 → 新預覽 → 確認」，配合提交後丟回應、重啟與原內容重試；後端支出與 receipt 各一筆，重試 UUID／內容不變。成功後返回新增入口不再提供原草稿。                                            |
| 四語與操作       | `zh`／`zh-CN`／`en`／`jp`，深淺色、最大字級、鍵盤、VoiceOver／TalkBack；保存狀態、失敗與續填／捨棄可讀可操作。                                                                              |

現有 `entry` Maestro suite 可回歸 C；D1 續填選擇需要額外操作，不把舊 suite 直接視為 D1 證據。SQLite 存檔／捨棄／交接／清理故障由工具在隔離 fixture 的裝置資料庫加入限定帳號、環境、旅行的觸發器；開啟故障先保存 DB／WAL／SHM，完成或失敗後還原。精確交接當機另在隔離 checkout 加入 SQL 暫停點，不加入正式 App。開發自動測試以同一 SQL、真 SQLite、子程序直接終止及模擬 HTTP 覆蓋這些分支。只對已落盤輸入承諾恢復；斷網冷啟動由 D2 本機入口補上。

## D2 離線入口驗收交接

D2 程式已實作；兩平台主要裝置情境已通過，剩餘補驗待完成，已通過範圍見 archive。以下保留完整操作契約，尚未驗證的組合不計通過；使用隔離帳號／fixture，核對畫面、SQLite 與 HTTP／expense／receipt 筆數。本機模式只存草稿，恢復連線本身應為零次支出寫入。

| 情境                   | 操作與預期                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 最小快照               | 線上登入並開啟旅行摘要，待成員選項載入；確認本機入口顯示旅行名稱與選項最後更新時間。SQLite 不包含帳務花費、餘額、預算、token 或分攤預覽。                                                                        |
| 飛航模式／新草稿       | 斷網，從旅行列表開啟「本機支出草稿」並選已保存選項的旅行；建立未填完的金額／日期，顯示已保存在此裝置且尚未入帳。預覽／確認不可操作，HTTP 無建立支出。                                                            |
| 強制關閉／續填         | 保存成功後強制結束 App，維持飛航模式重開；恢復登入的斷線／逾時後進入受限本機入口。可明確續填或捨棄，輸入原樣恢復；不能進入帳務頁或送出。捨棄後的新草稿使用當前快照。                                             |
| 尚無選項／舊憑證       | 只有旅行名稱或完全沒有快照的旅行提示需連線；不假稱載入成功。舊格式 refresh token 未經本版成功線上恢復，不猜帳號、不提供本機身分。                                                                                |
| 身分格式不相容         | 保存有效 refresh token 但缺少目前 user schema 的必填欄位；線上重啟須成功刷新並保存新身分，離線重啟不可開啟本機帳號資料，不應誤報儲存失敗。兩平台已補驗，範圍與證據見 archive。                                   |
| 登入到期               | 離線時明確標示線上登入未驗證；恢復網路後若 session 已失效，重新登入，不能沿用本機身分提交。登入成功後原草稿仍按帳號恢復。                                                                                        |
| A→B→A／環境            | A 保存草稿與快照，線上登出登入 B；B 不見 A 旅行名稱、成員或輸入。A 再登入仍可續填；另一個 API 環境同帳號不見原環境內容。                                                                                         |
| 成員異動／重新確認     | 草稿離線期間移除分攤成員；恢復登入並前往線上新增入口，重讀選項，原選擇保留且失效項目須明確修正。新預覽與使用者確認前不寫入；完成後 C 只產生一筆 expense／receipt。線上表單已有預覽再斷網，也須重取預覽。         |
| 已知撤權／重啟         | 旅行或成員選項讀取／預覽收到 403／404 後，本機入口立即隱藏名稱、成員與草稿；拒絕標記保存後，斷網重啟仍隱藏。暫時性失敗或旅行列表重新取得名稱不能解除拒絕，只有新選項成功讀取與保存才解除。原草稿／pending 保留。 |
| 快照保存失敗           | 隔離 build 注入 SQLite 快照寫入失敗；顯示提示，線上流程不假稱快照已保存。拒絕標記寫入失敗時本次執行仍隱藏，讀列表先重試，失敗顯示讀取錯誤；只對已成功落盤的拒絕標記承諾跨重啟保護。                              |
| 舊 pending／無自動提交 | 有 C 結果不明紀錄的旅行不能另建草稿。受限本機模式不自動查詢／重送；登入恢復後可到原線上入口查詢 C，沿用原 UUID。新草稿與恢復連線均不自動提交。                                                                   |

裝置故障注入沿用 D1 的隔離 build 要求；本次開發測試與三平台匯出不代替上表。D3 佇列操作表見下一節。

## D3 佇列驗收交接

D1／D2／D3 程式已完成；2026-10-05～06 主要裝置情境已通過，已通過範圍見 archive，此表尚未全部計通過。前景佇列契約見 [後端契約](BACKEND_CONTRACT.md#d3-離線確認與分攤契約)，沿用本文件的隔離 backend／proxy／DB，核對畫面、HTTP 及 expense／receipt／副作用，不只看顯示成功。

| 情境                           | 兩平台核對                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 離線多筆／冷啟動               | 線上讀旅行後飛航，確認均分規則加入兩筆；SQLite 保留兩 UUID，重啟可看到；只存草稿不得自動加入。恢復有效登入／前景連線才序列送出，後端份額與尾差正確，每 UUID 只入帳一次。                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 修改／捨棄                     | queued 可捨棄或移回草稿，原輸入完整且重新確認才送；現有草稿不被覆蓋，另行明確確認替換後舊存檔不復活。prepared／sending／unconfirmed 禁止修改或捨棄。                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 成員／順序變更與撤權           | 同步重讀選項後需處理，不靜默修改成員；預覽或 SQLite 交接／C 讀取、序列等待或 refresh 期間撤權及晚到舊回應不送出；恢復權限不自動重送 attention。已送出後撤權保留凍結紀錄，恢復後查原 receipt。                                                                                                                                                                                                                                                                                                                                                                                            |
| 交接當機／丟回應               | 在確認交易、prepared 交易與 POST 成功後分別強制結束；重啟前兩者不得半套交接，後者只查原 UUID；not_found 可同 payload 重試，不建立第二筆 receipt／expense 或副作用。                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 中途斷線／背景                 | 在選項、預覽與 POST 各階段斷線／切背景，未開始下一步；已開始請求可結案。前景恢復後從持久化狀態繼續，不改凍結內容。                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 409／429                       | 409 查原 UUID，查回不同內容保留衝突提示，僅能移除提示；無 receipt 或查詢被 401／403／404／429 拒絕仍保持衝突，不自動重送或換 UUID。429 分別由 POST、C 手動查詢／重試、啟動恢復及 POST 失敗後查詢注入；依 Retry-After 暫停，重啟不能提前查詢或送出。同帳號 A 的衝突紀錄收到 429／120 秒後重啟，過 31 秒旅行 B 仍不可查選項／預覽／送出或經 C 恢復／手動查詢 receipt；120 秒到期後 B 可送，A 無 receipt 仍不可自動 POST，另驗 A 在查選項時收到 429 後捨棄／移回草稿，再重啟，B 仍須等滿 120 秒才能入帳；核對 SQLite 獨立帳號／環境期限不隨支出列刪除。兩平台已補驗，範圍與證據見 archive。 |
| 旅行內阻塞／跨旅行繼續         | 同帳號先排旅行 A 兩筆、旅行 B 一筆；A 第一筆 409 無 receipt 或被原 C pending 阻擋交接時，保存等待並跳過 A，B 仍只入帳一次。等待中重啟不重打 A 選項／預覽／POST；409 不自動重送，C 結案且到期後 A 恢復。兩平台已補驗，範圍與證據見 archive。                                                                                                                                                                                                                                                                                                                                              |
| 登入失效／refresh 失敗／換帳號 | 401／refresh 500 及輪替儲存失敗不清佇列；B 看不到、送不出 A 的紀錄，A 重新登入後依原 UUID 恢復；不同環境同樣隔離。                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 存檔／清理失敗                 | 確認或 prepared 落盤失敗不送 HTTP；結案清理失敗保留紀錄並查 receipt，不把已入帳支出重新輸入。四語、最大字級、深淺色與錯誤提示可操作。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 尚未完成的驗收

已完成的登入／旅行、A／B 與 C 核心修正結果，以及本機歷史證據，合併至 [archive](archive/README.md)。依 2026-10-06 使用者決定，下列未驗項目全部暫緩，不阻擋合併 master 或進入 E 開發；保留待驗狀態，不計通過。對外測試前須回到本清單完成核對，真機／development build 於 F 處理：

- D：主要草稿／離線／佇列、故障與撤權競態、32 組配置操作已完成。2026-10-06 補驗兩平台長名稱最大字級深淺色與選取、身分格式相容性、跨旅行阻塞及共用限速／重啟／競態；120 秒被延長至 149 秒的 P2 已修正，原生流程確認沿用原期限及 UUID。證據與隔離元件／原生流程的驗證範圍見 [archive](archive/README.md#d-草稿離線入口與待送佇列2026-10-05)。D 核心交付完成；剩餘閱讀器補驗暫緩，完整裝置驗收尚未結案。
- 閱讀器：VoiceOver 已補驗必填／格式／日期／逾時錯誤、停用按鈕朗讀，以及 A→B→A／實際撤權下的資料隱藏與焦點。忙碌 AX 狀態已核對，實際忙碌朗讀、完整觸控手勢及 C 手動恢復操作仍未全部核對。2026-10-06 依使用者決定，TalkBack 保留待人工驗收；本次 Device Hub 能切換 VoiceOver 及讀取原生樹，但無法可靠完成裝置內輸入／完整手勢，也沒有實際朗讀音訊可核對，未驗範圍不計通過。
- C（依使用者決定曾暫緩，不阻擋 D1）：iOS 軟體鍵盤已完成整段 `entry-create` 並核對 receipt／份額／副作用；VoiceOver 已完成主要輸入、保存失敗重試、離線續填、入佇列／移回草稿及重新授權後確認送出，連線恢復由前景查 receipt 清理。閱讀器剩餘範圍見上一項。既有兩平台十個核心情境及 C 的 32 組顯示配置保留原通過範圍；共用選項元件修正後的兩平台最大字級深淺色／選取已補驗。Android Gboard 輸入與動作鍵已操作驗證。
- A：支出／結算的大字級／外觀矩陣，以及裝置上的「撤銷旅行資格後再斷線」組合故障。兩平台四語／預設字級／淺色的完整登入與唯讀流程已通過。
- 網路／後端：裝置斷網／飛航模式、限速與封包遺失、429 真實交易競爭；refresh 400／413／415 故障目前只有模擬 HTTP 證據。
- 建置／裝置：完成 development build 與 iOS／Android 實體裝置驗收。根 check／build 基線已修復並通過；Expo Go 或 bundle export 不替代原生建置與真機項目。

開發順序與交付條件見 [ROADMAP](ROADMAP.md)。本文件維護可重跑的操作與未驗項目，已完成結果只更新 archive 摘要。

E 裝置驗收時程：依 2026-10-06 使用者決定，待 E1–E4 全部功能完成，再統一執行 iOS／Android 的完整使用流程、各片操作與必要故障驗收。各片先完成程式審查與自動化驗證並保留操作清單；尚未操作的裝置項目維持待驗，不計通過。

## E1–E4 原生驗收紀錄（2026-10-06～2026-10-07）

狀態：**2026-10-07 E1–E4 本機原生驗收完成；真機／development build／完整閱讀器與外部郵件投遞未驗**。使用 iOS 27 iPhone 18 Pro Simulator 與 Android 36 Emulator 的 Expo Go，連接 disposable MongoDB／本機 Next.js HTTP；下列原生證據與開發測試分開計算。

- 兩平台各 15 個基本操作案例通過：註冊與登入、建立旅行、邀請複製及另一帳號加入、新增 TWD 100、保留帳務修改基本資料、部分還款 10／撤銷、刪除支出、寄碼受理／前導零碼確認、新密碼登入與冷啟動。後端核對修改金額、還款／撤銷、刪除及舊 session 拒絕。
- 兩平台故障套件各 28 個操作案例通過：E1 建立、E3 修改／刪除、E4 登記／撤銷的 SQLite 保存失敗零寫入 HTTP，以及丟回應後重啟、查回原 UUID，核對每個 UUID 僅一次寫入；最終支出／還款皆零筆。
- 四語顯示主套件每平台 66 個案例通過，涵蓋四語各「淺色／預設字級」及「深色／最大字級」；建立／加入驗證、邀請複製／系統分享、0.01 均分與付款預覽、離開提醒、帳號錯誤／下一欄。兩平台另兩組外觀／字級各 66 個補驗案例已通過，基本顯示補齊完整 16 組；原生零未確認寫入、各 fixture 保留一筆支出／零還款。證據 `/tmp/tb-e-matrix-extra-android-en-1791358034281/display-final-audit.json`、`/tmp/tb-e-matrix-extra-ios-en-1791358590765/display-final-audit.json`。兩平台完整警告／危險確認亦已補齊 16 組，結果見下方。
- 本機 Resend adapter 實際產生並接收驗證碼：iOS 22 案例通過；Android 主套件 21 案例加未知 Email 原生補驗 1 案例通過，主套件失敗仍保留。涵蓋 72／73 bytes、六字元新密碼、可用碼重寄保護、五次錯誤與 60 秒恢復、新碼重設丟回應、舊 access／refresh 拒絕、C／D／E 本機紀錄保留與原 UUID 同步。到期使用 scoped DB 時間注入；此工具不發外部郵件，不等同正式信箱投遞驗收。
- 兩平台 E2 寄碼／驗碼各自期限已以實際寄碼與真實等待通過：寄碼 3300 秒仍可驗碼、驗碼 120 秒不阻擋手動重寄、重寄不清驗碼期限、零自動確認且到期手動成功。證據 `/tmp/tb-e-account-rate-ios-en-1791348868746/account-rate-evidence.json`、`/tmp/tb-e-account-rate-android-en-1791350211876/account-rate-evidence.json`；產物已清除碼與敏感畫面。
- 兩平台 E2 註冊 120 秒限制、到期手動成功與離開 busy 表單後晚到回應不覆蓋登入輸入已通過。證據 `/tmp/tb-e-account-boundary-ios-en-1791349381853/account-boundary-evidence.json`、`/tmp/tb-e-account-boundary-android-en-1791350755714/account-boundary-evidence.json`；Android 清除欄位留下尾端／空值定位失敗另保留，後續以等待前後精確輸入斷言補驗。
- Web 建立帳號在兩平台原生登入；兩平台實際重設帳號以新密碼在 Web UI 登入並讀回原旅行。註冊雙擊、busy 與大小寫／空白衝突兩平台各 2 案例通過，DB 每個身分仍僅一 user。
- 進階帳務套件 Android 41／iOS 40 個案例通過：歷史外幣與非均分資料保留、衝突後手動確認、三人同名依 ID、第三人登記與反向／超額付款、撤銷前內容變更、成功後重讀失敗只重讀、刪除附件清理及原 receipt 重播不復活。Web UI 複驗發現同名成員角色／預填混淆，已改以成員 ID 判定並補回歸測試。私有證據：`/tmp/tb-e-advanced-android-en-1791302003408/advanced-evidence.json`、`/tmp/tb-e-advanced-ios-en-1791303051535/advanced-evidence.json`。
- 兩平台邊界補驗已核對同名成員 ID 替換的拒絕／原輸入重開、單筆資源 404 保留旅行、舊邀請碼終局拒絕、加入丟回應後移除成員／刪除旅行的原 UUID 查詢與重試不再送 POST、邀請頁背景／晚到回應／撤權不殘留碼，以及支出／還款撤權後隱藏私人表單且保留原生 SQLite pending。HTTP／SQLite audit：`/tmp/tb-e-boundary-rest-android-en-1791304805247/boundary-evidence.json`、`/tmp/tb-e-boundary-ios-en-1791338028770/boundary-evidence.json`；行程變更先前證據另保留於 `/tmp/tb-e-boundary-android-en-1791304538336`，錯誤刺激與操作腳本失敗不改寫為通過。
- 兩平台已補驗 E1 建立、E3 修改／刪除與 E4 登記／撤銷的實際 SQLite 結案 UPDATE 失敗；冷啟動與原 UUID 查詢皆不重送，五筆 receipt 已提交、最終支出／還款零筆。證據：`/tmp/tb-e-completion-android-en-1791338651973/completion-evidence.json`、`/tmp/tb-e-completion-ios-en-1791339776733/completion-evidence.json`。這不取代提交後、結案前真正終止程序的驗收。
- 兩平台已完成建立旅行 POST／原 UUID 查詢、修改支出、登記還款四個入口的實際 HTTP 429／Retry-After 120：31 秒後冷啟動內 C／D／E 零提早查詢／寫入，SQLite 原始期限與 UUID／內容保留；到期後 D 僅同步一次，E 明確重試沿用原 UUID／body。iOS 第一輪末項超過期限，已保留失敗並重新收到實際 429 後補通過。各入口證據位於 `/tmp/tb-e-rate-{e1,e1-lookup,e3,e4}-{android,ios}-en-*/rate-evidence.json`；iOS 還款最後一輪為 `/tmp/tb-e-rate-e4-ios-en-1791343293256/rate-evidence.json`。兩平台另通過跨旅行 E3／E4 共用期限攔截，證據 `/tmp/tb-e-rate-cross-trip-e1-android-en-1791342774719/cross-rate-evidence.json`、`/tmp/tb-e-rate-cross-trip-e1-ios-en-1791348556959/cross-rate-evidence.json`。
- iOS／Android 兩位正式成員以相同舊結算版號同時送出不同 UUID：一筆付款成功、一筆終局 `SETTLEMENT_CHANGED` 且原輸入保留，DB 核對僅一 payment、兩 receipt、各一付款通知／活動。私有證據：`/tmp/tb-e-payment-pair-evidence.json`；第一輪腳本提早結束的失敗另保留，不列通過。
- 兩平台 C／D／E 完整協調以新 fixture 通過：同旅行 C／D 與 E3／E4 互擋、另一旅行還款／佇列可繼續、原 pending 保留且解除後只提交一次。證據 `/tmp/tb-e-coordinator-e1-android-en-1791347616274/coordinator-evidence.json`、`/tmp/tb-e-coordinator-e1-ios-en-1791347616275/coordinator-evidence.json`；前次已同步 fixture、草稿恢復與捲動腳本失敗保留，不算通過。
- 兩平台五種操作（E1 建立、E3 修改／刪除、E4 登記／撤銷）已通過兩個真正程序終止時點：SQLite 保存後／fetch 前，以及 HTTP 成功後／SQLite 結案前。核對原生 pending payload、後端 receipt 指紋、跨帳號／API 環境隔離與原 UUID 恢復；送前手動提交一次、提交後只查不重送，最終支出／還款零筆。送前待確認畫面亦通過四語完整 16 組顯示。
- 三個 await 時點新增限速的 30 組案例通過：fetch 前、實際 401 refresh 後、SQLite 插入前，各五種操作／兩平台。保存原始 120 秒期限，實際等待 31 秒後冷啟動零提早查詢／寫入；到期手動沿原 UUID／body 提交一次。插入前使用隔離開發 gate，並非 SQLite 檔案鎖。
- 同程序 A→B→A 延遲保存共十組案例通過：實際切換前後 Expo PID 相同；A 晚到保存仍歸 A，B 不查送 A UUID、不受晚到導頁影響；回 A 才手動提交原 UUID 一次，最終帳務零筆。

| 補驗證據           | 私有目錄（各有結果 JSON、HTTP／原生 SQLite 核對）                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 送前程序終止       | `/tmp/tb-e-presend-android-en-1791348428842`、`/tmp/tb-e-presend-ios-en-1791349677087`；Android E1／E3 原生 payload 補核對 `/tmp/tb-e-presend-body-android-en-1791351432290` |
| 提交後程序終止     | `/tmp/tb-e-postsend-android-en-1791352287328`、`/tmp/tb-e-postsend-ios-en-1791353011294`                                                                                     |
| fetch 前等待限速   | `/tmp/tb-e-guard-rate-mutation-before-fetch-android-en-1791353353932`、`/tmp/tb-e-guard-rate-mutation-before-fetch-ios-en-1791354653224`                                     |
| refresh 後等待限速 | `/tmp/tb-e-guard-rate-mutation-after-refresh-android-en-1791354801201`、`/tmp/tb-e-guard-rate-mutation-after-refresh-ios-en-1791355651829`                                   |
| 插入前等待限速     | `/tmp/tb-e-guard-rate-mutation-before-sqlite-insert-android-en-1791356192385`、`/tmp/tb-e-guard-rate-mutation-before-sqlite-insert-ios-en-1791356625533`                     |
| 同程序身分隔離     | `/tmp/tb-e-live-scope-android-en-1791357155426`、`/tmp/tb-e-live-scope-ios-en-1791357622043`                                                                                 |

證據限制：iOS 提交後程序終止續跑曾覆寫 gate 事件檔；五種操作改以程序終止後的原生 pending 快照、先前成功 HTTP、後端 receipt 與冷啟動／scope 操作交叉核對，不把遺失事件檔計為證據。Android refresh 還款第一次冷啟動落入離線身分並超過窗口，另以同 UUID／body 再次實際 401 refresh、新增期限補驗。未到 gate、驅動逾時、定位、查詢注入與 Expo 浮層遮擋等失敗均保留，不列通過；每組僅以完整後續核對計通過。

- 尚未執行的範圍見下方剩餘待驗清單；準備好的腳本不計通過，完整閱讀器／真機範圍保留於 F。

私有本機證據（含原生操作 log、截圖及結果，勿公開其中帳號／輸入）：`/tmp/tb-e-acceptance-ios-en-1791281610222`、`/tmp/tb-e-acceptance-android-en-1791281534379`；故障結果位於 `/tmp/tb-e-faults-ios-en-1791285121386`、`/tmp/tb-e-faults-android-en-1791284774392`。基本流程終局 DB 核對：`/tmp/tb-e-final-basic-audit.json`（每旅行兩位成員、六筆已提交 E receipt、支出／還款零筆）。`results.json` 僅以 `passed: true` 計通過；歷史失敗與後續補驗皆保留，不算作產品通過。

裝置驗收發現 Android 離開提醒把長說明當成標題而截斷；已改為短標題與完整訊息，四語完整 16 組已重新驗證通過。Android 補驗 65 個原生案例皆通過，零未確認寫入、原支出／還款各一筆保留；證據 `/tmp/tb-e-supplement-android-en-1791361397646/display-final-audit.json`。iOS 四語完整 16 組亦通過，含最大字級提示框內捲動、全文與段末核對；68 個通過紀錄含 65 個主案例、冷啟動環境確認及兩個返回結算頁續驗，零未確認寫入，原支出／還款各一筆保留。證據 `/tmp/tb-e-supplement-ios-en-1791363439453/display-final-audit.json`。兩平台關鍵最大字級警告／危險標籤另人工檢視 18 張截圖，清單 `/tmp/tb-e-visual-qa-evidence.json`；全矩陣原生操作與人工截圖檢視範圍分開計算。

續驗曾因其他環境切換，使 Expo bundle 的公開 API 位址與驗收 Metro 啟動值不一致：日文最大字級在登入頁停止，恢復登入亦失敗；該登入送往正式 API，不算本機驗收，未進入帳務表單。失敗證據保留。改用獨立暫存 source／Metro cache、`EXPO_NO_DOTENV=1`，先讀取實際 iOS bundle 確認 API 指向本機代理，再啟動 App；原測試帳號冷啟動恢復通過。後續驗收均以代理流量核對環境。日文最大字級另因返回結算頁時的捲動方向／位置判定而逾時；深淺色原流程均已完成警告與撤銷取消，保持 App 不重啟並補驗回頁首、向下捲動及總額顯示通過。結果連結原失敗 log 與各組 `*-return-continuation.log`，不改寫原失敗證據。

為原生驗收增加穩定操作 testID，並擴充按環境／帳號隔離的 SQLite mutation 保存／結案故障注入。Mobile check、723 項測試（689 Vitest＋34 工具）與 iOS／Android／Web 匯出通過；Web 型別／Lint／格式及 2,054 項測試通過，另 442 項隔離整合測試未在此輪執行；匯出不算原生驗收。驗收完成後依使用者要求提交，兩應用各調升 patch；未部署或執行遠端 migration。

### 剩餘待驗清單

E1–E4 本機 iOS／Android Expo Go 操作與故障矩陣已完成，Web production build 與交付檢查通過。下列範圍保留待驗，不計通過：

1. F：真機、development build、完整 VoiceOver／TalkBack（含先前 C／D 暫緩範圍）。
2. 外部正式信箱投遞：localhost 收件匣已驗，不代表實際郵件供應商／收件匣投遞成功。

驗收與補核對工具位於私有 `/tmp/tb-e-*.mjs`，顯示續驗入口為 `/tmp/tb-e-supplement-resume.mjs`；原生證據與歷史失敗保留在 `/tmp/tb-e-*`。開發 gate 僅在隔離 worktree `/Users/mhhung/.codex/worktrees/e-native-acceptance-7684/travel-budget`，未加入主專案產品程式。續驗前先確認 disposable API、Metro 與模擬器仍可用；若重建 fixture，需使用新帳號 ID／權杖／連接埠，不沿用舊秘密。

## E1 旅行入口驗收交接

狀態：程式與自動化檢查已交付，審查兩項 Web P2 已修並通過獨立複驗；後續多成員加入時通知重複鍵亦已修正並通過真 MongoDB 回歸，見 [E 成果](archive/README.md#e1e4-基本使用流程2026-10-062026-10-07)；**本機 iOS／Android 操作與故障矩陣完成，證據及限制見上方原生驗收紀錄**。D 既有通過不能覆蓋 E1。以 `pnpm --filter @travel-budget/web dev:mobile-api` 的 disposable MongoDB／實際 HTTP 為後端，使用既有隔離帳號；邀請頁後端 `APP_URL` 與手機 `EXPO_PUBLIC_WEB_ORIGIN` 須是同環境網站 origin。不同 origin 時明確配置；碼輸入不需連結 origin。

| 情境         | 操作與核對                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 建立／記帳   | 空列表與一般列表建立旅行，無日期／單側日期／跨年／閏日可成功，空白名稱／倒置／非真實日期被拒；新旅行 admin、本人花費／餘額零，再新增一筆 TWD 支出核對只有一筆。                                                    |
| 建立回應遺失 | 擷取同一 UUID 丟掉 POST 回應，再終止 App／重開；「待確認操作」可查回同旅行，不自動 POST／不建立第二份。核對 `mutationrequests` `_id=account:uuid` 與旅行筆數，不按名稱猜測。                                       |
| 保存／當機   | SQLite 保存失敗零 HTTP；保存成功、POST 前終止後只查結果，明確重試使用原 UUID／body；POST 後、SQLite 結案前當機也只查原 receipt。未結案不能捨棄或修改。                                                             |
| 加入與邀請   | 舊 6 碼／現行碼、大寫與空白、同環境 `/join/` 連結可加入；外站／ObjectId／虛擬認領／相簿連結拒絕，已加入直接回原旅行；核對至少兩位既有正式成員再加入，各收件人通知獨立；雙擊／併發核對 member、通知／動態只有一份。 |
| 權限與結案   | 重設舊碼回無法加入並可查終局拒絕；加入成功再移除成員時原 UUID 重播／查詢不可重新加入；旅行刪除後不復活；邀請頁背景／換帳號／撤權及晚到回應都不殘留碼。                                                             |
| 隔離／限速   | A→B→A、跨 API 環境僅讀送原 scope；E POST／查詢取得 429 等待 120 秒，重啟 31 秒 C／D／E 不送，120 秒到期才恢復，短等待／移除提示不延長或清期限；refresh／SQLite 等待中的新期限也攔截 fetch。                        |
| 四語／無障礙 | 建立、加入、邀請、待確認畫面兩平台核對四語、深淺色、預設／最大字級、鍵盤捲動／完成鍵、欄位錯誤焦點、busy／disabled、未儲存離開提醒、複製／系統分享。完整閱讀器與真機範圍仍列 F。                                   |

故障代理目前的丟回應模式以既有支出路徑為目標；E1 可用可控代理的 `/api/v1/trips`／`trips/join` 丟回應，或沿工具真 HTTP 測試的 raw socket 模式。不要把未擴充的支出代理模式當 E1 裝置故障已驗。遠端部署、migration、store build 不在本次開發範圍。

## E2 帳號入口驗收交接

狀態：程式已實作，寄碼 429 誤鎖驗碼的 P2 已修正並通過獨立複驗；後續匿名換碼採可用碼 15 分鐘保護，鎖死碼允許 60 秒後重寄；手機收到次數用盡時解除舊寄碼等待並由後端重查，兩平台已操作核對；最新 Mobile／Web 自動化結果見上方原生驗收紀錄。E2 既有獨立基線為 Web 2,043 項、隔離交易 14 項及真 HTTP、frozen install、根 check／build、Expo 相容性通過。iOS／Android 基本操作已執行；完整範圍見上方原生驗收紀錄。開發測試不列為裝置通過；不讀正式信箱／log，也不把密碼／碼放進 SQLite、查詢快取或截圖。產品規則與環境限制見 [E2 契約](BACKEND_CONTRACT.md#e2-註冊與-email-驗證碼重設)。

限流回歸：首次寄碼或重新寄碼收到 `Retry-After: 3300` 後，仍可提交已有的有效碼；驗碼收到 120 秒等待後仍可明確重新寄碼，寄碼成功不解除驗碼等待。兩端同時受限時分別保留原期限，只在各自到期後允許該操作。四個回歸通過，前三個在修正前均失敗；獨立重現另外確認寄碼受限後立即驗碼成功，以及驗碼期限前 1 毫秒零 HTTP、恰好到期後允許驗碼，寄碼仍受限。兩平台已核對提交／寄碼按鈕與各自倒數，後端及 HTTP client 限流保留。

E3 開發 HTTP 複驗另修正零冷卻限流：較早捕捉時間的註冊／驗碼／來源請求晚到時，不因後到時間已取得計數而誤回 429；滑動時窗次數限制保留，晚到請求不縮短到期時間，拒絕以實際最早／最晚時間計算等待。三個逆序時間回歸在修正前皆失敗；獨立複驗 E2 隔離交易 17 項與完整真 HTTP 通過，此新增修正已完成審查。

使用 `pnpm --filter @travel-budget/web dev:mobile-api --mailbox` 可啟動僅綁定 localhost 的 Resend 相容收件匣，不發送外部郵件。私有 fixture 的 `mailboxUrl` 與 `mailboxToken` 提供受權杖保護的 `GET /messages`／`DELETE /messages`；內容僅存記憶體、不寫 log，停止環境後清除。預設未加旗標仍停用寄信，開發 HTTP 測試使用隔離 DB 的已知碼 hash。此工具已通過 HTTP／權杖／清除／批次測試，兩平台原生實際寄碼／確認已操作，範圍與注入限制見上方原生驗收紀錄；不能把 localhost 收件匣當作正式郵件投遞證據。交易回歸：

```bash
MONGODB_MEMBER_TEST_URI='mongodb://127.0.0.1:27017/?directConnection=true' MONGODB_MEMBER_TEST_ALLOW_WRITES=1 pnpm --filter @travel-budget/web exec vitest run src/__tests__/accountEntry.integration.test.ts
pnpm --filter @travel-budget/web test:mobile-api
```

| 裝置驗收情境             | 核對                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 註冊 → 登入 → E1         | 成功回登入並帶入帳號，Web／Mobile 互登入；同帳號／Email 大小寫及空白衝突只一 user                                                                             |
| 忘記密碼 → 六位碼 → 登入 | 存在／不存在 Email 相同受理及 429；前導零、15 分鐘到期、五次錯誤；可用碼不因重寄更換／延長；五次錯碼後，60 秒到期可手動重寄，新碼可驗；重新寄碼／已收到碼入口 |
| 斷線／丟回應／重啟       | 不自動重送、不落盤密碼；以新密碼登入確認已提交重設，user 只一筆，reset code 只消耗一次                                                                        |
| 舊 session 與本機紀錄    | 密碼重設後舊 access／refresh 拒絕；原帳號重新登入仍有 C／D／E1 紀錄，換帳號隔離                                                                               |
| 表單／離開／429          | 防雙擊，錯誤焦點、等待秒數、離開提示；返回／換登入後晚到結果不導向；六字元與 72 UTF-8 bytes 邊界，空白不 trim                                                 |
| 兩平台顯示與操作         | 四語、深淺色、最大字級、鍵盤捲動／下一欄／送出、可讀按鈕標籤；完整閱讀器／真機仍列 F                                                                          |

## E3 支出維護驗收交接

狀態：程式與開發自動化已完成，**獨立審查的兩項 P2 已修正並通過獨立複驗，未發現新問題；iOS／Android 本機操作與故障矩陣已完成，證據及限制見上方原生驗收紀錄**。原有 D 草稿與佇列資料保留，E3 未部署。

修正結果：衝突核對後，以原始基線保留實際修改，未修改欄位採最新 context，避免覆蓋 Web 更新；拒絕紀錄重開可明確切回基本資料，送出不包含均分欄位。原審查兩個畫面回呼案例在修正前皆失敗，已納入 `EditExpenseScreen.test.ts`；另涵蓋提交後終局拒絕、連續衝突、分類／日期明確修改與帳務欄位更新，畫面回呼測試不等同原生操作。

自動化使用真 Node SQLite 重開及隨機獨立 MongoDB replica-set DB；後者以 `MONGODB_MEMBER_TEST_URI`、`MONGODB_MEMBER_TEST_ALLOW_WRITES=1` 執行 `expenseMaintenance.integration.test.ts`，CI 已納入。`pnpm --filter @travel-budget/web test:mobile-api` 使用可丟棄 DB／Next.js，核對 metadata 保留、Web 修改衝突、0.01 均分、同 UUID 併發、真 socket 丟回應、刪除評論／blob retirement、C receipt 重播不復活。未使用遠端資料庫／migration。

| 裝置驗收情境                           | 應核對                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 基本資料與歷史帳務                     | 外幣／非均分／未知分類僅改所選欄位，附件／標籤／行程／建立資料不變；不改零 PATCH                                                     |
| 明確重新均分                           | TWD／匯率 1、安全成員才可切換；同名成員依 ID；0.01 三人尾差、付款人不在分攤、新舊差異及四語確認                                      |
| Web 同時改帳／刪帳／轉換身分／解除行程 | 舊 token 拒絕，輸入保留；最新內容核對後手動套用／重新預覽，確定拒絕重啟可明確保留原輸入重開                                          |
| 刪除與取消                             | 未確認零帳務寫入；確認顯示說明／日期／付款人／金額與不可還原警示；expense／comment 消失、cleanup job 與 receipt 保留，清理失敗仍成功 |
| SQLite 失敗、送前／提交後當機、丟回應  | 保存失敗零寫入 HTTP；重啟只查、原 UUID 重試活動及維護僅一次，C 重播不復活                                                            |
| 換帳號、撤權、429、C／D／E 競態        | A→B→A 晚到回應不清 A 紀錄，撤權隱藏；120 秒等待重啟仍是原期限，同旅行 pending 互擋／其他旅行繼續                                     |
| 成功但重讀失敗與表單操作               | 不重送帳務，只讀重試；刪後離開明細。深淺色、最大字級、鍵盤捲動／動作鍵、disabled／busy、錯誤焦點及危險確認標籤                       |

驗證：本次修正獨立複驗通過 Mobile 692 項（含新增 7 項回歸）、Mobile check、三平台匯出與 Expo 相容性；原審查兩個重現案例另重跑皆通過，暫存測試已移除。既有獨立複驗基線：Web 2,043 項、Mobile 685 項（含 Node SQLite 與工具）、E2／E3／既有寫入隔離交易 216 項通過，其中 E3 新增 17 項；完整真 HTTP、frozen install、契約同步、根 check／build、三平台匯出及 Expo 相容性通過，bundle export 不算裝置通過。E2 零冷卻限流修正見 [E2 交接](#e2-帳號入口驗收交接)。

## E4 還款驗收交接

狀態：程式、自動化與 E4 獨立審查已完成；後續第三位成員替另外兩位記錄付款時通知重複鍵已修正，補上 Web／Mobile 共用服務回歸；**E1–E4 的本機 iOS／Android 操作與故障矩陣完成，證據及限制見上方原生驗收紀錄**。沒有執行真機／閱讀器驗收，未部署或遠端 migration。原始草稿、D 佇列與 E1／E3 紀錄保留，E4 沿用同一 SQLite schema 8。

自動化用真 Node SQLite 檔案重開、畫面回呼及可丟棄 MongoDB replica set／Next.js HTTP；回呼測試不取代原生操作。手機涵蓋部分／超額／手動確認、衝突保留輸入、撤銷二次確認、丟回應／保存失敗／重啟、隔離、同旅行互擋與 120 秒期限。後端涵蓋同 UUID 僅一 payment／receipt／通知／活動、不同 UUID 同前條件只一筆、原始支出／成員／還款變更、撤權、交易回滾及撤銷後不復活。

```bash
pnpm --filter travel-budget-mobile exec vitest run src/features/settlement/paymentForm.test.ts src/features/settlement/paymentRecovery.test.ts src/features/settlement/PaymentScreen.test.ts
MONGODB_MEMBER_TEST_URI='mongodb://127.0.0.1:27017/?directConnection=true' MONGODB_MEMBER_TEST_ALLOW_WRITES=1 pnpm --filter @travel-budget/web exec vitest run src/__tests__/paymentWrite.integration.test.ts
pnpm --filter @travel-budget/web test:mobile-api
```

| 裝置驗收情境            | 操作與核對                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 建議／手動登記          | 登記已在外部完成的付款，不發起轉帳；同名／虛擬成員依 ID，部分、超額、無建議與反向實際付款均可；第三位成員替另外兩位記錄部分付款也須成功。0／負數／第三位小數／超上限／同一人拒絕，偏離建議需提示；Web 與 Mobile 結算互讀一致。 |
| 兩人／Web／D 同時變動   | 保留舊表單時新增、修改支出或還款、轉換成員身分；兩個 UUID 同舊前條件只一筆，其餘 rejected SETTLEMENT_CHANGED；輸入不丟，核對最新後明確再次確認，新 UUID 才可登記。                                                             |
| 撤銷與取消              | 確認方向／金額／備註、明示非退款；取消零 DELETE，變更原始方向或備註必須重看最新，刪 payment 後結算重算；原 create receipt 重播仍成功，但 payment 不復活、通知／活動不重複。                                                    |
| 保存、當機與丟回應      | SQLite 失敗零寫入 HTTP；落盤後送前、POST／DELETE 後結案前終止 App，重啟只查原 UUID；查不到才手動原內容重試，不能換 UUID／改內容／捨棄。以 mutationrequests `_id=actor:uuid` 核對只有一筆 receipt，create 最多一 payment。      |
| 換帳號／撤權／429／協調 | A→B→A 與不同環境只顯示／送原 scope；撤權隱藏內容且保留紀錄，resource-only 404 不撤銷旅行。429 等待 120 秒重啟 31 秒後 C／D／E3／E4 及其他旅行仍零送出，到期才恢復；同旅行 pending 互擋、沒有帳號限速時其他旅行仍可操作。       |
| 成功後讀取失敗／表單    | 保留成功，只重新整理帳務，不要求重新登記。四語、深淺色、最大字級、鍵盤捲動／完成、錯誤焦點、忙碌／停用、離開提醒及危險確認標籤；完整閱讀器及真機仍列 F。                                                                       |

E4 已使用還款建立及單筆 DELETE 的可控代理操作，不能以支出端點的丟回應取代。完整「註冊 → 建立／加入 → 新增／修正 → 還款／撤銷」本機流程與故障證據見上方原生驗收紀錄。

既有獨立複驗：Web 2,052 項、Mobile 717 項（686 Vitest＋31 工具）、隔離交易 238 項（含 E4 22 項）通過；frozen install、契約同步、根 check／build、完整真 HTTP、三平台匯出及 Expo 相容性通過。後續修正補上多收件人與有效碼保護，隔離交易 252 項通過，包含鎖死碼恢復與已知／未知 Email 一致性；核對還款／receipt／通知／動態原子提交、同 UUID 重播、結算衝突再確認及撤銷後不復活。最新修正見根 changelog；上述開發基線不算裝置通過，本次原生範圍見上方驗收紀錄。
