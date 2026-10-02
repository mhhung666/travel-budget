import { apiResponse, readBody } from '@/lib/mobile/http';
import { refreshInput } from '@/lib/mobile/contract';
import { logoutMobile } from '@/lib/mobile/session';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readBody(request, refreshInput);
    return logoutMobile(body.refreshToken);
  });
}
