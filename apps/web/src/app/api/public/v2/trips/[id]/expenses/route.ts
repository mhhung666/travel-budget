import { GET as legacyGET } from '@/app/api/public/trips/[id]/expenses/route';
import { withLedgerV2 } from '@/lib/ledger';
export async function GET(...args: Parameters<typeof legacyGET>) {
  return withLedgerV2(() => legacyGET(...args));
}
