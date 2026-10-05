# 本機登入與旅行驗收

此流程啟動 `apps/web` 的實際 HTTP routes 與獨立 MongoDB，提供可丟棄的測試帳號。自動檢查不依賴正式資料或遠端服務，也不取代原生 SecureStore、操作介面與真機驗收。

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
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:PORT/api/v1 \
  NODE_OPTIONS=--dns-result-order=ipv4first \
  pnpm --filter travel-budget-mobile exec expo start --ios --localhost

# Android Emulator：同時測兩平台時使用不同 Metro port
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:PORT/api/v1 \
  NODE_OPTIONS=--dns-result-order=ipv4first \
  pnpm --filter travel-budget-mobile exec expo start --android --localhost --port 8082
```

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

預設驗證英文；裝置使用其他語系時，傳入 `--locale zh`／`zh-CN`／`jp`。此選項只切換斷言文字；只有 `locales` suite 會暫時切換原生 App 語系。深淺色與文字大小由裝置設定控制。第一次開啟 Expo Go 的系統提示請先完成，再跑流程。iOS 測試模擬器請在 Settings → General → AutoFill & Passwords 關閉 AutoFill Passwords and Passkeys，避免系統儲存密碼提示遮住測試；這不改動 App 的自動填寫能力，也不代表已驗證密碼管理器整合。重複執行若觸發 429，在隔離後端終端輸入 `reset-limits` 後再試。

## D1 草稿驗收交接

程式已實作；依 2026-10-05 決定，以下裝置驗收待 D1／D2／D3 實作完成後，在 iOS／Android 各跑一次，並一併驗收 D2 離線入口、D3 佇列與 C 寫入恢復、補驗 C 暫緩的鍵盤／螢幕閱讀器項目。未執行前不計通過，也不計入既有 C 證據。使用隔離 fixture 與原有故障代理，核對畫面、本機草稿／pending 狀態、HTTP UUID，以及後端 expense／receipt 筆數。

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

現有 `entry` Maestro suite 可回歸 C；D1 續填選擇需要額外操作，不把舊 suite 直接視為 D1 證據。裝置 SQLite 失敗與精確交接當機需由驗收者在隔離 build 注入，目前未提供 App 內的故障開關。開發自動測試以同一 SQL、真 SQLite、子程序直接終止及模擬 HTTP 覆蓋這些分支。只對已落盤輸入承諾恢復；斷網冷啟動由 D2 本機入口補上，仍待裝置驗收。

## D2 離線入口驗收交接

D2 程式已實作；依既定安排，D1／D2／D3 完成後由獨立驗收者在兩平台一起驗收。以下未執行、不計通過；使用隔離帳號／fixture，核對畫面、SQLite 與 HTTP／expense／receipt 筆數。本機模式只存草稿，恢復連線本身應為零次支出寫入。

| 情境                   | 操作與預期                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 最小快照               | 線上登入並開啟旅行摘要，待成員選項載入；確認本機入口顯示旅行名稱與選項最後更新時間。SQLite 不包含帳務花費、餘額、預算、token 或分攤預覽。                                                                        |
| 飛航模式／新草稿       | 斷網，從旅行列表開啟「本機支出草稿」並選已保存選項的旅行；建立未填完的金額／日期，顯示已保存在此裝置且尚未入帳。預覽／確認不可操作，HTTP 無建立支出。                                                            |
| 強制關閉／續填         | 保存成功後強制結束 App，維持飛航模式重開；恢復登入的斷線／逾時後進入受限本機入口。可明確續填或捨棄，輸入原樣恢復；不能進入帳務頁或送出。捨棄後的新草稿使用當前快照。                                             |
| 尚無選項／舊憑證       | 只有旅行名稱或完全沒有快照的旅行提示需連線；不假稱載入成功。舊格式 refresh token 未經本版成功線上恢復，不猜帳號、不提供本機身分。                                                                                |
| 登入到期               | 離線時明確標示線上登入未驗證；恢復網路後若 session 已失效，重新登入，不能沿用本機身分提交。登入成功後原草稿仍按帳號恢復。                                                                                        |
| A→B→A／環境            | A 保存草稿與快照，線上登出登入 B；B 不見 A 旅行名稱、成員或輸入。A 再登入仍可續填；另一個 API 環境同帳號不見原環境內容。                                                                                         |
| 成員異動／重新確認     | 草稿離線期間移除分攤成員；恢復登入並前往線上新增入口，重讀選項，原選擇保留且失效項目須明確修正。新預覽與使用者確認前不寫入；完成後 C 只產生一筆 expense／receipt。線上表單已有預覽再斷網，也須重取預覽。         |
| 已知撤權／重啟         | 旅行或成員選項讀取／預覽收到 403／404 後，本機入口立即隱藏名稱、成員與草稿；拒絕標記保存後，斷網重啟仍隱藏。暫時性失敗或旅行列表重新取得名稱不能解除拒絕，只有新選項成功讀取與保存才解除。原草稿／pending 保留。 |
| 快照保存失敗           | 隔離 build 注入 SQLite 快照寫入失敗；顯示提示，線上流程不假稱快照已保存。拒絕標記寫入失敗時本次執行仍隱藏，讀列表先重試，失敗顯示讀取錯誤；只對已成功落盤的拒絕標記承諾跨重啟保護。                              |
| 舊 pending／無自動提交 | 有 C 結果不明紀錄的旅行不能另建草稿。受限本機模式不自動查詢／重送；登入恢復後可到原線上入口查詢 C，沿用原 UUID。新草稿與恢復連線均不自動提交。                                                                   |

裝置故障注入沿用 D1 的隔離 build 要求；本次開發測試與三平台匯出不代替上表。D3 佇列操作表見下一節。

## D3 佇列驗收交接

D1／D2／D3 程式已完成；依約由其他人集中執行裝置驗收，此表尚未計通過。前景佇列契約見 [後端契約](BACKEND_CONTRACT.md#d3-離線確認與分攤契約)，沿用本文件的隔離 backend／proxy／DB，核對畫面、HTTP 及 expense／receipt／副作用，不只看顯示成功。

| 情境                           | 兩平台核對                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 離線多筆／冷啟動               | 線上讀旅行後飛航，確認均分規則加入兩筆；SQLite 保留兩 UUID，重啟可看到；只存草稿不得自動加入。恢復有效登入／前景連線才序列送出，後端份額與尾差正確，每 UUID 只入帳一次。                                                                            |
| 修改／捨棄                     | queued 可捨棄或移回草稿，原輸入完整且重新確認才送；現有草稿不被覆蓋，另行明確確認替換後舊存檔不復活。prepared／sending／unconfirmed 禁止修改或捨棄。                                                                                                |
| 成員／順序變更與撤權           | 同步重讀選項後需處理，不靜默修改成員；預覽或 SQLite 交接／C 讀取、序列等待或 refresh 期間撤權及晚到舊回應不送出；恢復權限不自動重送 attention。已送出後撤權保留凍結紀錄，恢復後查原 receipt。                                                       |
| 交接當機／丟回應               | 在確認交易、prepared 交易與 POST 成功後分別強制結束；重啟前兩者不得半套交接，後者只查原 UUID；not_found 可同 payload 重試，不建立第二筆 receipt／expense 或副作用。                                                                                 |
| 中途斷線／背景                 | 在選項、預覽與 POST 各階段斷線／切背景，未開始下一步；已開始請求可結案。前景恢復後從持久化狀態繼續，不改凍結內容。                                                                                                                                  |
| 409／429                       | 409 查原 UUID，查回不同內容保留衝突提示，僅能移除提示；無 receipt 或查詢被 401／403／404／429 拒絕仍保持衝突，不自動重送或換 UUID。429 分別由 POST、C 手動查詢／重試、啟動恢復及 POST 失敗後查詢注入；依 Retry-After 暫停，重啟不能提前查詢或送出。 |
| 登入失效／refresh 失敗／換帳號 | 401／refresh 500 及輪替儲存失敗不清佇列；B 看不到、送不出 A 的紀錄，A 重新登入後依原 UUID 恢復；不同環境同樣隔離。                                                                                                                                  |
| 存檔／清理失敗                 | 確認或 prepared 落盤失敗不送 HTTP；結案清理失敗保留紀錄並查 receipt，不把已入帳支出重新輸入。四語、最大字級、深淺色與錯誤提示可操作。                                                                                                               |

## 尚未完成的驗收

已完成的登入／旅行、A／B 與 C 核心修正結果，以及本機歷史證據，合併至 [archive](archive/README.md)。以下項目仍須驗收，不能因封存已完成成果而視為通過：

- D：D1／D2／D3 實作完成後，再進行一次兩平台裝置驗收；包含上述草稿重啟、帳號隔離、存檔失敗、交接當機，以及 D2 離線入口與 D3 佇列情境，核對只入帳一次。開發測試與匯出不代替此項。
- C（2026-10-05 依使用者決定暫緩，不阻擋 D1；對外測試前補驗）：iOS 新增表單的軟體鍵盤，以及兩平台 VoiceOver／TalkBack 完整朗讀與操作。兩平台十個核心情境與四語／預設及最大字級／深淺色配置已通過；Android 的 Gboard 輸入與動作鍵亦已操作驗證。
- A：支出／結算的大字級／外觀矩陣，以及裝置上的「撤銷旅行資格後再斷線」組合故障。兩平台四語／預設字級／淺色的完整登入與唯讀流程已通過。
- 網路／後端：裝置斷網／飛航模式、限速與封包遺失、429 真實交易競爭；refresh 400／413／415 故障目前只有模擬 HTTP 證據。
- 建置／裝置：完成 development build 與 iOS／Android 實體裝置驗收。根 check／build 基線已修復並通過；Expo Go 或 bundle export 不替代原生建置與真機項目。

開發順序與交付條件見 [ROADMAP](ROADMAP.md)。本文件維護可重跑的操作與未驗項目，已完成結果只更新 archive 摘要。
