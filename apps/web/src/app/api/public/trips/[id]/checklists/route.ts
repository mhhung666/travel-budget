import { NextResponse } from 'next/server';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { readChecklists } from '@/lib/checklistRead';
export const GET = withPublicTrip(
  async ({ tripId }) => NextResponse.json({ checklists: await readChecklists(tripId) }),
  { logLabel: 'Get public checklists error' }
);
