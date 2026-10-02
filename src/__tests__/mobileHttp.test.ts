// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { apiResponse, readBody, ApiError } from '@/lib/mobile/http';
import { loginInput } from '@/lib/mobile/contract';
describe('mobile HTTP envelope', () => {
  it('marks private success and errors no-store', async () => {
    const success = await apiResponse(async () => ({ value: 1 }));
    expect(await success.json()).toEqual({ data: { value: 1 } });
    expect(success.headers.get('Cache-Control')).toBe('no-store');
    const failure = await apiResponse(async () => {
      throw new ApiError(429, 'RATE_LIMITED', 60);
    });
    expect(failure.headers.get('Retry-After')).toBe('60');
    expect(failure.headers.get('Cache-Control')).toBe('no-store');
    expect(await failure.json()).toMatchObject({
      error: { code: 'RATE_LIMITED' },
      requestId: expect.any(String),
    });
  });
  it('rejects malformed or oversized bodies and extra credential fields', async () => {
    const req = (body: string) =>
      new Request('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    await expect(readBody(req('{'), loginInput)).rejects.toMatchObject({ status: 400 });
    await expect(readBody(req(' '.repeat(9000)), loginInput)).rejects.toMatchObject({
      status: 413,
    });
    await expect(
      readBody(req(JSON.stringify({ username: 'a', password: 'b', admin: true })), loginInput)
    ).rejects.toMatchObject({ status: 400 });
  });
});
