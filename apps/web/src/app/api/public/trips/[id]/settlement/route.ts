import { NextResponse } from 'next/server';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { readSettlement } from '@/lib/settlementRead';
export const GET = withPublicTrip(
  async ({ tripId }) => NextResponse.json(await readSettlement(tripId)),
  { logLabel: 'Get public settlement error' }
);
