import {
  formatCurrency,
  formatOriginalAmount,
  formatDate,
  formatRate,
  formatInstant,
  money,
} from './format';
import { useAppLocale } from './useMessages';

export function useDisplayFormat() {
  const locale = useAppLocale();
  return {
    money: (value: number) => money(value, locale),
    currency: (value: number, code: string) => formatCurrency(value, code, locale),
    originalAmount: (value: number, code: string) => formatOriginalAmount(value, code, locale),
    date: (value: string) => formatDate(value, locale),
    rate: (value: number) => formatRate(value, locale),
    instant: (value: number) => formatInstant(value, locale),
    locale,
  };
}
