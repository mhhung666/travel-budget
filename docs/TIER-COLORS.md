# 會籍等級 tag 顏色規則（TIER-COLORS）

會籍頁（`/memberships`）各計畫收合列的等級 badge（[ProgramProgressCard](../src/components/memberships/ProgramProgressCard.tsx)）
以**該等級官方會員卡的卡面主色**做底色，讓等級一眼可辨。本檔制定取色與維護規則；
色值本體集中在 [constants/loyalty.ts](../src/constants/loyalty.ts) 的 `TIER_BADGE_COLORS`。

## 顯示規則

1. **底色＝卡面主色近似值**：人工對照各航官網會員卡視覺取色（卡面是圖片、無官方色票可查），
   一律為**近似色**，不宣稱是官方品牌色。
2. **字色一律白**（`text-white`）、邊框透明：所有卡色都夠深，白字對比在亮／暗模式皆足，
   **不做 dark mode 變體**（實色底不跟主題變）。
3. **材質級跨航空共用同色**，不逐家微調——同名材質視覺上就該一致：
   - 銀卡 `#8C8C8C`／金卡 `#8A7423`／黑鑽級（CX 鑽石、CI 晶鑽、BR 鑽石）`#2C2C2A`
4. **基礎級用該航空品牌色近似**：CX 綠卡 `#367D78`（國泰藍綠）、BR 綠卡 `#16604B`（長榮綠）、
   CI 華夏卡 `#35477D`（華航深藍）。
5. **官方未定卡面的新設等級**：沿用同系色再加深暫代（CX 鑽石行政卡 `#141414`），
   官方視覺出來後回來修。
6. **查無色值 → fallback** 預設 `Badge variant="secondary"`：新 program／新 tier
   還沒補色時 UI 不會壞，補色是後續小改不是 blocker。

## 色表

| Program | Tier key | 名稱 | 色值 | 依據 |
| --- | --- | --- | --- | --- |
| CX | `green` | 綠卡 | `#367D78` | 官網卡面（品牌藍綠） |
| CX | `silver` | 銀卡 | `#8C8C8C` | 共用銀 |
| CX | `gold` | 金卡 | `#8A7423` | 共用金 |
| CX | `diamond` | 鑽石卡 | `#2C2C2A` | 共用黑鑽 |
| CX | `diamond_plus` | 鑽石行政卡 | `#141414` | 暫定（規則 5，官方未出卡面） |
| CI | `member` | 華夏卡 | `#35477D` | 品牌深藍近似 |
| CI | `gold` | 金卡 | `#8A7423` | 共用金 |
| CI | `emerald` | 翡翠卡 | `#1E7A5A` | 卡名材質（翡翠綠） |
| CI | `paragon` | 晶鑽卡 | `#2C2C2A` | 共用黑鑽 |
| BR | `green` | 綠卡 | `#16604B` | 品牌綠近似 |
| BR | `silver` | 銀卡 | `#8C8C8C` | 共用銀 |
| BR | `gold` | 金卡 | `#8A7423` | 共用金 |
| BR | `diamond` | 鑽石卡 | `#2C2C2A` | 共用黑鑽 |

## 新增／修改流程

1. 對照官網會員卡視覺取主色（截圖取色即可；拿不準時偏深色，保白字對比）。
2. 改 `TIER_BADGE_COLORS`（constants/loyalty.ts）＋同步本檔色表。
3. 純樣式常數：**不涉及** i18n catalog、schema、migration；UI 不用改（元件是查表通用邏輯）。

> 查證紀錄：2026-07-18 對照國泰官網卡面視覺取色；CI／BR 官網卡面無公開色票，
> 依卡名材質與品牌色近似（規則 3／4）。皆為近似色，以官方視覺為準。
