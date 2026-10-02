# 行程匯出 PDF：研究與實作規劃

研究／實作日期：2026-09-18。狀態：首版已實作，已完成自動化與桌面瀏覽器驗證；iOS／Android 與 PWA 實機驗收待完成。

## 實作紀錄

開發分支：`feat/itinerary-pdf-export`。功能交付依 AGENTS.md 在提交時調升 minor 版本；應用程式版本以 `package.json` 為準。

- 行程頁「匯出 → PDF」提供已建立日期選擇、每日說明及成員選填確認碼；產生完成後顯示下載與開啟連結，保留原有 Markdown／CSV／JSON 匯出。
- 產檔前直接呼叫既有 landing 讀取入口，重新驗證權限並取得 trip／shell／itinerary，不使用 query 快取。公開讀取使用 no-store 與唯一 nonce，service worker 對此採 NetworkOnly；nonce 也避免舊 SW 回退到先前快取。這仍不是資料庫 transaction snapshot。儲存中或離線時阻止新匯出；只含已儲存資料。
- Markdown 在前景轉成純資料節點，PDF renderer 在專用 Web Worker 排版。實測發現 Markdown parser 的 browser build 依賴 DOM，因此不能直接放入 Worker。關閉／卸載終止 Worker，忽略過期讀取結果；Object URL 在選項變更及卸載回收。產檔逾時可重試。
- 使用隨站提供的靜態 `TravelCJK-Regular.ttf`（由 OFL 授權 Noto Sans CJK TC 產生），保留繁簡日文字集，約 21 MiB 原始大小；本機正式伺服器會以 gzip 傳輸。字型排除於 service worker precache，產檔時才取得。來源、授權及重製步驟見 `public/fonts/README.md`。
- WOFF 原型遇到 font engine 重複解壓 glyph table，短文件約需一分鐘；改為 TTF 後解決。粗體／斜體採底線強調，emoji／不支援字元顯示明確 Unicode 編碼。共用漢字採台灣字形，不宣稱逐語言字形切換。
- 使用 A4、可選取文字、GFM 表格逐列展開、圖片省略標記與 HTTP(S) 連結；不嵌入附件／圖片。一般日不強制換頁，超長活動可跨頁。避免將相對 lineHeight 放在 Page，否則 renderer 會在多頁動態頁尾累積錯誤；實際 PDF 解析測試會檢查每頁頁碼與文字邊界。

### 版面調整

依實際匯出回饋調整為較緊湊的文件：正文 8.5pt、活動名稱 10pt、輔助資訊 7.5pt，縮小頁首與活動間距。每日標題採淡色底及左側線，活動以左側固定時間欄、右側名稱／地點／備註排列，長備註仍可跨頁。已產生實際 PDF 檢視，並通過既有長文件的文字、頁碼與邊界回歸測試。

### 已執行驗證

以下為初版（版面緊湊化前）的效能紀錄：在本機 macOS 的正式 webpack build／Chromium 使用合成資料，每天 15 個活動。下列耗時含 Worker 啟動及本機資源載入，不能當成手機或遠端網路效能保證。

| 情境 | 產檔耗時 | PDF 大小 | 頁數 |
| --- | --- | --- | --- |
| 3 天 | 約 0.55 秒 | 31,311 bytes | 5 |
| 14 天 | 約 0.92 秒 | 74,959 bytes | 23 |
| 30 天，含超長單一備註 | 約 2.07 秒 | 146,742 bytes | 51 |

- 透過真實 browser download event 取得檔案；確認產檔期間頁面 timer 持續執行。另以 390px viewport、合成公開 API 資料完成行程頁 → PDF Dialog → 下載 → Escape 關閉，確認訪客無確認碼選項；這不是實體手機測試。
- 實際解析文字確認全部 450 個活動、長備註、繁簡日英混排與所有頁碼，檢查文字邊界並檢視跨頁圖片。
- 45 項相關測試通過。單元測試涵蓋白名單投影、確認碼權限、稀疏日期、Markdown、安全連結及生命週期；PDF.js 測試驗證實際多頁檔案的文字、頁碼與邊界。
- 原有匯出與行程首屏測試通過，正式 build 含 TypeScript 檢查通過。獨立 `tsc --noEmit` 另遇到既有 `.next/dev/types/validator.ts` 指向已不存在的 memberships 頁面；不是本次原始碼錯誤，未變更該開發快取。

