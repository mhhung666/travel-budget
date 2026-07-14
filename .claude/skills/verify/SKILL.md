---
name: verify
description: 在本機實跑 app 驗證行為變更（local MongoDB via docker + pnpm dev + Playwright 驅動 UI）
---

# 本 repo 的實跑驗證配方

無既有 .env.local 時，從零到可驅動的 UI 約需 3 步：

## 1. 起本機 MongoDB + env

```bash
docker run -d --name verify-mongo -p 27017:27017 mongo:7
cat > .env.local << 'EOF'
JWT_SECRET=verify-local-dev-secret-key-0123456789abcdef0123456789
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/travel-budget
EOF
```

R2 不設也能跑（只有上傳功能會回錯）。**驗證完把 .env.local 與 container 清掉。**

## 2. 起 dev server

```bash
pnpm dev   # localhost:3000；首次編譯每條路由 30s+，Playwright goto 記得 timeout 放寬
```

（驗 PWA/SW 必須 `pnpm build && pnpm start`，dev 模式 SW 停用。）

## 3. Playwright 驅動（repo 內建 playwright 1.61）

在 scratchpad `npm i playwright && npx playwright install chromium` 後直接寫 .mjs 腳本。

流程 gotcha：
- 首頁 `/` 即登入/註冊（tabs 切換）；註冊欄位順序：用户名、顯示名稱、email、密碼。
  註冊成功後 redirect `/trips`，可 `ctx.storageState({ path: 'auth.json' })` 存 session 重用。
- 行動 viewport（<md）「建立新旅行」是右下 FAB：`getByLabel('建立新旅行')`（桌面版按鈕 `max-md:hidden`）。
- 建立旅程後**不會**跳轉詳情頁，停在列表；旅程 URL 用卡片上的 hash_code（如 `/trips/xgo695q7`）。
- 分頁路徑：`/trips/<id>/notes|itinerary|checklist`…
- 隨手記 composer 的 Enter＝送出；多行內容用 `fill()` 塞。
- **dev overlay 會擋點擊**（`<nextjs-portal>` intercepts pointer events，既有 TripSpaceShell
  hydration mismatch 觸發）：點擊前 `p.evaluate(() => document.querySelector('nextjs-portal')?.remove())`。
