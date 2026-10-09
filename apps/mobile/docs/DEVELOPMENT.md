# 開發規範

## 環境與日常流程

Node.js 主版本固定於 repository 根目錄 `.node-version`，pnpm 版本由根目錄 `package.json.packageManager` 決定。從 `travel-budget` 根目錄安裝所有 workspace 的依賴，提交唯一的 `pnpm-lock.yaml`；CI 使用 `pnpm install --frozen-lockfile`。

```bash
cd /Users/mhhung/Development/travel-budget
pnpm install
pnpm dev:mobile
pnpm --filter travel-budget-mobile check
pnpm --filter travel-budget-mobile test
pnpm --filter travel-budget-mobile export:check
pnpm contracts:check
```

根目錄 `pnpm mobile:ios`、`mobile:android`、`mobile:web` 啟動各平台預覽；`pnpm dev` 或 `pnpm dev:web` 啟動 Next.js Web 與後端。這些流程需各自的終端機。

進入 `apps/mobile` 後，原有 `pnpm dev`、`ios`、`android`、`web`、`check`、`test`、`export:check` 仍可使用。App 內的 `pnpm format` 格式化程式與文件；`pnpm check` 執行 TypeScript、ESLint 與格式檢查。`export:check` 產出 App 的 `dist/`，只驗證各平台 JS／資源打包，不是 IPA／APK。

新增 Native／Expo 套件時，從 `apps/mobile` 使用 `pnpm exec expo install <package>`，再執行 `pnpm exec expo install --check`。`expo-sqlite` 的 config plugin 只設定 FTS／SQLCipher 等選填建置屬性，預設用法不必加入 `app.config.ts`；它的 Web 版需要額外的 wasm 打包設定，所以資料庫入口以 `.web.ts` 檔案在 Web 預覽中換成不引入它的版本。一般純 JS 套件從根目錄用 `pnpm --filter travel-budget-mobile add <package>`；不要為了跟網站相同而強改 React 版本。

共用契約透過 `@travel-budget/contracts` 引用，來源在 `packages/contracts/src/index.ts`。更動 schema 後從根目錄執行 `pnpm contracts:generate` 更新 `packages/contracts/openapi.json`，並以 `pnpm contracts:check` 檢查產物同步。

## 沿用現有專案的規則

遵循 repository 根目錄與 `apps/mobile/AGENTS.md` 的規則；手機保留自己的 formatter 設定，Web 專屬規則由手機平台對應實作。

| 規則                  | 手機專案做法                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 版本單一來源          | 只改 `apps/mobile/package.json.version`；Expo config 動態讀取                                               |
| commit 前評估行為變更 | 修正／小改善用 patch，向下相容功能用 minor；major 需明確要求                                                |
| 非行為變更通常不升版  | 文件、測試、格式、CI、依賴維護、保持行為的重構                                                              |
| 多個 WIP commit       | 最終交付 commit 升版一次；在 `apps/mobile` 使用 `pnpm version patch` 或 `minor` 搭配 `--no-git-tag-version` |
| 未要求 commit         | 不建立 commit，也不因編輯而升版；升版不等於可 push／tag／發布                                               |
| TypeScript strict     | 保持開啟；未知 HTTP 回應需 runtime 驗證，不能只用型別斷言                                                   |
| 格式                  | 沿用單引號、分號、兩格縮排、100 字寬、LF                                                                    |
| 四語系                | 所有使用者文字補齊 `zh`、`zh-CN`、`en`、`jp`；Native `ja` 映射 `jp`                                         |
| UI 色彩               | 使用語意 token；Native styles 不套用 Web Tailwind palette 規則                                              |
| 金額／日期            | TWD 基準、到分精度、最大餘數分配與穩定順序；date-only 不任意轉 UTC                                          |
| 公開／會員邊界        | 私人預算、收據、成員筆記不外洩；公開相片不含位置／EXIF／內部 key                                            |
| AI                    | 只產生可編輯草稿；確認後呼叫正式寫入 API                                                                    |

手機與 Web 獨立發布，分別以 `apps/mobile/package.json.version` 與 `apps/web/package.json.version` 為產品版本來源。根目錄 private package 只協調 workspace，沒有產品版本。原生 `buildNumber`／`versionCode` 是商店遞增計數，未設定前不自行發明正式值。整併決策見 [ADR](../../../docs/decisions/0001-monorepo.md)。

## 實作要求

