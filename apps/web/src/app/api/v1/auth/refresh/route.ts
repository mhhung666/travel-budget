import { apiResponse, readBody } from '@/lib/mobile/http';
import { refreshInput } from '@/lib/mobile/contract';
import { refreshMobile } from '@/lib/mobile/session';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readBody(request, refreshInput);
    return refreshMobile(body.refreshToken);
  });
}
