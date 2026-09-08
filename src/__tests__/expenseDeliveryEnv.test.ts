// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:1/env-test');
  vi.stubEnv('JWT_SECRET', 'expense-delivery-env-test-secret-32-characters');
  vi.stubEnv('EXPENSE_BACKGROUND_DELIVERY', undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('expense background environment default', () => {
  it('enables background delivery when the parameter is omitted', async () => {
    const { getEnv } = await import('@/lib/env');
    expect(getEnv().EXPENSE_BACKGROUND_DELIVERY).toBe('on');
  });

  it.each(['on', 'off'] as const)('preserves explicit %s', async (value) => {
    vi.stubEnv('EXPENSE_BACKGROUND_DELIVERY', value);
    const { getEnv } = await import('@/lib/env');
    expect(getEnv().EXPENSE_BACKGROUND_DELIVERY).toBe(value);
  });

  it.each(['', 'true', 'auto'])('rejects invalid value %j', async (value) => {
    vi.stubEnv('EXPENSE_BACKGROUND_DELIVERY', value);
    const { getEnv } = await import('@/lib/env');
    expect(() => getEnv()).toThrow('EXPENSE_BACKGROUND_DELIVERY');
  });
});
