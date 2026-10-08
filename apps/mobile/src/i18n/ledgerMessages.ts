import { messages, type AppLocale, type Messages } from './messages';

const ledgerCopy = new Map<string, Messages>();
export function ledgerMessages(locale: AppLocale, base = 'TWD') {
  const t = messages[locale];
  const key = `${locale}:${base}`;
  const cached = ledgerCopy.get(key);
  if (cached) return cached;
  const keys = [
    'amountTwd',
    'baseCurrency',
    'expensesHint',
    'amountsInTwd',
    'newExpenseHint',
    'equalExpenseHint',
    'expenseRateHint',
    'invalidExpenseRate',
    'foreignAmountTooLarge',
    'amountTooLarge',
    'currencyEmpty',
    'currencyBaseHint',
    'customRateHint',
    'invalidPayment',
  ] as const;
  const result = Object.assign(
    {},
    t,
    Object.fromEntries(
      keys
        .filter((key) => key in t)
        .map((key) => [key, String(t[key as keyof typeof t]).replaceAll('TWD', base)])
    )
  );
  ledgerCopy.set(key, result);
  return result;
}