重跑瀏覽器驗證：先執行 `pnpm build`，另一個終端執行 `pnpm start --port 3101`，再執行 `node scripts/verify-itinerary-pdf.mjs`。腳本以合成資料呼叫正式 Worker，下載至系統暫存目錄；可以 `PDF_TEST_ORIGIN` 指定網址。瀏覽器須先以 `pnpm exec playwright install chromium` 安裝。相關測試為 `src/__tests__/itineraryPdf*.test.ts*`。

尚待驗證：真實 iOS Safari、Android Chrome、PWA 開啟／儲存、慢速網路首次字型下載，以及中階手機的 5 秒目標。首版不承諾離線產檔或 PDF/UA 合規。

以下保留原始研究規劃；實際交付與取捨以上述紀錄為準。

## 建議結論

在行程頁既有「匯出」選單增加 PDF，產生適合下載、傳給旅伴與紙本閱讀的行程文件。首版包含旅程名稱、日期、每日說明與活動時間表，採 A4 直式、可搜尋／複製的文字，預設不含訂位確認碼、票券附件、相簿或金額。

優先以 **瀏覽器端 `@react-pdf/renderer`** 做原型，通過中日文字型、Markdown 內容與手機效能驗證後採用。理由是現有匯出已在前端取得資料，這條路不需要增加 PDF API、儲存空間或 Chromium 執行環境，且能提供真正的 PDF 下載。這是依專案結構做出的工程建議，尚非實測結果。

瀏覽器列印適合低成本的「列印／另存 PDF」需求，但操作受系統列印介面影響；不應把呼叫列印視為檔案已下載。若未來要求完整 HTML 排版保真、大量圖片或超長文件，再評估伺服器 HTML → PDF。

## 現況與接入位置

以下依目前程式碼整理，路徑皆相對專案根目錄。

| 位置 | 已有行為 | PDF 的影響 |
| --- | --- | --- |
| `src/app/(app)/trips/[id]/page.tsx` | `useItinerary` 取得行程，`useTrip` 取得旅程，呼叫 `exportItinerary` | 可提供旅程資訊、完整已儲存行程與語系給 PDF 專用流程 |
| `src/components/export/ExportMenu.tsx` | 同步 `build(format)` 後立即下載；共用於其他匯出 | 需增加行程專用非同步入口，避免其他頁面無故出現 PDF |
| `src/lib/exporters/itinerary.ts` | Markdown 含活動與確認碼；CSV 只有天數、標題、內容；JSON 輸出 DTO | PDF 應從 DTO 建立自己的內容模型，不經 CSV 或 Markdown 字串轉檔 |
| `src/lib/exporters/types.ts` | `ExportFormat` 只有 markdown/csv/json，`ExportFile.content` 是字串 | PDF 是二進位 Blob，不能直接塞入文字型別 |
| `src/lib/download.ts` | 清理檔名、建立 Blob URL、點擊下載後立即 revoke | 可抽出 Blob 下載能力，但 PDF URL 需配合下載／開啟連結生命週期清理 |
| `src/types/models/itinerary.ts` | 每日 Markdown、地點、活動時間／結束時間、地點文字、備註、確認碼、附件 | 需明確定義欄位白名單與省略規則 |
| `src/lib/itineraryRead.ts`、公開 itinerary API | 依 dayNumber 排序；公開 DTO 清除確認碼與附件 | PDF 必須沿用資料邊界，不能為匯出額外取得私有欄位 |
| `src/lib/itineraryActivities.ts` | 活動依開始時間穩定排序，無開始時間排最後 | PDF 共用 `sortActivities`，不自行改用結束時間排序 |
| `src/lib/itineraryDayTarget.ts` | 日期依開始日＋dayNumber 推算，支援不連續天數 | 保留 Day 1、Day 3，不把第二張卡片誤標為 Day 2 |
| `src/components/trips/detail/itinerary/MarkdownRenderer.tsx` | HTML 版支援 GFM 標題、清單、表格等 | React PDF 不能直接重用 DOM 元件，需 Markdown 到 PDF 的轉換層 |

目前沒有 PDF 產生套件；`html-to-image` 已存在，但不代表適合用整頁截圖做行程 PDF。Playwright 為開發依賴，也不代表部署環境已具備可執行的 Chromium。現有 UI 為繁中、簡中、英文、日文，PDF 也需涵蓋四語。

## 技術方案比較

