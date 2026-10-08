import {
  formatCurrency,
  formatOriginalAmount,
  formatDate,
  formatRate,
  formatInstant,
} from './format';
import { useAppLocale } from './useMessages';

export function useDisplayFormat(base = 'TWD') {
  const locale = useAppLocale();
  return {
    money: (value: number, code = base) =>
      code === 'TWD'
        ? formatCurrency(value, code, locale)
        : formatOriginalAmount(value, code, locale),
    currency: (value: number, code: string) => formatCurrency(value, code, locale),
    originalAmount: (value: number, code: string) => formatOriginalAmount(value, code, locale),
    date: (value: string) => formatDate(value, locale),
    rate: (value: number) => formatRate(value, locale),
    instant: (value: number) => formatInstant(value, locale),
    locale,
  };
}
