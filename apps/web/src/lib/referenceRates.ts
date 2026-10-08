import { referenceRatesSchema } from '@travel-budget/contracts';
/** Existing daily provider; never substitutes missing foreign rates. */
export async function readReferenceRates() {
  const response = await fetch('https://api.frankfurter.dev/v2/rates?base=TWD', {
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Failed to fetch Frankfurter rates');
  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error('Empty Frankfurter rates');

  const rates: Record<string, number> = { TWD: 1 };
  const dates: Record<string, string> = {};
  for (const row of data) {
    if (
      !row ||
      row.base !== 'TWD' ||
      typeof row.quote !== 'string' ||
      !/^[A-Z]{3}$/.test(row.quote) ||
      typeof row.rate !== 'number' ||
      !Number.isFinite(row.rate) ||
      row.rate <= 0 ||
      !Number.isFinite(1 / row.rate) ||
      typeof row.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !Number.isFinite(Date.parse(row.date))
    ) {
      throw new Error('Invalid Frankfurter rate');
    }
    if (row.quote === 'TWD') continue;
    // Upstream returns foreign units per TWD; expenses multiply by TWD per foreign unit.
    rates[row.quote] = 1 / row.rate;
    dates[row.quote] = row.date;
  }
  if (Object.keys(dates).length === 0) throw new Error('Missing foreign rates');

  return referenceRatesSchema.parse({ rates, dates, provider: 'Frankfurter' });
}

/** Derive all quotes from one dated snapshot, retaining missing/mismatched quotes as unavailable. */
export function rebaseReferenceRates(
  snapshot: ReturnType<typeof referenceRatesSchema.parse>,
  base: string,
  supported: string[]
) {
  const rates: Record<string, number> = { [base]: 1 };
  const dates: Record<string, string> = {};
  const unavailable: string[] = [];
  for (const code of supported) {
    if (code === base) continue;
    const denominator = snapshot.rates[base];
    const numerator = snapshot.rates[code];
    const date = code === 'TWD' ? snapshot.dates[base] : snapshot.dates[code];
    const sameDate =
      base === 'TWD' || code === 'TWD' || snapshot.dates[base] === snapshot.dates[code];
    const rate = numerator / denominator;
    if (!denominator || !numerator || !date || !sameDate || !Number.isFinite(rate) || rate <= 0)
      unavailable.push(code);
    else {
      rates[code] = rate;
      dates[code] = date;
    }
  }
  return {
    ledger: { baseCurrency: base, moneyScale: 2 as const },
    rates,
    dates,
    provider: snapshot.provider,
    unavailable,
  };
}
