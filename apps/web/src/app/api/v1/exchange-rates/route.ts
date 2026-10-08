import { apiResponse, ApiError } from '@/lib/mobile/http';
import { requireMobileUser } from '@/lib/mobile/session';
import { readReferenceRates } from '@/lib/referenceRates';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiResponse(async () => {
    await requireMobileUser(request);
    try {
      return await readReferenceRates();
    } catch {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE');
    }
  });
}
