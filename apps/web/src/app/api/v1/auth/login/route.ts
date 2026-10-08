import { apiResponse } from '@/lib/mobile/http';
import { mobileAuth } from '@/lib/mobile/auth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiResponse(() => mobileAuth(request, 'login'));
}
