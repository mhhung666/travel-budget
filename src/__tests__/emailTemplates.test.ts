import { describe, it, expect, vi } from 'vitest';

// vitest.setup.ts 全域把 next-intl 換成只有 hooks 的 mock；email 模板用的是
// createTranslator（非 hook），故在本檔還原真實模組。
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return actual;
});

import { buildNotificationEmail } from '@/lib/emailTemplates';

const base = {
  actorName: 'Alice',
  tripId: 'trip123',
  tripName: 'Tokyo 2026',
  appUrl: 'https://app.example.com',
};

describe('buildNotificationEmail', () => {
  it('localizes the subject/body per recipient locale', async () => {
    const zh = await buildNotificationEmail({
      ...base,
      type: 'expense_added',
      locale: 'zh',
      meta: { description: '午餐', amount: 500 },
    });
    expect(zh.subject).toContain('Tokyo 2026');
    expect(zh.subject).toContain('Alice');
    expect(zh.text).toContain('午餐');

    const en = await buildNotificationEmail({
      ...base,
      type: 'expense_added',
      locale: 'en',
      meta: { description: 'Lunch', amount: 500 },
    });
    expect(en.subject).toContain('added an expense');
    expect(en.text).toContain('Lunch');
    // 不同語系產出不同 subject
    expect(en.subject).not.toEqual(zh.subject);
  });

  it('falls back to default locale for unsupported locale', async () => {
    const fallback = await buildNotificationEmail({
      ...base,
      type: 'member_joined',
      locale: 'fr',
    });
    const zh = await buildNotificationEmail({
      ...base,
      type: 'member_joined',
      locale: 'zh',
    });
    expect(fallback.subject).toEqual(zh.subject);
  });

  it('links payment_recorded to the settlement page, others to trip detail', async () => {
    const payment = await buildNotificationEmail({
      ...base,
      type: 'payment_recorded',
      locale: 'en',
      meta: { payment_id: 'p1' },
    });
    expect(payment.text).toContain('https://app.example.com/trips/trip123/settlement');
    expect(payment.html).toContain('/trips/trip123/settlement');

    const expense = await buildNotificationEmail({
      ...base,
      type: 'expense_added',
      locale: 'en',
      meta: { description: 'x', amount: 1 },
    });
    expect(expense.text).toContain('https://app.example.com/trips/trip123');
    expect(expense.text).not.toContain('/settlement');
  });

  it('uses relative paths when appUrl is null', async () => {
    const email = await buildNotificationEmail({
      ...base,
      type: 'expense_added',
      locale: 'en',
      appUrl: null,
      meta: { description: 'x', amount: 1 },
    });
    expect(email.html).toContain('href="/trips/trip123"');
    expect(email.html).not.toContain('https://');
  });

  it('escapes HTML in user-provided strings (body), preventing injection', async () => {
    const email = await buildNotificationEmail({
      ...base,
      type: 'expense_added',
      locale: 'en',
      actorName: '<script>x</script>',
      meta: { description: '<b>bold</b>', amount: 1 },
    });
    expect(email.html).not.toContain('<script>x</script>');
    expect(email.html).not.toContain('<b>bold</b>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});
