# 本機登入與旅行驗收

此流程啟動 `apps/web` 的實際 HTTP routes 與獨立 MongoDB，提供可丟棄的測試帳號。自動檢查不依賴正式資料或遠端服務，也不取代原生 SecureStore、操作介面與真機驗收。

## 先決條件

- 根目錄完成 `pnpm install --frozen-lockfile`；Node／pnpm 版本依 repository 設定。
- Docker Desktop 已啟動。第一次執行會下載 `mongo:8.0`。
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

正常結束、失敗或 Ctrl+C 都會停止自己的 Next.js 與移除容器；診斷 log 留在輸出的暫存目錄。不應把這些輸出提交到 repository。強制關機或 SIGKILL 無法觸發清理；此時只移除該次產生的 `tb-mobile-<隨機碼>` 容器，避免清除其他工作。

## 保留環境供裝置操作

```bash
pnpm --filter @travel-budget/web dev:mobile-api
```

先執行自動驗收，成功後清空測試產生的登入限制與 session，再保留資料庫與伺服器。終端顯示 API URL、一次性密碼、旅行 ID 與 fixture 日期；密碼也只寫入權限 `0600` 的暫存 `fixture.json`。每次重啟都會換 port、密碼與資料 ID，手機須更新 API 位址並重啟 Expo。

| 帳號                               | 旅行與預期金額（TWD）                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `mobile-a`                         | 22 筆：共用旅行、20 筆未來旅行、1 筆封存旅行；共用旅行本人花費 50、應收 50.01、預算 1,000  |
| `mobile-b`                         | 共用旅行與 B 專屬旅行；共用旅行本人花費 50.01、應付 50.01、預算 9,000                      |
| `mobile-empty`                     | 無旅行                                                                                     |
| `mobile-ledger`／`mobile-ledger-b` | 支出與結算 fixture：Ledger 旅行（48 筆）、Settled ledger（已結清）、Empty ledger（無支出） |

共用旅行只有一筆 100.01 支出、2 名成員；fixture 當日全團花費為 100.01。Ledger 旅行有 4 名成員（含虛擬成員與測試用 `mobile-removed`）：總支出 5,819.9、`mobile-ledger` 應收 790.35、`mobile-ledger-b` 應收 839.5；含一筆 JPY 3,000（匯率 0.0333）= 99.9、一筆虛擬成員付款的 200 與一筆歷史資料 30，以及一筆 20.5 的已登記還款。工具會先檢查 fixture 與本機日期一致；跨日驗收時重啟後端與 Metro，使日期一致。所有 fixture 名稱以 `TEST` 開頭；收據 key 是不可存取的測試字串。

保留環境的終端接受以下命令：

- `revoke-a`：撤銷 `mobile-a` 所有手機 session；回到 App 重新整理應回登入頁。
- `expire-a`：使 `mobile-a` 所有手機 session 到期；下次 API 請求應回登入頁。
- `reset-limits`：清除此隔離資料庫的登入次數限制，方便重複操作。
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

| 操作                                           | 預期                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 空欄位、錯誤密碼、正確登入 A                   | 必填／錯誤提示正確；成功後顯示 A 的旅行                                                             |
| 列表載入更多、下拉更新                         | 20 筆後可載入剩餘 2 筆，無重複；封存最後                                                            |
| 開共用旅行                                     | 日期、角色、人數、支出筆數與上表金額一致                                                            |
| 以 `mobile-ledger` 開 Ledger 旅行的支出與結算  | 清單 20＋20＋8 筆無重複、外幣顯示原幣、明細分攤與金額一致；結算三種狀態、本人轉帳排前且標示尚未付款 |
| 完全關閉 App 後重開                            | SecureStore 恢復登入並成功 refresh                                                                  |
| 背景／前景、斷線／恢復、離線登出               | 顯示離線／重試；離線登出不假稱成功；恢復可讀資料                                                    |
| 登出 A、登入 B、再登入 empty                   | 預算與應收／應付切換正確；不殘留 A 資料；empty 顯示空狀態                                           |
| 用 B 專屬旅行 ID 嘗試從 A 開啟                 | 404，不顯示私人內容                                                                                 |
| 保留環境輸入 `revoke-a`／`expire-a` 後重新整理 | 回到登入頁，清除私人快取；重新登入可恢復                                                            |
| 繁中、簡中、英文、日文；深淺色                 | 翻譯、數字、對比與畫面完整                                                                          |
| 大字體、鍵盤、螢幕閱讀器                       | 可捲動並操作登入、返回、載入更多；按鈕有標籤                                                        |

HTTP／MongoDB 與下節的模擬器流程各自驗證不同層次；本表的原生操作結果須另行記錄。模擬器通過也不能直接標示兩平台真機驗收完成。

## 可重跑的模擬器驗收

`maestro/auth-trips.yaml` 透過原生畫面操作實際 API，涵蓋必填／錯誤密碼、A 的旅行摘要、冷啟動恢復登入、載入第二頁、非成員旅行拒絕、切換 B 的金額／預算，以及 empty 的空狀態。使用 Expo Go，不清除 App 或 Keychain／SecureStore；每次執行先正常登出，結束也正常登出。

`maestro/sessions.yaml` 涵蓋摘要顯示中撤銷 session、API 讀取後回到登入頁、切換 B 的預算，以及 session 到期後的冷啟動與重新登入。每次失效後再重啟一次，確認安全儲存的失效憑證已清除，不會反覆出現到期錯誤。此 suite 驗證資料庫 session 期限；access JWT 自然到期另由 `expiry` 驗證。

