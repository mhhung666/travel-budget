/** 支出表單支援的原幣選項（基準由旅程固定，見 lib/expenseSplit）。 */
export const CURRENCY_OPTIONS = [
  { code: 'TWD', label: 'TWD' },
  { code: 'JPY', label: 'JPY' },
  { code: 'USD', label: 'USD' },
  { code: 'EUR', label: 'EUR' },
  { code: 'HKD', label: 'HKD' },
  { code: 'THB', label: 'THB' },
] as const;
