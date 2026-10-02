// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/exchange-rates/route';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

function upstream(data: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('Frankfurter exchange rates', () => {
  it('converts the direction once and preserves each currency publication date', async () => {
    const fetcher = upstream([
      { base: 'TWD', quote: 'JPY', rate: 5, date: '2026-09-17' },
      { base: 'TWD', quote: 'USD', rate: 0.03125, date: '2026-09-16' },
    ]);
    const response = await GET();
    const data = await response.json();
    expect(fetcher.mock.calls[0][0]).toBe('https://api.frankfurter.dev/v2/rates?base=TWD');
    expect(data.rates).toEqual({ TWD: 1, JPY: 0.2, USD: 32 });
    expect(10000 * data.rates.JPY).toBe(2000);
    expect(data.dates).toEqual({ JPY: '2026-09-17', USD: '2026-09-16' });
    expect(data.provider).toBe('Frankfurter');
  });

  it.each([
    [],
    {},
    [{ base: 'USD', quote: 'JPY', rate: 5, date: '2026-09-17' }],
    [{ base: 'TWD', quote: 'JPY', rate: 0, date: '2026-09-17' }],
    [{ base: 'TWD', quote: 'JPY', rate: 5, date: 'invalid' }],
  ])('rejects invalid upstream data without inventing foreign rates: %j', async (data) => {
    upstream(data);
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).rates).toEqual({ TWD: 1 });
  });

  it('fails safely on upstream errors', async () => {
    upstream({}, 503);
    expect((await GET()).status).toBe(503);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect((await GET()).status).toBe(503);
  });
});
