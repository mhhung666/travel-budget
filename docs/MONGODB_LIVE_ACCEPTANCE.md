# O 線上唯讀與登入驗收

日期：2026-09-08。目標：https://budget.mhhung.com 。使用使用者指定帳號；不記錄帳密、
cookie、旅程識別碼、帳號資料或交易內容。此階段是低頻瀏覽器 smoke test，非壓測。

## 驗證結果

使用獨立 headless Chrome／暫時瀏覽器 context，未使用個人 Chrome profile。
初次刻意封鎖 Service Worker 時出現 `Cannot read properties of undefined (reading 'waiting')`；
改用正常允許 Service Worker 的新 context 後重測，沒有再出現 pageerror。
該初次結果不算正常環境缺陷，亦未針對這個測試條件修改應用程式。

- 正常帳號登入成功，真正經過 production Server Action、密碼驗證與 session cookie。
- 將 username 改為大寫後再次登入成功，驗證 HTTP 層大小寫不敏感查詢。
- session cookie 為 HttpOnly、Secure、SameSite=Lax；沒有輸出 cookie 值。
- 登出後 session cookie 移除，再進 `/trips` 會導回登入首頁。
- 旅程清單、旅程首頁、支出、結算、清單頁正常讀取；另開啟有既有支出的封存旅程。
- 正常 context 觀察期間沒有同源 HTTP 4xx/5xx 或瀏覽器 pageerror；已監看的 POST 回應
  沒有發現 `success:false`。這是回應抽查，不代表所有業務分支均已驗收。
- 設定頁顯示版本與當時本機 `package.json.version` 一致；未取得 Vercel deployment commit，
  不以版本相同宣稱部署 SHA 已核對。

## 延遲觀察與界線

下表為導覽開始至 Playwright `networkidle` 且 skeleton 隱藏的觀察時間，包含網路安靜等待，
**不是 TTI、LCP、純 MongoDB 查詢時間或正式 SLO**。保留正常 SW／React Query cache 行為，
重載可能使用持久化資料；不得把每次重載當成相同數量的後端查詢。

| 動作 | 觀察值 |
| --- | --- |
| 正常設定下大寫 username 登入到旅程清單 | 3.37 秒 |
| 進行中旅程支出頁，單次直接導覽 | 5.58 秒 |
| 進行中旅程結算頁，單次直接導覽 | 8.07 秒 |
| 進行中旅程清單頁，單次直接導覽 | 4.06 秒 |
| 有資料的封存旅程支出頁，三次順序重載 | 7.55／2.56／2.76 秒 |

部分讀取 POST 的 responseStart 約 4.80／5.55 秒，多數其他已觀察請求約 0.5–1.3 秒。
後續封存旅程重載監看到的四個 POST 約 0.50–0.70 秒；其 action ID 無法以本機 build
manifest 對應，所以不猜是哪個 action。沒有取得 server trace／DB profiler，
不能判定長尾來自 cold start、外部服務、串行讀取或 MongoDB，也不宣稱索引造成加速或退化。
三次頁面樣本不足以計算有意義的 p95，且缺少同環境 before，不報改善百分比。

## 範圍與下一步

沒有註冊新帳號、修改密碼／信箱、建立／編輯／刪除業務資料、寄送驗證信或觸發背景工作。
瀏覽器可能按既有應用行為送出分析事件；此處「唯讀」指未主動執行業務資料 mutation。
測試未保存 HAR、截圖、trace 或 storageState 檔案。結束時登出並關閉所有測試 context。
登出驗證成功後，關閉瀏覽器時測試工具尚未完成的 response listener 拋出 target closed，
使工具以非零退出；這不是網站 pageerror 或成功的整套自動化測試退出碼。
隨後查核瀏覽器與 runner 均無殘留程序。上述功能結果以各步驟回傳的觀察為準。

O 的 migration、索引採用與隔離併發測試已完成；本輪補上真實登入／session 與頁面讀取驗證。
**尚未完成**的是代表性 Atlas 負載下的寫入成本與可接受延遲判定，以及註冊／改信箱的完整
HTTP＋郵件 E2E；既有帳號的正常登入權限不當作任意修改帳號或正式站壓測授權。
這些驗收需要可丟棄的帳號／信箱、隔離目標與明確的負載／延遲標準。

下一個程式改善可依 Q 逐頁檢查資料查詢串行等待、快取更新和錯誤 UI；本次長尾只是排查線索，
不得當成已診斷的根因。總報告見 [MongoDB 索引結果](./MONGODB_INDEX_RESULTS.md)。
