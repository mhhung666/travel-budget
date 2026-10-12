# 共用手機 API 契約

`src/index.ts` 是 Web／Mobile 共用的純 TypeScript／Zod schema，透過 `@travel-budget/contracts` 引用；涵蓋認證／本人資料、旅行與成員、v2 帳本／四模式分攤／receipt、預算／搜尋、收據／頭像及通知偏好／好友。輸入採嚴格驗證；授權、最終金額與寫入由後端負責。本套件不含 React、Next.js、資料庫、平台 API 或密鑰。

`openapi.json` 是唯一 OpenAPI 產物，現行只發布 v2；歷史 schema／decoder 用於相容與拒絕退役意圖，不代表 v1 route 仍存在。兩端獨立發布，新增欄位與能力保持相容，不能改舊 frozen body／UUID／receipt 指紋。現行精確契約見 [Web API](../../apps/web/docs/MOBILE_API.md) 與 [Mobile 契約](../../apps/mobile/docs/BACKEND_CONTRACT.md)。

從 repository 根目錄更新／驗證產物：

```bash
pnpm contracts:generate
pnpm contracts:check
```

CI 比對完整輸出，阻止 schema／產物漂移；不要在 App 再維護一份 DTO 或 OpenAPI。Web `src/lib/mobile/contract.ts`、Mobile `src/api/contracts.ts` 只保留薄 adapter，Mobile 額外驗證憑證非空。

套件直接輸出 TypeScript source，由 Next.js transpilePackages、Expo Metro 與 Node.js type stripping 處理，不另發產品版本。部署相容後端先於新 App；非 TWD 建立開關與待驗條件仍見 B4，契約存在不代表已部署。
