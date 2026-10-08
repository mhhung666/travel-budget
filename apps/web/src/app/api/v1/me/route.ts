import { apiResponse } from '@/lib/mobile/http';
import { mobileAuth } from '@/lib/mobile/auth';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiResponse(() => mobileAuth(request, 'me'));
}
