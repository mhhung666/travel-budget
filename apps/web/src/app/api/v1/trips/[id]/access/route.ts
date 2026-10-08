import { apiResponse } from '@/lib/mobile/http';
import { mobileOperation } from '@/lib/mobile/operations';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(() => mobileOperation('access.context', request, params));
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiResponse(() => mobileOperation('access.manage', request, params));
}
