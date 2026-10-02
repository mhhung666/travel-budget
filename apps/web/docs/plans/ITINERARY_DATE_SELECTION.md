# 依日期新增行程日

2026-09-18 第一批已實作；整天改期、自訂月曆與批次新增仍為提案。

- 新增時選日期並顯示 Day N；14 天內提供日期快捷選項與已建立標示。
- 允許先建 Day 1、Day 3，再補 Day 2；不產生空白日，刪日不重編其他日期。
- 沒有開始日改填正整數天數；預設選最早空缺，日期上下限由伺服器驗證。
- 沿用 `dayNumber` 與旅程日期計算，不加獨立日期欄位。手動新增拒絕同日，AI 匯入仍附加到既有日。
- 換天驗證範圍與唯一性；只編輯內容不阻擋既有超界日。保持日期值語意，不任意轉換時區。

主要入口：`ItineraryDayDialog.tsx`、`itineraryDayCreation.ts`、`itineraryDayDeletion.ts`。現行操作見 [FEATURES](../FEATURES.md)。

驗證：已補日期 helper、Dialog 與 concurrency 測試；當次未實跑 replica set concurrency，也未驗真機瀏覽器／讀屏。第二批功能未排入此次交付，原方案比較查 Git。
