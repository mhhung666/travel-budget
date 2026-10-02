import { apiResponse } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiResponse(() => requireMobileUser(request));
}
