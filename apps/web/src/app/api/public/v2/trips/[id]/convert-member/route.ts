import { POST as legacyPOST } from '@/app/api/public/trips/[id]/convert-member/route';
import { withLedgerV2 } from '@/lib/ledger';
export async function POST(...args: Parameters<typeof legacyPOST>) {
  return withLedgerV2(() => legacyPOST(...args));
}