- 路由保持薄層，畫面／hooks 依 feature 組織。路由跳轉使用 Expo Router 型別；不要複製網站 route builder。
- 後端才是授權與寫入權威，前端控制按鈕不能取代 API 檢查。
- 新功能包含 loading、empty、error、重試與鍵盤操作；尊重 SafeArea、字體縮放、深淺色與輔助閱讀。
- 文字輸入欄一律用 `TextField`：它在 Android 固定 `lineHeight`。Android 以預設字型決定欄位高度，卻用 App 語系的字型排版；中日文字型的行高較高時，React Native 會把欄位當成可自行捲動，從欄位上起手的拖曳就不再捲動頁面（英文不會出現）。原生流程 `entry-create` 以「從輸入框起手向上拖曳」的斷言守住，並在四語各跑一次。
- 現有訊息表適合骨架短字串；新增複數／插值前採用支援 ICU 的方案，不以字串拼接取代翻譯。
- `EXPO_PUBLIC_*` 會進 bundle；不放資料庫連線、JWT 簽章密鑰、AI／R2 key 或商店私鑰。環境檔與簽章檔由 gitignore 排除。
- Query cache、普通偏好設定與 log 不保存 token；log 不輸出完整個資／憑證／敏感 payload。
- API 文件把提案與已實作清楚分開。每次更動都同步現況文件與相關路線。

## 測試與 CI

目前使用 Vitest 測試 HTTP／登入生命週期，故障代理另以 Node HTTP 測試確認斷線／逾時不送出寫入、恢復後正常轉送，以及一次性「丟回應」模式（目標寫入已在後端提交、客戶端收不到回應，其他請求與之後的同一寫入不受影響），包含在 `pnpm test`。手機 CI 執行型別、lint、格式、測試、Expo 相容性與三平台 bundle 檢查，不需要後端密鑰。共用契約檢查驗證 OpenAPI 與 schema 同步。API／權限、裝置 session 與 DB transaction 測試留在 `apps/web`，不使用正式帳號或資料庫。