`--suite lifecycle` 先登入 A、開啟私人預算摘要並將 App 留在背景；主機等待 35 秒超過快取新鮮期後撤銷 session，再將同一個 App 帶回前景（不重啟、不手動更新）。斷言自動回登入頁、重啟沒有殘留憑證，且切換 B 後只顯示 B 的預算。Android 透過 adb 開啟最近使用的 App，再點選置中的專案卡片；直接啟動 Expo Go 會回到另一個首頁 task。

`--suite network --network-port 61110` 在執行期間建立 loopback 故障代理，轉送至 fixture 的隔離 API。驗證摘要更新超過產品的 15 秒逾時仍保留快取、恢復後可重試、連線中斷時登出失敗仍保留登入，以及冷啟動恢復失敗不顯示私人內容、連線恢復後可重試登入。這是 HTTP 連線中斷／逾時，不是飛航模式或完整弱網驗收。

執行 network 前重啟對應 Metro，將 API 改為 `http://127.0.0.1:61110/api/v1`（iOS）或 `http://10.0.2.2:61110/api/v1`（Android）；保留原來的 `--fixture` 與 Metro port。`61110` 可換成其他未占用 port，但須與 `--network-port` 相同。代理只在驗收程序執行時存在；結束或中斷會關閉，之後一般開發須把 Metro API 改回 fixture 後端位址。故障控制需獨立隨機憑證，不更改產品 API；中斷／逾時請求不會轉送或消耗後端 refresh 憑證。

`--suite appearance` 驗證大字體下的必填提示、表單捲動、登入、旅行金額、返回與登出，並將畫面留在私有驗收目錄。先記下裝置原本設定，再調整字級／深淺色；工具不會代改設定。旅行卡片可能高於螢幕，因此只要求部分可見後點擊；金額與操作按鈕仍須完整可見。

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

`--suite locales` 依序以英文、繁中、簡中、日文執行完整登入／旅行與 `ledger` 流程，透過原生 App 語系偏好設定切換，結束或中斷後還原；可用 `--locales zh,zh-CN,jp` 重跑指定語系。涵蓋錯誤密碼、金額／預算、權限錯誤、空旅行與支出／結算畫面。Android 測試鍵盤使用 Gboard，須保留 English (US)；流程會選英文輸入測試帳號，App 仍使用待驗語系。

`--suite keyboard --platform ios` 要求英文字母鍵盤的 `q` 鍵在輸入時及捲至登入按鈕後皆可見，再驗證登入、摘要與登出。執行前須啟用模擬器軟體鍵盤（DeviceHub 關閉 Simulate Hardware Keyboard），並使用英文鍵盤。

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

最近驗收：2026-10-03，Expo Go，iPhone 18 Pro（iOS 27）與 Pixel 9（API 36）模擬器：

- 兩平台四語登入／旅行皆通過，涵蓋必填、錯誤密碼、冷啟動、分頁、非成員、換帳號與空旅行。
- iOS 英文軟體鍵盤開啟時可用「下一步」切換欄位、捲動並提交，再完成摘要與登出；Android 鍵盤操作亦通過。
- 兩平台實際等待 15 分鐘 JWT 自然到期，皆驗證 401 → 單次 refresh → 新 JWT 重送成功，且冷啟動可恢復輪替後的憑證。
- `lifecycle`、`network` 皆通過；`appearance` 通過 iOS 最大輔助字級／深色，以及 Android 2 倍字級／深色、預設字級／淺色。
- 支出／結算唯讀（`ledger`）：修正撤權快取後，獨立重跑兩平台英文、預設字級／淺色的完整流程皆通過（含第二頁載入等待）。實作者先前的 iOS 四語與最大輔助字級／深色僅為部分驗證，本次未獨立重跑。

A 核心功能與 P1 修正複驗通過，可交接 B。33 個撤權回歸測試與額外 9 個 QueryClient 邊界案例皆通過：拒絕後遇逾時／斷線／5xx、下拉更新、離開再返回、取消／晚到回應、多頁刷新部分失敗都不會重新顯示私人快取；恢復權限後可正常讀取，一般網路失敗仍保留合法舊資料。裝置上的「撤銷旅行資格後再斷線」組合故障尚未執行，不以 QueryClient 測試代替裝置證據。

重跑通過 Web 1,849 個測試、Mobile 124 個測試（120 Vitest＋4 Node，含上述 33 個）、23 個 MongoDB 整合測試、隔離 HTTP、frozen install、契約、lint／格式、Mobile check、Expo 相容性與三平台匯出。一般測試有 253 個選擇性案例跳過，其中 A 的 10 個已在上述 MongoDB 驗證另行執行；其餘跳過不算通過。根 `check` 的 53 個 Web 型別錯誤與乾淨 HEAD 逐項相同；正式 `build` 仍受既有型別錯誤阻擋。

本機證據（不提交產物）：`/tmp/tb-a-reaccept-{tests,db,edge,check,build,ios,android}.log`；額外邊界案例原始碼 `/tmp/tb-a-reaccept-edge.test.ts`。兩平台截圖與流程位於系統暫存目錄的 `travel-budget-native-IGhYLg`（iOS）及 `travel-budget-native-cmMvHo`（Android），完整路徑見對應 log。

仍待驗收：四語與最大字級／深淺色的交叉組合、支出／結算畫面的 Android 四語、iOS 最大字級的結算頁與 Android 大字級／深色、裝置斷網／飛航模式、限速與封包遺失、螢幕閱讀器及實體裝置。上述結果不替代 development build、簽章或商店驗收。
