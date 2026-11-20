# 核心文件

這裡維護 `apps/web` 的 Web 與後端文件。跨應用架構、workspace 指令及手機入口見 [repository 文件入口](../../../docs/README.md)。

| 文件 | 用途 |
| --- | --- |
| [變更紀錄](../../../docs/changelog.md) | 全專案的簡短變更摘要 |
| [現有功能](FEATURES.md) | 使用者能做什麼、主要操作流程與使用限制 |
| [AI 維護與測試](AI.md) | 三種 AI 功能的現況、設定、測試方式與評測入口 |
| [架構摘要](ARCHITECTURE.md) | 核心資料流、程式入口與維護原則 |
| [跨端產品設計](../../../docs/design/README.md) | Web／App 功能對照與專規，含旅行卡、建立幣別、行程版面與同日多選 |
| [手機 API](MOBILE_API.md) | 原生 `/api/v2` 的認證、資料邊界與驗證 |
| [共用 OpenAPI](../../../packages/contracts/openapi.json) | Web／手機共用的 API 契約產物 |
| [專案 README](../README.md) | 安裝、環境設定與開發指令 |

[Web archive](archive/README.md) 保存歷史設計、量測、測試與維運紀錄。現行跨端規格由上表的產品設計入口維護，尚待驗收的 Web 專項列於下方。

## 操作與已完成成果

- [相簿維運](PHOTO_AUDIT.md)：上傳部署、索引／cron、只讀盤點及 hash 回填；實作／正式清理已合併至 [封存摘要](archive/history/PHOTO_UPLOAD.md)。
- [行程日期與 PDF](archive/history/ITINERARY.md)：已交付成果、限制及 PDF 重跑方式；原 `plans/` 不再保留完成計畫。
- [跨端旅行列表](../../../docs/design/MY_TRIPS.md)：現行設計與 UX-T3 待驗；已完成 UX-T1／T2 見 [共同 archive](../../../docs/archive/README.md)。

## 待驗與未排程事項

跨端驗收依 [開發路線](../../mobile/docs/ROADMAP.md) 排序。各項結果與待驗案例見 [跨日活動 CD4](../../../docs/design/ITINERARY_PRESENTATION.md#cd4-驗收進度)、[同日多選收尾](../../../docs/design/ITINERARY_BATCH_DELETE.md#本項目收尾)、[我的旅行 UX-T3](../../../docs/design/MY_TRIPS.md#ux-t3-待驗證) 與 [跨端帳務 B4](../../mobile/docs/LOCAL_ACCEPTANCE.md#b4-固定帳務案例)。

| Web 專項           | 剩餘工作                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 相簿               | 真 PUT／CORS、iPhone／Android 大檔／慢網、公開副本及正式 cron；18 張當時近期照片未查重、二次掃除未確認。正式 storedHash 回填未執行，接入新上傳／感知比對／歷史合併／關頁續傳／bytes 百分比未排程 |
| 行程日期／PDF      | 日期 replica-set 並行、真機瀏覽器／讀屏；PDF 的 iOS Safari、Android Chrome、PWA 開啟／儲存、首次字型慢網與手機效能。整天改期、自訂月曆、批次新增未排程                                           |
| 帳號／附件外部服務 | 共用 M／G 已實作；R2、外部郵件／通知與原生操作待驗見 [Mobile 驗收](../../mobile/docs/LOCAL_ACCEPTANCE.md)。E2 匿名配額風險仍待 F2                                                                |

這是未結案範圍，不授權部署、遠端 migration、清理或自動啟動候選功能。舊 archive 候選只供追溯，不當作目前排程。

## 維護方式

- 現有功能變更時，更新 `FEATURES.md`；核心資料流改變時，更新 `ARCHITECTURE.md`。
- 每次開發更新`docs/changelog.md`；已完成計畫只保留成果、驗證與限制，不再新增逐輪歷史報告。
- 主文件只保留現況，不累積測試流水帳、階段進度或候選功能。
- `archive/` 保留既有摘要、必要維運操作與證據；詳細修改過程查 Git，不再累積流水帳。
- 程式碼與文件不一致時，以實作為準；Web 版本只讀取 `apps/web/package.json.version`，手機獨立版本。
- 本地 Web 文件中的開發與測試指令在 `apps/web` 執行；依賴安裝在 repository 根目錄進行，使用共用 lockfile。契約產生與同步檢查在根目錄執行 `pnpm contracts:generate`／`pnpm contracts:check`。
