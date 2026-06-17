/**
 * 幣別定義
 */
export interface Currency {
  /** 幣別代碼 (TWD, JPY, USD, EUR, HKD, THB) */
  code: string;
  /** 幣別符號 (NT$, ¥, $, €, HK$, ฿) */
  symbol: string;
  /** i18n key */
  nameKey: string;
}
