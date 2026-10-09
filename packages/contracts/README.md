# 共用手機 API 契約

`src/index.ts` 定義原生 API 的登入輸入、refresh 輸入、使用者、session、旅行列表與成員摘要，支出清單／明細與結算 schema，以及線上新增支出的成員資料、均分預覽、新增輸入與結果查詢 schema（輸入為 `.strict()`，並匯出金額到分的判斷函式供用戶端提交前驗證）。Web 和 Mobile 使用 `@travel-budget/contracts`；這個私有 workspace 套件僅依賴 Zod，不含 React、Next.js、資料庫、平台 API 或密鑰。

`openapi.json` 是唯一 OpenAPI 產物，可透過 `@travel-budget/contracts/openapi.json` 引用。從 repository 根目錄執行：

```bash
pnpm contracts:generate
pnpm contracts:check
```

產生器直接讀取 schema；CI 的 check 比對完整輸出，阻止契約與產物漂移。Web 的 `src/lib/mobile/contract.ts` 和 Mobile 的 `src/api/contracts.ts` 保留薄 adapter，沒有重複 DTO 定義；Mobile adapter 保留憑證非空的用戶端驗證。

套件直接輸出 TypeScript source，由 Next.js `transpilePackages`、Expo Metro 和 Node.js 24 的 type stripping 各自處理。沒有額外的發版或建置流程。HTTP envelope、授權、refresh 輪替、分頁與部署順序見 [後端 API](../../apps/web/docs/MOBILE_API.md)與 [Mobile 契約](../../apps/mobile/docs/BACKEND_CONTRACT.md)。

應用各自發布，API version 不是產品 version；維持已發布 App 的契約相容性。金額、成員權限與最後寫入仍由後端既有服務負責。

E1 增加旅行建立／加入嚴格輸入、專用 invitation DTO 與 account-scoped mutation receipt。E1 UUID／邀請碼正規化小寫；日期與名稱／說明上限供 Web／Mobile 共用。原 C／D 支出契約與 receipt 形狀保留。

B1 增加獨立 v2 schemas 與 OpenAPI routes（`v2Schemas` registry），舊 v1 schema 不改。v2 的 ledger／明確原幣與基準輸入、終局 receipt 及支援能力詳見 [B1 API](../../apps/web/docs/MOBILE_API.md#b1-基準幣別契約)；這是後端交付，Mobile transport／持久化留 B3，非 TWD 建立預設關閉。

G3a-1 擴充 v2 preview 的可選 `split`、逐人 JSON number／null 輸入與原幣份額，`expense-options.splitPreviewModes` 僅代表預覽能力；省略 split 的舊均分回應不變。精度／容差、歷史模式與後續寫入界線見 [G3 契約](../../apps/mobile/docs/BACKEND_CONTRACT.md#g3a-1-進階分攤預覽)。

G3a-2 為 v2 create 增加可選 `split`，update 增加明確 `mode: "split"`；values 對齊確認 splits，舊請求不新增預設欄位。建立與編輯能力各自宣告於 options／edit-context，詳見 [確認寫入契約](../../apps/mobile/docs/BACKEND_CONTRACT.md#g3a-2-進階分攤新增與編輯)。
