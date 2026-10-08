import { baseCurrency } from '@/api/ledger';
import {
  currencySettingsSchema,
  type TripCurrencyContext,
  type CurrencySettings,
} from '@/api/contracts';
export interface CurrencyFields {
  defaultCurrency: string;
  rows: { code: string; rate: string }[];
}
export function currencyFields(context: TripCurrencyContext): CurrencyFields {
  return {
    defaultCurrency: context.settings?.default_currency ?? baseCurrency(context),
    rows: (context.settings?.currencies ?? []).map((c) => ({
      code: c.code,
      rate: c.rate == null ? '' : String(c.rate),
    })),
  };
}
export function currencySettings(
  fields: CurrencyFields,
  supported: string[],
  base = 'TWD'
): CurrencySettings {
  const settings = currencySettingsSchema.parse({
    default_currency: fields.defaultCurrency === base ? null : fields.defaultCurrency,
    currencies: fields.rows.map((c) => {
      const text = c.rate.trim();
      // No parseFloat truncation, commas or accidental zero fallback; String(number) exponents round-trip.
      if (c.code !== base && text && !/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text))
        throw new Error('INVALID_RATE');
      return { code: c.code, rate: c.code === base || !text ? null : Number(text) };
    }),
  });
  if (
    settings.currencies.some((c) => !supported.includes(c.code)) ||
    new Set(settings.currencies.map((c) => c.code)).size !== settings.currencies.length ||
    !supported.includes(fields.defaultCurrency) ||
    (fields.defaultCurrency !== base &&
      !settings.currencies.some((c) => c.code === fields.defaultCurrency))
  )
    throw new Error('INVALID_CURRENCY');
  return settings;
}
