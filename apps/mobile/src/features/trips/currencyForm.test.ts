import { expect, it } from 'vitest';
import { currencyFields, currencySettings } from './currencyForm';
import { responseSchema } from '@/api/contracts';
import {
  tripCurrencyInput,
  mutationRequestSchema,
  referenceRatesSchema,
  expenseCreateInput,
} from '@travel-budget/contracts';
const fields = { defaultCurrency: 'JPY', rows: [{ code: 'JPY', rate: '0.2156789012345' }] };
it('keeps exact numeric precision, blanks and TWD base normalization', () => {
  expect(currencySettings(fields, ['TWD', 'JPY']).currencies[0].rate).toBe(0.2156789012345);
  expect(
    currencySettings(
      {
        defaultCurrency: 'TWD',
        rows: [
          { code: 'TWD', rate: '99' },
          { code: 'JPY', rate: '' },
        ],
      },
      ['TWD', 'JPY']
    )
  ).toEqual({
    default_currency: null,
    currencies: [
      { code: 'TWD', rate: null },
      { code: 'JPY', rate: null },
    ],
  });
  expect(
    currencyFields({
      tripId: 'a'.repeat(24),
      revision: 'b'.repeat(64),
      role: 'admin',
      supportedCurrencies: ['TWD'],
      settings: null,
    })
  ).toEqual({ defaultCurrency: 'TWD', rows: [] });
});
it.each(['0', '-1', 'Infinity', 'NaN', '1oops', '1,234', '.'])(
  'rejects invalid rate without silently reverting: %s',
  (rate) => {
    expect(() =>
      currencySettings({ ...fields, rows: [{ code: 'JPY', rate }] }, ['TWD', 'JPY'])
    ).toThrow();
  }
);
it('rejects unsupported/duplicate/default absent currencies', () => {
  expect(() => currencySettings(fields, ['TWD'])).toThrow();
  expect(() =>
    currencySettings({ ...fields, rows: [...fields.rows, ...fields.rows] }, ['TWD', 'JPY'])
  ).toThrow();
  expect(() => currencySettings({ ...fields, rows: [] }, ['TWD', 'JPY'])).toThrow();
});
it('strict mutation identity and receipt outcome, with unchanged old TWD input', () => {
  const body = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expected_revision: 'a'.repeat(64),
    settings: { default_currency: null, currencies: [] },
  };
  expect(tripCurrencyInput.safeParse(body).success).toBe(true);
  expect(tripCurrencyInput.safeParse({ ...body, privateBudget: 9 }).success).toBe(false);
  expect(
    mutationRequestSchema.safeParse({
      status: 'committed',
      operation: 'trip.currency',
      resourceId: 'a'.repeat(24),
      result: { tripId: 'a'.repeat(24), archived: true },
    }).success
  ).toBe(false);
  expect(expenseCreateInput.shape.currency.safeParse('TWD').success).toBe(true);
  expect(expenseCreateInput.shape.currency.safeParse('JPY').success).toBe(true);
});
it('reference dates and base rate are required; unknown foreign rates are never guessed', () => {
  expect(
    referenceRatesSchema.safeParse({
      provider: 'Frankfurter',
      rates: { TWD: 1, JPY: 0.2 },
      dates: { JPY: '2026-10-07' },
    }).success
  ).toBe(true);
  expect(
    referenceRatesSchema.safeParse({
      provider: 'Frankfurter',
      rates: { TWD: 1, JPY: 0.2 },
      dates: {},
    }).success
  ).toBe(false);
  expect(
    referenceRatesSchema.safeParse({ provider: 'Frankfurter', rates: { TWD: 2 }, dates: {} })
      .success
  ).toBe(false);
});

it('a v2 response for a non-TWD trip is quoted in its own base, not in TWD', () => {
  const usd = {
    ledger: { baseCurrency: 'USD', moneyScale: 2 },
    provider: 'Frankfurter',
    rates: { USD: 1, TWD: 1 / 30, JPY: 0.007 },
    dates: { TWD: '2026-10-07', JPY: '2026-10-07' },
    unavailable: ['EUR'],
  };
  const v2 = responseSchema(referenceRatesSchema);
  expect(v2.safeParse(usd).success).toBe(true);
  expect(v2.safeParse({ ...usd, rates: { ...usd.rates, USD: 2 } }).success).toBe(false);
  expect(v2.safeParse({ ...usd, dates: { TWD: '2026-10-07' } }).success).toBe(false);
});

it.each([1e-12, 1e20])('stored tiny/large rate %s round-trips without display rounding', (rate) => {
  const next = currencyFields({
    tripId: 'a'.repeat(24),
    role: 'admin',
    revision: 'b'.repeat(64),
    supportedCurrencies: ['TWD', 'JPY'],
    settings: { default_currency: 'JPY', currencies: [{ code: 'JPY', rate }] },
  });
  expect(currencySettings(next, ['TWD', 'JPY']).currencies[0].rate).toBe(rate);
});
