import { accountRequest } from '@/lib/mobile/account';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return accountRequest(request, 'confirm');
}
