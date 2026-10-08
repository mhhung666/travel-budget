import {
  currencySettingsSchema,
  type TripCurrencyContext,
  type CurrencySettings,
} from '@travel-budget/contracts';
export interface CurrencyFields {
  defaultCurrency: string;
  rows: { code: string; rate: string }[];
}
export function currencyFields(context: TripCurrencyContext): CurrencyFields {
  return {
    defaultCurrency: context.settings?.default_currency ?? 'TWD',
    rows: (context.settings?.currencies ?? []).map((c) => ({
      code: c.code,
      rate: c.rate == null ? '' : String(c.rate),
    })),
  };
}
export function currencySettings(fields: CurrencyFields, supported: string[]): CurrencySettings {
  const settings = currencySettingsSchema.parse({
    default_currency: fields.defaultCurrency === 'TWD' ? null : fields.defaultCurrency,
    currencies: fields.rows.map((c) => {
      const text = c.rate.trim();
      // No parseFloat truncation, commas or accidental zero fallback; String(number) exponents round-trip.
      if (c.code !== 'TWD' && text && !/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text))
        throw new Error('INVALID_RATE');
      return { code: c.code, rate: c.code === 'TWD' || !text ? null : Number(text) };
    }),
  });
  if (
    settings.currencies.some((c) => !supported.includes(c.code)) ||
    new Set(settings.currencies.map((c) => c.code)).size !== settings.currencies.length ||
    !supported.includes(fields.defaultCurrency) ||
    (fields.defaultCurrency !== 'TWD' &&
      !settings.currencies.some((c) => c.code === fields.defaultCurrency))
  )
    throw new Error('INVALID_CURRENCY');
  return settings;
}
