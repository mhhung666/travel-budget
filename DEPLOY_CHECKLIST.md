# 部署檢查清單 ✅

在部署之前,請確認以下所有項目都已完成:

## 📋 Supabase 設定

- [ ] 已在 [supabase.com](https://supabase.com) 建立專案
- [ ] 已在 SQL Editor 執行建表 SQL (QUICKSTART.md 中的 SQL)
- [ ] 已關閉所有表的 Row Level Security
- [ ] 已複製 Project URL 和 anon public key

## 🔧 本地測試

- [ ] 已建立 `.env.local` 檔案並填入 Supabase 金鑰
- [ ] 已執行 `npm install`
- [ ] 已執行 `npm run dev` 並成功啟動
- [ ] 測試功能:
  - [ ] 註冊新用戶
  - [ ] 登入
  - [ ] 建立旅行
  - [ ] 新增支出
  - [ ] 查看結算
  - [ ] 登出

## 🚀 準備部署

- [ ] 已將所有更改提交到 Git
  ```bash
  git add .
  git commit -m "feat: migrate to Supabase for production deployment"
  git push origin master
  ```

- [ ] 確認 `.gitignore` 包含:
  - [ ] `.env.local`
  - [ ] `.env`
  - [ ] `node_modules`
  - [ ] `.next`
  - [ ] `database.db*`

## 🌐 Vercel 部署

- [ ] 已註冊 [vercel.com](https://vercel.com) 帳號
- [ ] 已連接 Git Repository
- [ ] 已設定環境變數:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `JWT_SECRET` (隨機字串,例如: `openssl rand -base64 32`)
- [ ] 已點擊 Deploy

## ✅ 部署後驗證

- [ ] Vercel 部署成功(沒有錯誤)
- [ ] 可以訪問 Vercel 提供的 URL
- [ ] 測試功能:
  - [ ] 可以註冊新用戶
  - [ ] 可以登入
  - [ ] 可以建立旅行
  - [ ] 可以新增支出
  - [ ] 可以查看結算
  - [ ] 資料正確儲存在 Supabase

## 📱 手機測試

- [ ] 在手機瀏覽器打開 Vercel URL
- [ ] 頁面正常顯示
- [ ] 所有功能正常運作
- [ ] UI 在手機上顯示正常

## 🔍 錯誤排查

如果遇到問題:

1. **500 錯誤**:
   - 檢查 Vercel Dashboard → Functions → Logs
   - 檢查 Supabase Dashboard → Logs

2. **環境變數錯誤**:
   - 確認 Vercel 的環境變數已正確設定
   - 在 Vercel 重新部署: `vercel --prod`

3. **資料庫錯誤**:
   - 確認所有表都已建立
   - 確認 RLS 已關閉
   - 在 Supabase SQL Editor 手動測試查詢

4. **認證錯誤**:
   - 確認 JWT_SECRET 已設定
   - 檢查瀏覽器 Console 的錯誤訊息

## 📊 監控

部署後持續監控:

- [ ] Vercel Analytics (免費)
- [ ] Supabase Dashboard → Database → Usage
- [ ] 定期檢查錯誤日誌

## 🎉 完成!

所有項目都打勾了嗎?恭喜!你的旅行分帳 App 已成功部署!

分享給朋友吧:
```
https://travel-budget-xxxx.vercel.app
```

---

## 下一步優化建議

- [ ] 添加 PWA 支持(可離線使用)
- [ ] 添加圖片上傳功能(收據拍照)
- [ ] 支援多幣別
- [ ] 匯出報表功能(PDF/Excel)
- [ ] Email 通知功能
- [ ] 自定義域名
