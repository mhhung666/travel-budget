import { publicTripReads } from '@/lib/publicTripReads';
import { withPublicLedgerV2 } from '@/lib/withPublicTrip';

export const GET = withPublicLedgerV2(publicTripReads.settlement);
