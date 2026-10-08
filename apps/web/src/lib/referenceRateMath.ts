import { referenceRatesSchema } from '@travel-budget/contracts';
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