| 方案 | 優點 | 主要代價 | 建議 |
| --- | --- | --- | --- |
| 專用 HTML 列印版＋`window.print()` | 重用 Markdown／瀏覽器字型排版，套件負擔小 | 使用者自行另存；不同瀏覽器的頁首頁尾、檔名、分頁與手機操作需驗證 | 若產品接受列印流程，是較快的替代方案 |
| 瀏覽器 `@react-pdf/renderer` | 直接產生 Blob，可自行設計文字文件、分頁、連結與頁碼 | 需自備 CJK 字型、PDF 版型和 Markdown 轉換；耗用使用者裝置資源 | 首選，先做原型 |
| jsPDF 文字繪製 | 可前端產檔、控制文字與座標 | 中文仍需字型，長文件版面與 Markdown 排版需更多自行管理 | 本案不優先 |
| DOM 截圖後放入 PDF | 外觀容易接近畫面 | 放大品質、文字搜尋、跨頁切割、長畫布記憶體皆不理想 | 不採作主要方案 |
| 伺服器 Playwright／Chromium `page.pdf()` | 使用 HTML／列印 CSS，可集中管理字型與渲染 | 多出瀏覽器部署、執行時間、併發與授權讀取成本 | 完整排版或重型文件有需求後再評估 |

列印 CSS 可用 `@media print` 與 `@page` 控制呈現；實際另存操作仍由瀏覽器處理。參考 [MDN Printing](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing)。

