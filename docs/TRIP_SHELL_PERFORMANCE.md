# Trip Shell 效能基線

> 更新日期：2026-09-05
> 範圍：`/trips/[id]/*` 共用 Shell 與旅程首頁。AI provider 品質驗收不在本輪範圍。

## M 完成時的結構差異（09-04）

| 情境 | 改善前 | 改善後 |
| --- | ---: | ---: |
| 任一旅程子頁、表單未開啟：Shell 的 React Query requests | 5（trip、expenses、itinerary、current user、members） | 1（shell DTO） |
| Shell 本身的 trip-scoped MongoDB operations | 8（4 個 action 各自做 membership + resource query） | 3（membership、projected trip、expense aggregate） |
| 旅程首頁的 trip data queries（已登入成員） | 7（trip、expenses、itinerary、members、checklists、settlement、photos） | 4～5（shell、trip、itinerary、photos，加上依旅程階段啟用的 checklist 或 settlement） |
| 非支出分頁下載完整 expense rows | 是 | 否 |
| 表單關閉時查 members／itinerary／tags | 是 | 否 |

改善後的 shell DTO 只含名稱、日期、幣別、角色、個人預算、成員數、支出筆數、今日團體支出與個人累計
分攤。新增支出開啟時，members、itinerary 及 `Expense.distinct('tags')` 平行載入；不再為標籤建議下載完整
expenses。首頁的 checklist／settlement 依旅程階段擇一啟用，不阻塞 itinerary skeleton 的 loading 判斷。

新增支出的 optimistic cache 同時更新 expense list 與 shell 的支出筆數／今日金額／個人累計；失敗會回滾，
settled 後重新驗證 shell、expenses、tags、settlement、stats 與 activity。

## Production build 證據

`pnpm build` 的 React loadable manifest 已將兩個常駐 Shell 原本靜態引用的元件登記為獨立按需 chunk：

- `BudgetDialog` 專屬 chunk：20,658 raw bytes。
- `ExpenseFormSheet` loadable file set：155,806 raw bytes（包含可與其他頁共用的 chunks，不能直接視為淨節省量）。

表單開啟時會讓動態 chunk 與 metadata queries 同時開始；metadata 尚未完成時顯示 loading 狀態。

## N 完成後的首頁資料流（09-05）

| 情境 | M 完成時 | N 完成後 |
| --- | --- | --- |
| 冷啟動首頁主要資料 requests（Trip／shell／itinerary／依階段摘要） | 3～4 | 1 個 landing bootstrap |
| 上述主要資料的 membership 查詢（成員） | 每個 action 一次 | 1 次，與 Trip projection 合併 |
| 非首頁的獨立 shell Mongo operations（成員） | 3 | 2：Trip + expense aggregate |
| 未登入首頁主要資料 | 每個資源先 action、再 public fallback | 1 個 public landing GET |

`getTripLanding` 與 `/api/public/trips/[id]/landing` 共用 `readTripLanding`，先解析及授權一份 Trip，
再平行讀取 shell aggregate、itinerary，以及 preTrip 的 checklists 或 postTrip 的 settlement。日期使用
瀏覽器傳入的本地日曆日。postTrip 結算沿用已取得的 member IDs 查 User，不重查 Trip。

公開入口只接受短分享碼；DTO 不含個人預算、封存、訂位碼或票券附件。shell／itinerary／checklists／
settlement 的獨立 action 與 public route 也共用同一套讀取及計算 service。

client 只合併同一 QueryClient、同一旅程的首次無快取載入，結果填入原有 detail／shell／itinerary 與
phase-specific query key。已有快取、離線還原及 mutation 後的 refetch 維持個別 query；不新增持久化
bootstrap 副本。冷啟動時主要內容會等該階段摘要一同返回，其實際 latency／TTI 仍需 staging 量測。

以上 request 與授權次數只計主要資料；照片、個人成就連結為後續成員限定查詢，各自保留伺服器授權。
其他分頁與關閉中的新增支出表單不下載 landing payload。登入非會員共用一次 access 判定，public mode
在 30 秒後的下一次 refetch 重新驗證；加入、成員修改、登出會立即清除判定，這不是輪詢或授權憑證。

驗收測試：`tripLandingRead.test.ts`（權限／公開資料／階段）、`tripLandingHooks.test.tsx`（實際 hooks
一次請求與非首頁隔離）、`landingBootstrap.test.ts`（並行去重、個別刷新、失敗重試與登出清除），以及
`publicFallback.test.ts`（資格變動、到期及延遲回應）。數字為 mock/結構驗證，尚非真實 Mongo profiler。

## 尚待 production-like 環境實測

本機沒有 `MONGODB_URI` 與可登入測試帳號，因此沒有捏造 payload bytes、MongoDB execution stats 或 TTI。部署
到 staging 後，以至少 1、100、1,000 筆 expenses 的三種旅程各量測五次，保存中位數：

1. Chrome DevTools 停用快取，分別直開 itinerary、settings、checklists、expenses；記錄 Fetch/XHR request 數、
   transferred/resource bytes、DOMContentLoaded 與可首次操作分頁／CTA 的時間。
2. 表單保持關閉，確認沒有 members、itinerary、expense tags 與表單 chunks；開啟後確認四者才開始且平行。
3. MongoDB profiler 或對等 tracing 記錄 query count；對 shell aggregate 跑 `explain('executionStats')`，保存
   `nReturned`、`totalDocsExamined`、`totalKeysExamined`、execution time 與使用索引。
4. 與改善前相同資料快照比較；若 aggregate 在大型旅程退化，交由 O 項評估 compound/multikey index 或預聚合。

production-like 數據補齊後，將結果附在本文件並把 [IMPROVEMENTS.md](./IMPROVEMENTS.md) 的 M 驗收尾項移除。
