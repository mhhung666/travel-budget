import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { messages } from '@/i18n/messages';
import { errorMessage, isAccessDenied } from './errorMessage';

describe('access errors', () => {
  it.each([401, 403, 404])('treats HTTP %i as lost access', (status) => {
    expect(isAccessDenied(new ApiError('NOT_FOUND', status))).toBe(true);
  });
  it.each([0, 400, 429, 500, 503])('keeps showing data for HTTP %i', (status) => {
    expect(isAccessDenied(new ApiError('SERVER_ERROR', status))).toBe(false);
  });
  it('never mistakes transport failures or unknown errors for lost access', () => {
    expect(isAccessDenied(new ApiError('NETWORK'))).toBe(false);
    expect(isAccessDenied(new ApiError('TIMEOUT'))).toBe(false);
    expect(isAccessDenied(new Error('404'))).toBe(false);
    expect(isAccessDenied(undefined)).toBe(false);
    expect(isAccessDenied({ status: 404 })).toBe(false);
  });
  it('maps statuses to localized messages', () => {
    const t = messages.en;
    expect(errorMessage(new ApiError('NOT_FOUND', 404), t)).toBe(t.notFound);
    expect(errorMessage(new ApiError('UNAUTHORIZED', 401), t)).toBe(t.sessionExpired);
    expect(errorMessage(new ApiError('RATE_LIMITED', 429), t)).toBe(t.rateLimited);
    expect(errorMessage(new ApiError('NETWORK'), t)).toBe(t.networkError);
    expect(errorMessage(new Error('boom'), t)).toBe(t.genericError);
  });
});
