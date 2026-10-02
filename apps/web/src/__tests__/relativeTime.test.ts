import { describe, it, expect } from 'vitest';
import { intlLocale, formatRelativeTime } from '@/lib/relativeTime';

describe('intlLocale', () => {
  it('maps jp → ja (Intl 不認得 jp)', () => {
    expect(intlLocale('jp')).toBe('ja');
  });

  it('maps zh → zh-TW（避免 Intl 把 zh 當簡中）', () => {
    expect(intlLocale('zh')).toBe('zh-TW');
  });

  it('leaves zh-CN as-is（本就是簡中）', () => {
    expect(intlLocale('zh-CN')).toBe('zh-CN');
  });

  it('leaves en as-is', () => {
    expect(intlLocale('en')).toBe('en');
  });
});

describe('formatRelativeTime', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  it('繁中輸出正體字（「小時」非「小时」）', () => {
    const out = formatRelativeTime(twoHoursAgo, 'zh');
    expect(out).toContain('小時');
    expect(out).not.toContain('小时');
  });

  it('簡中維持簡體字', () => {
    const out = formatRelativeTime(twoHoursAgo, 'zh-CN');
    expect(out).toContain('小时');
  });
});
