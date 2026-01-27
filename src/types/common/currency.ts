/**
 * 幣別定義
 */
export interface Currency {
  /** 幣別代碼 (TWD, JPY, USD, EUR, HKD) */
  code: string;
  /** 幣別名稱 */
  name: string;
  /** 幣別符號 (NT$, ¥, $, €, HK$) */
  symbol: string;
}

/**
 * 支援的幣別清單
 */
export const CURRENCIES: Currency[] = [
  { code: 'TWD', name: '新台幣', symbol: 'NT$' },
  { code: 'JPY', name: '日圓', symbol: '¥' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'EUR', name: '歐元', symbol: '€' },
  { code: 'HKD', name: '港幣', symbol: 'HK$' },
];
