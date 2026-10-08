import { apiResponse } from '@/lib/mobile/http';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return apiResponse(() => mobileOperation('trip.list', request));
}
export async function POST(request: Request) {
  return apiResponse(() => mobileOperation('trip.create', request));
}
