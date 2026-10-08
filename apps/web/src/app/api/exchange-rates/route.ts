import { NextResponse } from 'next/server';
import { readReferenceRates } from '@/lib/referenceRates';
import { logger } from '@/lib/logger';

/** Latest published daily reference rates, expressed as 1 foreign unit = TWD. */
export async function GET() {
  try {
    const data = await readReferenceRates();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    logger.error('Error fetching exchange rates', error);
    // Never substitute invented rates. Existing saved expenses retain their own rate.
    return NextResponse.json(
      { success: false, error: 'Failed to fetch exchange rates', rates: { TWD: 1 } },
      { status: 503 }
    );
  }
}
