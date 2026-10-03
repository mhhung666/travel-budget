/** Amounts keep the backend's cent precision: integers have no decimals, at most two digits. */
export function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // A stored code that Intl rejects must not break the screen.
    return `${value} ${currency}`;
  }
}
export const money = (value: number) => formatCurrency(value, 'TWD');

/** Calendar date of an instant in the device time zone, as date-only text. */
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Exchange rates can be tiny (JPY → TWD); avoid exponent notation. */
export function formatRate(rate: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(rate);
}
