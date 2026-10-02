/* eslint-disable no-console -- this test intentionally spies on every console method */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// vitest sets NODE_ENV='test', so the module loads in its dev (non-prod) branch:
// human-readable output and debug enabled.
import { logger } from '@/lib/logger';

describe('logger (dev/test mode)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes each level to the matching console method with a [level] prefix', () => {
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(console.debug).toHaveBeenCalledWith('[debug] d');
    expect(console.info).toHaveBeenCalledWith('[info] i');
    expect(console.warn).toHaveBeenCalledWith('[warn] w');
    expect(console.error).toHaveBeenCalledWith('[error] e');
  });

  it('passes meta through as a second argument', () => {
    logger.info('with meta', { tripId: '123' });
    expect(console.info).toHaveBeenCalledWith('[info] with meta', { tripId: '123' });
  });

  it('flattens an Error into a serializable object', () => {
    const err = new Error('boom');
    logger.error('failed', err);

    expect(console.error).toHaveBeenCalledWith('[error] failed', {
      name: 'Error',
      message: 'boom',
      stack: err.stack,
    });
  });

  it('omits the meta argument when none is given', () => {
    logger.warn('no meta');
    expect(console.warn).toHaveBeenCalledWith('[warn] no meta');
    expect((console.warn as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(1);
  });
});

describe('logger (production mode)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('emits one JSON line per log with level, time and message', async () => {
    const { logger: prodLogger } = await import('@/lib/logger');
    prodLogger.error('failed', new Error('boom'));

    expect(console.error).toHaveBeenCalledTimes(1);
    const payload = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = JSON.parse(payload);

    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('failed');
    expect(parsed.meta).toMatchObject({ name: 'Error', message: 'boom' });
    expect(typeof parsed.time).toBe('string');
  });

  it('drops debug logs below the production min level', async () => {
    const { logger: prodLogger } = await import('@/lib/logger');
    prodLogger.debug('verbose');
    expect(console.debug).not.toHaveBeenCalled();
  });
});
