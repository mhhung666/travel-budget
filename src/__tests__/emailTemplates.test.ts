import { describe, it, expect, vi } from 'vitest';

// vitest.setup.ts 全域把 next-intl 換成只有 hooks 的 mock；email 模板用的是
// createTranslator（非 hook），故在本檔還原真實模組。
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return actual;
});

import {
  buildNotificationEmail,
  buildPaymentReminderEmail,
  buildExpenseDigestEmail,
} from '@/lib/emailTemplates';

const base = {
  actorName: 'Alice',
  tripHashCode: 'trip123',
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

  it('links friend notifications to the settings friends card (no trip)', async () => {
    const req = await buildNotificationEmail({
      ...base,
      type: 'friend_request',
      tripName: '',
      tripHashCode: '',
      locale: 'zh',
    });
    expect(req.text).toContain('https://app.example.com/settings/friends');
    expect(req.text).not.toContain('/trips/');
    expect(req.subject).toContain('Alice');

    const acc = await buildNotificationEmail({
      ...base,
      type: 'friend_accepted',
      tripName: '',
      tripHashCode: '',
      locale: 'en',
    });
    expect(acc.html).toContain('/settings/friends');
    expect(acc.subject).toContain('accepted');
  });

  it('uses relative paths when appUrl is null', async () => {
    const email = await buildNotificationEmail({
      ...base,
      type: 'expense_added',
      locale: 'en',
      appUrl: null,
      meta: { description: 'x', amount: 1 },
    });
    expect(email.html).toContain('href="/trips/trip123/expenses"');
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

describe('buildPaymentReminderEmail', () => {
  const base = {
    actorName: 'Alice',
    tripHashCode: 't1',
    tripName: 'Tokyo',
    amount: 1234.6,
  };

  it('links to the settlement page and rounds the amount', async () => {
    const email = await buildPaymentReminderEmail({
      ...base,
      locale: 'en',
      appUrl: 'https://app.example.com',
    });
    expect(email.html).toContain('https://app.example.com/trips/t1/settlement');
    expect(email.html).toContain('Tokyo');
    expect(email.text).toContain('1235'); // 取整
  });

  it('mentions the reminding actor in the body', async () => {
    const email = await buildPaymentReminderEmail({ ...base, locale: 'en', appUrl: null });
    expect(email.text).toContain('Alice');
  });

  it('localizes the subject', async () => {
    const en = await buildPaymentReminderEmail({ ...base, locale: 'en', appUrl: null });
    const zh = await buildPaymentReminderEmail({ ...base, locale: 'zh', appUrl: null });
    expect(en.subject).not.toEqual(zh.subject);
    expect(zh.subject).toContain('還款');
  });

  it('escapes the actor name in HTML', async () => {
    const email = await buildPaymentReminderEmail({
      ...base,
      actorName: '<script>x</script>',
      locale: 'en',
      appUrl: null,
    });
    expect(email.html).not.toContain('<script>x</script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('buildExpenseDigestEmail', () => {
  const trips = [
    {
      tripHashCode: 't1',
      tripName: 'Tokyo',
      expenses: [
        { description: 'Lunch', amount: 1234, payerName: 'Alice' },
        { description: 'Taxi', amount: 500, payerName: 'Bob' },
      ],
    },
  ];

  it('groups expenses under each trip with detail and a trip link', async () => {
    const email = await buildExpenseDigestEmail({
      locale: 'en',
      appUrl: 'https://app.example.com',
      trips,
    });
    expect(email.html).toContain('https://app.example.com/trips/t1');
    expect(email.html).not.toContain('/settlement'); // 連到旅程詳情，非結算頁
    expect(email.html).toContain('Tokyo');
    expect(email.html).toContain('Lunch');
    expect(email.html).toContain('Taxi');
    expect(email.html).toContain('Alice');
    expect(email.html).toContain('1234'); // 金額取整
  });

  it('localizes the subject', async () => {
    const en = await buildExpenseDigestEmail({ locale: 'en', appUrl: null, trips });
    const zh = await buildExpenseDigestEmail({ locale: 'zh', appUrl: null, trips });
    expect(en.subject).not.toEqual(zh.subject);
    expect(zh.subject).toContain('支出');
  });

  it('escapes HTML in expense descriptions', async () => {
    const email = await buildExpenseDigestEmail({
      locale: 'en',
      appUrl: null,
      trips: [
        {
          tripHashCode: 't1',
          tripName: 'T',
          expenses: [{ description: '<b>x</b>', amount: 1, payerName: 'P' }],
        },
      ],
    });
    expect(email.html).not.toContain('<b>x</b>');
    expect(email.html).toContain('&lt;b&gt;');
  });
});
