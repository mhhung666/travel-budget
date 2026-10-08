import { publicMemberClaims } from '@/lib/publicMemberClaims';
import { withPublicLedgerV2 } from '@/lib/withPublicTrip';

export const POST = withPublicLedgerV2(publicMemberClaims.convertMember);
