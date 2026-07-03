import { describe, it, expect, vi } from 'vitest';

// vitest.setup.ts 全域把 next-intl 換成只有 hooks 的 mock；buildPushPayload 用的是
// createTranslator（非 hook），故在本檔還原真實模組（比照 emailTemplates.test.ts）。
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return actual;
});

import { buildPushPayload, isExpiredSubscriptionError } from '@/lib/webpush';

const base = {
  actorName: 'Alice',
  tripHashCode: 'trip123',
  tripName: 'Tokyo 2026',
  appUrl: 'https://app.example.com',
};

describe('buildPushPayload', () => {
  it('uses the trip name as the title', async () => {
    const p = await buildPushPayload({
      ...base,
      type: 'expense_added',
      locale: 'zh',
      meta: { description: '午餐' },
    });
    expect(p.title).toBe('Tokyo 2026');
  });

  it('localizes the body per recipient locale', async () => {
    const zh = await buildPushPayload({
      ...base,
      type: 'expense_added',
      locale: 'zh',
      meta: { description: '午餐' },
    });
    expect(zh.body).toContain('Alice');
    expect(zh.body).toContain('午餐');

    const en = await buildPushPayload({
      ...base,
      type: 'expense_added',
      locale: 'en',
      meta: { description: 'Lunch' },
    });
    expect(en.body).toContain('Lunch');
    expect(en.body).not.toEqual(zh.body);
  });

  it('falls back to the default locale for an unsupported locale', async () => {
    const fallback = await buildPushPayload({ ...base, type: 'member_joined', locale: 'fr' });
    const zh = await buildPushPayload({ ...base, type: 'member_joined', locale: 'zh' });
    expect(fallback.body).toEqual(zh.body);
  });

  it('uses the localized "someone" when actorName is empty', async () => {
    const en = await buildPushPayload({
      ...base,
      actorName: '',
      type: 'member_joined',
      locale: 'en',
    });
    // 不應出現空白演員名（如 " joined"），而是退回在地化的 someone
    expect(en.body.trim().length).toBeGreaterThan(0);
    expect(en.body.startsWith(' ')).toBe(false);
  });

  it('links payments to the settlement page and others to the trip page', async () => {
    const payment = await buildPushPayload({ ...base, type: 'payment_recorded', locale: 'zh' });
    expect(payment.url).toBe('https://app.example.com/trips/trip123/settlement');

    const expense = await buildPushPayload({ ...base, type: 'expense_added', locale: 'zh' });
    expect(expense.url).toBe('https://app.example.com/trips/trip123');
  });

  it('falls back to a relative URL when no appUrl is provided', async () => {
    const p = await buildPushPayload({
      ...base,
      appUrl: null,
      type: 'expense_added',
      locale: 'zh',
    });
    expect(p.url).toBe('/trips/trip123');
  });

  it('links friend notifications to the settings friends card', async () => {
    const req = await buildPushPayload({
      ...base,
      type: 'friend_request',
      tripName: '',
      tripHashCode: '',
      locale: 'zh',
    });
    expect(req.url).toBe('https://app.example.com/settings/friends');

    const acc = await buildPushPayload({
      ...base,
      type: 'friend_accepted',
      tripName: '',
      tripHashCode: '',
      locale: 'zh',
    });
    expect(acc.url).toBe('https://app.example.com/settings/friends');
  });

  it('falls back to a generic title when a friend notification has no trip name', async () => {
    const p = await buildPushPayload({
      ...base,
      type: 'friend_request',
      tripName: '',
      tripHashCode: '',
      locale: 'zh',
    });
    // 沒有旅程名 → 退回泛用「通知」標題（非空、非旅程名）
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.title).not.toBe('Tokyo 2026');
    expect(p.body).toContain('Alice');
  });
});

describe('isExpiredSubscriptionError', () => {
  it('treats 404 and 410 as expired (prune the subscription)', () => {
    expect(isExpiredSubscriptionError(404)).toBe(true);
    expect(isExpiredSubscriptionError(410)).toBe(true);
  });

  it('treats other / missing status codes as transient (keep the subscription)', () => {
    expect(isExpiredSubscriptionError(500)).toBe(false);
    expect(isExpiredSubscriptionError(429)).toBe(false);
    expect(isExpiredSubscriptionError(undefined)).toBe(false);
  });
});
