# 測試覆蓋缺口報告

> 基準日期：2026-09-04
> 指令：`pnpm test:coverage`
> 報告產物：`coverage/index.html`、`coverage/coverage-final.json`、`coverage/coverage-summary.json`

## 結論

目前測試對純函式、AI schema／normalizer、核心支出與相片 actions 的保護良好，但對公開 API、
認證、通知／儲存整合，以及多數頁面協調 hooks 幾乎沒有直接覆蓋。下一輪應優先保護權限、資料寫入與
失敗復原，不應為提高總百分比而逐一測試薄 page component、型別檔或 UI library wrapper。

## 目前基準

2026-09-04 執行結果：101 個 test files 通過、3 個 live provider suites 依設計跳過；976 tests 通過、
3 tests 跳過。

| 範圍 | Statements / Lines | Branches | Functions | 判讀 |
| --- | ---: | ---: | ---: | --- |
| 全部 `src` | 36.88% | 80.78% | 67.91% | 被未直接 import 的 pages、components 與型別檔明顯稀釋 |
| `src/actions` | 42.79% | 71.45% | 40.35% | 核心支出、相片、好友較好；認證與次要領域落差大 |
| `src/app` | 14.94% | 61.72% | 40.79% | AI routes 已覆蓋；公開與 cron routes 幾乎空白 |
| `src/components` | 18.55% | 73.89% | 70.38% | 少數關鍵流程有互動測試，多數展示元件未直接載入 |
| `src/hooks` | 9.72% | 69.33% | 45.88% | 查詢、mutation 與頁面協調 hooks 是主要缺口 |
| `src/lib` | 84.96% | 88.66% | 83.33% | 確定性核心邏輯整體健康，外部服務 adapter 偏低 |
| `src/lib/ai` | 93.28% | 83.56% | 97.40% | AI 安全邊界與正規化已有良好保護 |

覆蓋率只表示測試執行過程是否走過程式碼，不能單獨證明斷言品質、真實瀏覽器相容性或外部服務可用性。

## 優先缺口

### P0：公開與排程 API 的授權、資料邊界

下列 routes 目前為 0%，且直接處理公開資料、邀請／成員轉換、匯率或排程工作：

- `src/app/api/public/**`
- `src/app/api/exchange-rates/route.ts`
- `src/app/api/cron/expense-digest/route.ts`

優先加入 route tests，至少涵蓋無效識別碼、找不到資源、公開分享關閉、輸入 schema、敏感欄位不外洩、
cron secret、上游逾時／失敗與固定 public error shape。成員連結與轉換 routes 另需覆蓋重送、跨旅程與
競態下不重複寫入。

### P0：認證與帳號安全

`src/actions/auth.actions.ts` statements 6.7%，`src/lib/auth.ts` 8.0%。這些路徑包含註冊、登入、
session、密碼重設等高風險能力。

優先覆蓋密碼／帳號驗證、錯誤訊息不洩漏帳號存在性、JWT/cookie 屬性、過期與重放、重設碼一次性、
資料庫失敗零部分寫入，以及邀請登入後返回流程。

### P1：金流與主要資料寫入

下列 action statements 明顯偏低：

- `payment.actions.ts`：11.8%
- `loyalty.actions.ts`：8.0%
- `collection.actions.ts`：9.3%
- `itinerary.actions.ts`：38.1%
- `checklist.actions.ts`：28.8%
- `member.actions.ts`：33.2%

優先測 mutation 而非單純讀取：成員權限、跨旅程 ID、金額／日期邊界、重複提交、級聯副作用、活動紀錄、
通知失敗不影響主交易，以及 delete/update 的不存在與競態情境。支出、結算、相片、筆記與好友 actions
已有較好的基線，可在相關行為變更時再補分支。

### P1：上傳、儲存與通知失敗復原

`storage.ts` 12.4%、`photoUpload.ts` 9.4%、`email.ts` 11.1%、`notify.ts` 17.1%、
`webpush.ts` 46.5%。這些模組依賴外部服務，單元測試應聚焦 adapter 契約與 failure mode：

- R2 key ownership、metadata 不符、presign／delete 失敗與批次部分成功。
- Email/Web Push 未設定、provider 拒絕、失效 subscription 清理與不阻塞主要寫入。
- 瀏覽器壓縮／上傳取消、離線切換與上傳成功但入庫失敗。

### P2：高頻表單與頁面協調 hooks

`src/hooks` statements 9.72%；`useExpenseForm.ts`、`useTripDetailPage.ts`、`useTripSettingsPage.ts`、
`useTripSpace.ts` 目前皆為 0%。建議用少量整合測試覆蓋可見行為：初始載入、權限差異、背景更新失敗、
optimistic update rollback、重複送出防護、離線 queued/synced/failed，以及支出表單四種分帳提交。

不要逐一 mock 每個 hook 內部實作；以使用者操作與 cache/action 邊界作斷言，降低重構時的測試噪音。

### P2：Service Worker 與路由代理

`src/sw.ts`、`src/proxy.ts` 目前為 0%。Service Worker 建議以 production build 加瀏覽器 smoke test 驗證
安裝、更新、離線 navigation、圖片 cache 與 push click；proxy 則用 route matrix 測試 locale、公開頁、
未登入 redirect 與登入後返回。這些能力不適合只靠 jsdom 單元測試。

## 不建議追逐的數字

- `src/types/**` 與 `.d.ts`：編譯期契約，使用 TypeScript 與 build 驗證。
- `src/app/**/page.tsx` 中只做組裝或資料轉交的薄頁面：由關鍵流程整合／E2E 測試保護。
- `src/components/ui/**` 的 Radix/Shadcn wrapper：只測本專案新增的行為與可及性契約。
- fixtures、barrel `index.ts`、常數資料與 Mongoose model 載入：不應用行數覆蓋率決定優先級。

## 建議落地順序

1. 公開／cron routes 與 auth 安全情境。
2. payment、member、itinerary、checklist mutations。
3. R2、通知與上傳 failure modes。
4. 支出表單和 trip page hooks 的關鍵整合流程。
5. 建立上述安全網後，再設定漸進式 changed-file 或分目錄門檻；暫不以 36.88% 全域數字阻擋 CI。

每次補測後應重跑 `pnpm test:coverage`，並以 `coverage/coverage-summary.json` 比較趨勢；HTML 報告僅供本機
檢視且已由 `.gitignore` 排除。
