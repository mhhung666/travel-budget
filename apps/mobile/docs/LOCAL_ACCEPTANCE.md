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

正常結束、失敗或 Ctrl+C 都會停止自己的 Next.js 與移除容器；診斷 log 留在輸出的暫存目錄。不應把這些輸出提交到 repository。強制關機或 SIGKILL 無法觸發清理；此時只移除該次產生的 `tb-mobile-<隨機碼>` 容器，避免清除其他工作。

## 保留環境供裝置操作

```bash
pnpm --filter @travel-budget/web dev:mobile-api
```

先執行自動驗收，成功後清空測試產生的登入限制與 session，再保留資料庫與伺服器。終端顯示 API URL、一次性密碼、旅行 ID 與 fixture 日期；密碼也只寫入權限 `0600` 的暫存 `fixture.json`。每次重啟都會換 port、密碼與資料 ID，手機須更新 API 位址並重啟 Expo。

| 帳號           | 旅行與預期金額（TWD）                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| `mobile-a`     | 22 筆：共用旅行、20 筆未來旅行、1 筆封存旅行；共用旅行本人花費 50、應收 50.01、預算 1,000 |
| `mobile-b`     | 共用旅行與 B 專屬旅行；共用旅行本人花費 50.01、應付 50.01、預算 9,000                     |
| `mobile-empty` | 無旅行                                                                                    |

共用旅行只有一筆 100.01 支出、2 名成員；fixture 當日全團花費為 100.01。工具會先檢查 fixture 與本機日期一致；跨日驗收時重啟後端與 Metro，使日期一致。所有 fixture 名稱以 `TEST` 開頭；收據 key 是不可存取的測試字串。

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

| 操作                                           | 預期                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| 空欄位、錯誤密碼、正確登入 A                   | 必填／錯誤提示正確；成功後顯示 A 的旅行                   |
| 列表載入更多、下拉更新                         | 20 筆後可載入剩餘 2 筆，無重複；封存最後                  |
| 開共用旅行                                     | 日期、角色、人數、支出筆數與上表金額一致                  |
| 完全關閉 App 後重開                            | SecureStore 恢復登入並成功 refresh                        |
| 背景／前景、斷線／恢復、離線登出               | 顯示離線／重試；離線登出不假稱成功；恢復可讀資料          |
| 登出 A、登入 B、再登入 empty                   | 預算與應收／應付切換正確；不殘留 A 資料；empty 顯示空狀態 |
| 用 B 專屬旅行 ID 嘗試從 A 開啟                 | 404，不顯示私人內容                                       |
| 保留環境輸入 `revoke-a`／`expire-a` 後重新整理 | 回到登入頁，清除私人快取；重新登入可恢復                  |
| 繁中、簡中、英文、日文；深淺色                 | 翻譯、數字、對比與畫面完整                                |
| 大字體、鍵盤、螢幕閱讀器                       | 可捲動並操作登入、返回、載入更多；按鈕有標籤              |

HTTP／MongoDB 與下節的模擬器流程各自驗證不同層次；本表的原生操作結果須另行記錄。模擬器通過也不能直接標示兩平台真機驗收完成。

## 可重跑的模擬器驗收

`maestro/auth-trips.yaml` 透過原生畫面操作實際 API，涵蓋必填／錯誤密碼、A 的旅行摘要、冷啟動恢復登入、載入第二頁、非成員旅行拒絕、切換 B 的金額／預算，以及 empty 的空狀態。使用 Expo Go，不清除 App 或 Keychain／SecureStore；每次執行先正常登出，結束也正常登出。

`maestro/sessions.yaml` 涵蓋摘要顯示中撤銷 session、API 讀取後回到登入頁、切換 B 的預算，以及 session 到期後的冷啟動與重新登入。每次失效後再重啟一次，確認安全儲存的失效憑證已清除，不會反覆出現到期錯誤。這是資料庫 session 期限驗收，尚未取代 access JWT 自然到期或弱網操作。

`--suite lifecycle` 先登入 A、開啟私人預算摘要並將 App 留在背景；主機等待 35 秒超過快取新鮮期後撤銷 session，再將同一個 App 帶回前景（不重啟、不手動更新）。斷言自動回登入頁、重啟沒有殘留憑證，且切換 B 後只顯示 B 的預算。Android 透過 adb 開啟最近使用的 App，再點選置中的專案卡片；直接啟動 Expo Go 會回到另一個首頁 task。

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

`FIXTURE_PATH` 是 `dev:mobile-api` 輸出的暫存 `fixture.json`，不是帳號設定檔。工具只接受 loopback 的隔離後端資料，帳號固定為 `mobile-a`／`mobile-b`／`mobile-empty`，密碼透過環境傳入 Maestro。勿使用正式帳號；本機診斷檔可能包含 fixture 密碼與畫面，放在每次產生的私有暫存目錄，勿提交。

預設 `--suite auth-trips`；將上述指令的 `--suite sessions` 換成 `--suite lifecycle` 可驗收前後景。兩者都需要保留環境輸出的控制通道。若提示缺少控制資訊，重啟 `dev:mobile-api` 並更新 Metro API 位址。session／lifecycle 流程開始會清除此 fixture 的登入次數限制；撤銷／到期命令必須實際影響至少一個有效 session，否則測試失敗。控制請求由電腦上的驗收工具發出，不從手機呼叫。

預設驗證英文；裝置使用其他語系時，傳入 `--locale zh`／`zh-CN`／`jp`，工具不會改變裝置語系。此選項只切換斷言用的文字，不代表四語皆已驗收。深淺色與文字大小由裝置設定控制。第一次開啟 Expo Go 的系統提示請先完成，再跑流程。iOS 測試模擬器請在 Settings → General → AutoFill & Passwords 關閉 AutoFill Passwords and Passkeys，避免系統儲存密碼提示遮住測試；這不改動 App 的自動填寫能力，也不代表已驗證密碼管理器整合。重複執行若觸發 429，在隔離後端終端輸入 `reset-limits` 後再試。

最近驗收：2026-10-03，Expo Go／英文，iPhone 18 Pro（iOS 27）與 Pixel 9 模擬器（API 36）的 `lifecycle` 流程皆通過。

此自動化補上可重跑的原生核心、session 失效與前後景撤銷流程；弱網、access JWT 自然到期、螢幕閱讀器及實體裝置仍按上表驗收。它不替代 development build、簽章或商店驗收。
