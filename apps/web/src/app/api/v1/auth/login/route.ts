import { apiResponse, readBody } from '@/lib/mobile/http';
import { loginInput } from '@/lib/mobile/contract';
import { loginMobile } from '@/lib/mobile/session';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return apiResponse(async () => {
    const body = await readBody(request, loginInput);
    return loginMobile(body.username, body.password);
  });
}
