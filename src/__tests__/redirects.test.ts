import { sanitizeInternalPath } from '@/lib/redirects';

describe('sanitizeInternalPath', () => {
  it('接受站內相對路徑', () => {
    expect(sanitizeInternalPath('/join/24saql')).toBe('/join/24saql');
    expect(sanitizeInternalPath('/trips/abc123?tab=expenses')).toBe('/trips/abc123?tab=expenses');
  });

  it('拒絕空值', () => {
    expect(sanitizeInternalPath(undefined)).toBeNull();
    expect(sanitizeInternalPath(null)).toBeNull();
    expect(sanitizeInternalPath('')).toBeNull();
  });

  it('拒絕外部與 protocol-relative 網址（open redirect）', () => {
    expect(sanitizeInternalPath('https://evil.com')).toBeNull();
    expect(sanitizeInternalPath('//evil.com')).toBeNull();
    expect(sanitizeInternalPath('/\\evil.com')).toBeNull();
    expect(sanitizeInternalPath('javascript:alert(1)')).toBeNull();
  });
});