React PDF 官方提供瀏覽器 Blob 產生介面，並支援自動換頁、強制換頁與固定頁面元件。這些能力適合行程文件，但不代表現有 HTML 可以直接轉成 PDF。參考 [Blob 產生](https://react-pdf.org/docs/v4/advanced/on-the-fly-rendering)、[分頁控制](https://react-pdf.org/docs/v4/advanced/page-wrapping)。官方列出 React 19 相容支援，仍需在本專案 Next.js production build 驗證實際依賴組合。[相容性說明](https://react-pdf.org/docs/v4/compatibility)

jsPDF 官方說明非 ASCII 文字需要額外字型；截圖方案另受 canvas 尺寸與跨來源影像限制。參考 [jsPDF](https://github.com/parallax/jsPDF)、[html2canvas FAQ](https://github.com/niklasvh/html2canvas/blob/master/docs/faq.md)。Playwright 的 `page.pdf()` 提供列印媒體、紙張與頁首頁尾設定；部署可行性需另行驗證。[Playwright PDF API](https://playwright.dev/docs/api/class-page#page-pdf)

## 首版範圍與使用流程

1. 行程頁點「匯出 → PDF」，開啟小型設定 Dialog。
2. 預設匯出所有已建立行程日，可改選部分日期／Day N；至少選一天。未建立的日期不自動補空白頁。
3. 顯示「包含每日說明」選項，預設開啟；成員可勾選「包含訂位確認碼」，預設關閉。公開訪客沒有確認碼選項。
4. 點「產生 PDF」後凍結本次資料快照，顯示產生中並防止重複提交。不要顯示無法量測的百分比。
5. 完成後提供明確的「下載 PDF」連結；手機必要時提供「開啟 PDF」供系統儲存。讓使用者再次點擊已完成的檔案，降低非同步結束後失去手勢授權造成的問題。
6. 失敗時保留日期與選項，顯示可重試的錯誤。檔名建議為「旅程名稱-itinerary.pdf」，沿用現有檔名清理。

首版不做樣式主題、照片封面、地圖快照、票券合併、QR code、費用／分帳、每人個人化內容或 PDF 密碼。PDF 不自動附上公開分享碼或分享連結，避免產檔行為順帶散布整個旅程的存取入口。

### 輸出內容

| 欄位 | 規則 |
| --- | --- |
| 文件開頭 | 旅程名稱、已知起訖日期、匯出範圍、產生時間（含時區）；沒有日期時不虛構 |
| 每日標題 | 真正 Day N、推算日期與星期、標題、當日地點 |
| 每日說明 | 依選項輸出 Markdown 內容；預設保留 |
| 活動 | 時間、名稱、在地化類型、地點、備註；地點取 `location.name`，缺少時退回 `location_name` |
| 缺時間 | 不填假的 00:00；只有結束時間時明示「結束」，起訖皆有則顯示區間 |
| 跨日／時區 | 沿用儲存的 HH:mm，不推論航班時區、飛行時間或自行補隔日標記 |
| 確認碼 | 僅成員主動勾選後加入；這個選項只控制專用欄位，無法清除使用者自行寫在備註的敏感文字 |
| 附件 | 不嵌入票券、不輸出 R2 key 或短效 URL |
| 空白日／超界日 | 已建立但無活動仍保留標題與說明；超出旅程結束日的舊資料保留並標示，不默默刪除 |
| 頁尾 | 簡短旅程名稱與頁碼；長名稱需適度縮排或省略，正文保留完整名稱 |

### 版型與 Markdown 規則

- A4 直式、白底深色文字，建議正文 10–11pt、邊界 14–16mm；這些是原型起點，需實際閱讀驗證。
- 以單欄時間軸排列，避免窄欄表格塞入長備註。每天自然接續，不強制一天一頁。
- 每日標題與下一段內容保持一起；一般短活動盡量不拆頁。超過一頁的說明或活動必須允許換頁，不能整天套 `wrap={false}`。
- 標題、段落、粗體、斜體、清單、引用、分隔線、核取狀態與安全連結建立對應 PDF 節點；code 保留文字並換行。
- GFM 表格首版轉成逐列「欄名：值」段落，保留所有儲存格內容，避免寬表超出紙張；UI 說明匯出版面會簡化。
- Markdown 圖片首版只顯示替代文字與「圖片未收錄」標記，不抓遠端圖片；沒有替代文字仍保留標記。完整圖片排版另案處理。
- 不執行 raw HTML；未知節點保留可讀文字並記錄待處理類型，避免整段消失。連結只允許明確白名單協定，例如 HTTPS／HTTP，拒絕執行型或檔案 URL。
- 長網址、中日文無空白段落、混合字元與 emoji 都列入測試；不能為了排版而截斷正文。

## 實作設計

### 模組與共用匯出契約

建議新增下列模組（名稱為提案）：

| 模組 | 責任 |
| --- | --- |
| `src/lib/exporters/itineraryPdfModel.ts` | 純函式：白名單投影、日期、排序、範圍與選項，建立 PDF 專用資料模型 |
| `src/lib/exporters/itineraryPdfMarkdown.ts` | Markdown AST → PDF 可用內容節點；直接使用的 parser 必須列為直接依賴 |
| `src/components/export/ItineraryPdfDocument.tsx` | PDF primitives 與頁面版型，與網頁卡片分離 |
| `src/components/export/ItineraryPdfExportDialog.tsx` | 範圍、設定、產檔狀態、重試、下載與 URL 清理 |
| `src/lib/exporters/itineraryPdf.tsx` | 非同步 `buildItineraryPdf(model): Promise<Blob>`，載入字型後產檔 |
| `public/fonts/` | 經驗證的靜態字型及授權資訊，實際路徑由原型決定 |

保留目前 `ExportFormat` 和同步文字 exporter。可在 `ExportMenu` 增加可選的額外 action 插槽／描述，只有行程頁注入 PDF action。不要直接把 `'pdf'` 加進全域格式列舉卻讓費用與結算 exporter 沒有對應分支。

PDF renderer 與字型僅在點選入口後載入，不由通用 exporter barrel 靜態 re-export 導致其他頁面一起打包。新增 Blob 下載 helper，共用安全檔名邏輯；產生中的 Promise 不等於背景執行，若實測卡住 UI，需加 Web Worker 並驗證打包與字型載入。

PDF Object URL 在新檔取代、Dialog 關閉／卸載時回收；提供開啟連結時不能點擊後立即 revoke。關閉產生中 Dialog 至少要忽略過期結果並釋放後續生成資源；若採 Worker，再實作真正終止工作。

### 字型是採用前的必要驗證

網頁目前的 Inter Latin 設定不足以當作 PDF 中日文字型方案。PDF 需自備有權散布的 CJK 字型，並測試繁中、簡中、日文與同一份文件混合三者的字形；介面語系不代表內容只包含該語言。

React PDF 文件列出 TTF／WOFF 支援及可變字型限制，不能直接拿網頁用 WOFF2 或可變字型假設可用。選擇候選字型時需確認格式、字元涵蓋、regular／bold 對應、授權與下載大小；斜體若無相應字型，可採明確的版面替代，不能任其產檔失敗。[官方字型文件](https://react-pdf.org/docs/v4/fonts)

以可散布的靜態 Noto CJK 字型作候選，實際檔案與授權尚未選定。先測完整字型，必要時才做已知範圍分片；不能只內嵌固定 UI 文案字元，否則任意景點／人名仍缺字。Emoji 的渲染或文字替代也需有明確策略，不允許缺字方框悄悄通過驗收。

### 資料快照、權限與離線

- PDF 是讀取能力，不限 admin；以目前可取得的成員／公開資料為上限。公開匯出只用已過濾 DTO，不透過隱藏選項或成員快取補回確認碼。
- 產檔前等待目前頁面未完成的行程儲存；只輸出已儲存資料，不含尚未送出的表單與 AI 預覽。
- 首版建議在線上重新取得旅程與行程再產檔。任一失敗顯示重試，不把錯誤當成空陣列；開始產檔後使用不可變快照，其他人的更新不改變正在產生的文件。
- 兩個查詢不是資料庫同時點快照。對一般下載可接受這個限制；若要求旅程改期與行程嚴格一致，另增授權後的一致快照讀取入口，不能宣稱現有分開 refetch 已保證原子性。
- 角色／存取狀態不明、切換帳號或明確拒絕存取時，不使用殘留私有快取產檔；沿用既有登入及快取清理契約。
- 首版不承諾離線產檔；下載後的 PDF 可離線閱讀。之後若支援離線匯出，需確認行程、renderer chunk 與字型全數可用，且標示快取時間。
- 產生檔案留在裝置，不新增 R2 PDF 保存、資料庫模型或第三方文件轉換服務。

## 分階段交付

### 第一階段：可行性原型

使用合成資料產生實際 PDF，包含四語、繁簡日混排、長 Markdown、表格、長 URL、emoji、Day 1／3 與無日期行程。確認文字可搜尋／複製、字型不缺字、內容不遺漏，並在目前 Next.js production build 執行。

測量 3、14、30 天（每天 15 個活動，為目前新增容量限制）及長內容壓力案例。這是測試矩陣，不是新的匯出天數上限；舊資料若超過活動上限也不能截斷。記錄冷／暖啟動耗時、字型與 chunk 傳輸量、PDF 大小及主執行緒卡頓，實測 iOS Safari、Android Chrome 與桌面瀏覽器。

採用門檻：典型 14 天文件在選定的中階手機上暖啟動以 5 秒內可下載為暫定目標，介面仍可操作；任何缺字、裁切或內容漏失皆阻擋採用。5 秒是待驗證產品目標，不是既有效能保證。若失敗，先判斷 Worker、字型或分頁改善能否解決；仍不適合才改選列印版或伺服器方案，重新記錄取捨。

### 第二階段：完整首版

原型通過後完成專用模型、Markdown 轉換、Dialog、匯出選單接入、Blob 下載與四語文案。加入成員／公開差異、錯誤重試、產生中關閉與重新產檔的生命週期處理。完成回歸後才更新 `docs/FEATURES.md` 為已提供功能。

### 第三階段：依使用回饋擴充

視需求加入封面、圖片、地圖、系統分享、列印版或長文件伺服器產檔。票券附件合併牽涉不同檔案格式與私有讀取，應另案定義，不與基本行程 PDF 綁定。

## 驗收與測試

| 情境 | 預期 |
| --- | --- |
| 繁中／簡中／日文／英文、混排景點名稱 | 文字完整可選取、搜尋、複製，無缺字方框 |
| Day 1、Day 3；無開始日；跨年與閏日 | 天數不重編，日期沿用 UTC 日曆算法，無日期只顯示 Day N |
| 活動只有結束時間、同時刻、無時間、文字地點 | 顯示清楚且排序與頁面一致，地點 fallback 正確 |
| 長備註、Markdown 表格／清單／連結／圖片 | 內容依上述規則保留或明示省略，無裁切、重疊或無限分頁 |
| 公開訪客、成員預設、成員主動包含確認碼 | 各情境符合白名單，PDF 不含附件 key／簽名 URL |
| 尚未存檔、儲存中、讀取失敗、空行程 | 不混入草稿／樂觀資料；錯誤可重試；空行程有原因說明 |
| 多頁、超長單一活動、超出旅程範圍的日 | 不漏資料、不強塞一頁、不產生被裁掉的活動 |
| 手機下載、PWA、開啟 PDF | 真正可取得檔案；不以產生 Blob 當作成功下載的證據 |
| 連點、關閉、切換旅程、再產檔 | 無重複工作污染、過期結果或持續累積的 Blob URL |
| 舊 Markdown／CSV／JSON、支出與結算匯出 | 原有內容與格式保持正常 |

以純函式測試覆蓋投影、範圍、日期、排序和 Markdown 轉換；元件測試覆蓋狀態與錯誤。PDF 驗證需實際解析文字、檢查頁數並人工看跨頁樣本，不能只檢查 MIME 或檔案存在；PDF metadata 可能變動，不以整份 binary snapshot 作唯一判斷。實作時執行對應測試、型別／lint 與 production build，再做手機及鍵盤／讀屏 Dialog 操作驗收。可選取文字不等於已符合 tagged PDF 或 PDF/UA，本提案不宣稱無障礙 PDF 合規。

最初交付為研究文件；後續實作、驗證及尚待實機確認事項已記錄於文件開頭。