現有測試涵蓋 401／refresh 合併、回應內容讀取中斷線／逾時／取消、重啟恢復、憑證輪替後安全儲存失敗、重複登出及新舊登入交錯，並驗證缺少 `throwIfAborted()`／`reason` 的原生 AbortSignal。原生生命週期 adapter 與 QueryObserver 整合測試涵蓋網路事件／啟動讀取競態、前景重新讀取連線、離線查詢恢復及過期資料更新。QueryClient 整合測試驗證登出、session 撤銷及憑證儲存失敗會清除私人快取、取消尚未完成的讀取。這些測試使用模擬 HTTP／儲存介面，不取代裝置上的登入與 SecureStore 驗收。支出清單的游標查詢、帳號／環境隔離的 query key、撤權後的快取隱藏（真 QueryClient）、金額格式、四語訊息完整性與新增支出契約（金額到分、嚴格欄位、結果查詢）另有單元測試；支出與結算畫面由 Maestro `ledger` suite 驗收。新增支出另有單元測試：嚴格金額／日期輸入、草稿驗證與預覽狀態（請求亂序、改輸入即失效、重新預覽或被拒即捨棄舊結果）、待確認紀錄的 SQLite（以 Node 內建 `node:sqlite` 對同一份 SQL 執行，涵蓋環境／帳號隔離）、`requestAs` 帳號綁定與登入世代檢查、預覽被拒後的持續隱藏（真 QueryClient），以及以真 SQLite、真 session manager 與模擬後端（`src/test/expenseServer.ts`：成員資格、契約驗證、冪等 receipt、可注入遺失回應／逾時／5xx）執行的送出引擎：先存後送、儲存失敗不送、明確拒絕才清除、回應遺失後查詢找回或以同一 UUID 重試、重啟恢復、帳號切換與晚到的成功／錯誤回應（含看似確定的 400）、併發操作、本機清理失敗後不重送、409 不換 UUID。原生流程由 Maestro `entry` suite 驗收並以代理流量與資料庫核對；D1 新增真 SQLite 草稿檔案重開、舊表升級、修訂／捨棄競態、存檔與原子交接失敗、子程序直接終止恢復，以及接回 C 的同 UUID 行為測試；兩平台草稿操作仍待獨立驗收。D2 已補真 SQLite 快照重開／升級、SecureStore 憑證與身分原子保存、受限 session／A→B→A、撤權與保存競態，以及斷網草稿恢復線上授權／新成員／新預覽後單次寫入的整合測試；D3 已補均分意圖確認、多筆前景同步、SQLite 原子交接／子程序當機、持久化 Retry-After、409 與撤權／換帳號回歸，另涵蓋交接交易、C 序列等待／SQLite 讀取與狀態保存、refresh 重送前的撤權，C 手動／自動查詢與重試的 429 落盤，以及 409 後查詢拒絕／限速；另以多旅行／同旅行多筆驗證 409 無 receipt 與 C 交接受阻只暫停該旅行、等待跨重啟及 C 結案後恢復，429 暫時性冷卻仍阻擋後續；衝突紀錄從 C 手動查詢／重試、自動恢復與佇列送出取得 429 時，獨立保存限速期限，重啟過 31 秒仍不送其他旅行，120 秒到期後才恢復，涵蓋不同佇列順序、較短等待及 schema 4 升級／失敗回滾；本機身分 schema 不相容的憑證仍可線上刷新，離線不開啟本機模式；重啟測試重新建立 HTTP client，不依賴記憶體冷卻；另涵蓋 C 跨旅行恢復／查詢／重試、捨棄或移回最後一筆限速紀錄後重啟仍等待、非佇列 C 新增的共用期限、帳號／環境隔離、receipt 清理及 schema 6 遷移／交易失敗回滾；D 的離線冷啟動、佇列及實際入帳核對仍待其他人執行兩平台裝置驗收，操作表見 [D3 交接](LOCAL_ACCEPTANCE.md#d3-佇列驗收交接)；OS 背景同步另排。原生核心流程另有 Maestro 驗收，指令與涵蓋範圍見 [本機驗收流程](LOCAL_ACCEPTANCE.md)。

手機測試不可依賴正式帳號或資料庫；模擬資料需明確標示。發布前，iOS 與 Android 都要實測登入、弱網、前後景、重啟、文字縮放及權限拒絕。

## 原生建置與發布

目前沒有 EAS project、bundle ID 或簽章設定。啟動原生整合時，先選定擁有者與 iOS bundleIdentifier／Android package，安裝 `expo-dev-client`，再從 `apps/mobile` 使用 `pnpm exec expo run:ios`／`run:android` 或另行設定 EAS development build。App 內的 `pnpm ios`／`android`、根目錄的 `mobile:ios`／`mobile:android` 都只啟動預覽，不會完成原生編譯。

採 Expo CNG 管理 native 專案；`ios/`、`android/` 由設定與 config plugins 生成，除非另立決策改為維護原生工程。正式 build／submit、推播帳戶、商店與 OTA 發布是後續工作，不包含在初始化中。OTA 更新不得包含不相容的 native 變更。

官方參考：[development builds](https://docs.expo.dev/develop/development-builds/introduction/)、[本機編譯](https://docs.expo.dev/guides/local-app-development/)、[環境變數](https://docs.expo.dev/guides/environment-variables/)、[runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)。

## 第一個切片的本機驗收

優先使用 [本機驗收流程](LOCAL_ACCEPTANCE.md) 的 `test:mobile-api`／`dev:mobile-api`，自動建立隔離 MongoDB 與測試帳號。以下步驟適用於另有既定測試後端的情況。

1. 在 `apps/web` 設定獨立測試資料庫的環境，從 repository 根目錄啟動 `pnpm dev:web`。不要將正式密鑰複製到手機。session TTL migration 由後端環境負責，此次開發不自動執行遠端 migration。
2. 從根目錄執行 `cp apps/mobile/.env.example apps/mobile/.env.local`，只填後端網域（如 `http://localhost:3000`，App 自動走 `/api/v2`）：iOS 模擬器 localhost、Android 模擬器 10.0.2.2、真機為電腦 LAN IP。API 改址後重啟 Expo；release bundle 必須 HTTPS。
3. 在相容 Expo Go 或 development build 開啟 App，以測試用既有帳號登入（不是 Email）。確認旅行列表、載入更多、旅行摘要與 Web 金額一致。
4. 重開 App、切前後景、關閉／恢復網路、登出再換另一測試帳號。確認舊資料不殘留，離線恢復登入／登出不假稱成功。後端撤銷 session 或變更密碼後應回到登入頁。
5. 測試無旅行、非成員旅行、錯誤密碼、大字體、深淺色、四語與鍵盤遮擋；iOS／Android 都要操作。

本機若缺 Xcode Simulator／Android Emulator 或測試後端，應明確標示尚未完成上述裝置驗收。Web 預覽只能檢查版面與安全路由，不能取代原生 SecureStore 與實際登入流程。

## E1 開發與交接

新增可選 `EXPO_PUBLIC_WEB_ORIGIN`，在 API 與 Web host 不同時指定本環境的網站 origin，必須和後端 `APP_URL` origin 一致；沒有 path/query/憑證，不指向其他環境。變更後重啟 Metro。邀請頁使用 Expo Clipboard 與系統 Share，未設定 Universal Links／App Links。

`features/tripEntry/*.test.ts` 用真 SQLite 檔案重開驗證保存前送出禁止、凍結 UUID、丟回應、重啟只查詢、手動原內容重試、清理失敗、雙擊／同種類阻塞、帳號／環境與登入世代隔離、409／404、終局拒絕及 C／D 共用 429 原期限；另驗舊 schema 6 升級與交易回滾。Web 的 `test:mobile-api` 已涵蓋 E1 真 HTTP、隔離 replica set 與四個服務交易案例（只由此工具提供 disposable URI），核對旅行／receipt／成員／通知／動態數，以及日期、舊碼、重設、撤權／刪除與丟回應恢復。裝置清單見 [E1](LOCAL_ACCEPTANCE.md#e1-旅行入口驗收交接)，交給其他人執行。
