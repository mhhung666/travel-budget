# 共用手機 API 契約

`src/index.ts` 定義 `/api/v1` 的登入輸入、refresh 輸入、使用者、session、旅行列表與成員摘要，以及支出清單／明細與結算 schema。Web 和 Mobile 使用 `@travel-budget/contracts`；這個私有 workspace 套件僅依賴 Zod，不含 React、Next.js、資料庫、平台 API 或密鑰。

`openapi.json` 是唯一 OpenAPI 產物，可透過 `@travel-budget/contracts/openapi.json` 引用。從 repository 根目錄執行：

```bash
pnpm contracts:generate
pnpm contracts:check
```

產生器直接讀取 schema；CI 的 check 比對完整輸出，阻止契約與產物漂移。Web 的 `src/lib/mobile/contract.ts` 和 Mobile 的 `src/api/contracts.ts` 保留薄 adapter，沒有重複 DTO 定義；Mobile adapter 保留憑證非空的用戶端驗證。

套件直接輸出 TypeScript source，由 Next.js `transpilePackages`、Expo Metro 和 Node.js 24 的 type stripping 各自處理。沒有額外的發版或建置流程。HTTP envelope、授權、refresh 輪替、分頁與部署順序見 [後端 API](../../apps/web/docs/MOBILE_API.md)與 [Mobile 契約](../../apps/mobile/docs/BACKEND_CONTRACT.md)。

應用各自發布，API version 不是產品 version；維持已發布 App 的契約相容性。金額、成員權限與最後寫入仍由後端既有服務負責。
