import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/** Latest published daily reference rates, expressed as 1 foreign unit = TWD. */
export async function GET() {
  try {
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

    return NextResponse.json({ success: true, rates, dates, provider: 'Frankfurter' });
  } catch (error) {
    logger.error('Error fetching exchange rates', error);
    // Never substitute invented rates. Existing saved expenses retain their own rate.
    return NextResponse.json(
      { success: false, error: 'Failed to fetch exchange rates', rates: { TWD: 1 } },
      { status: 503 }
    );
  }
}
