import { expect, it } from 'vitest';
import { paymentContextSchema, paymentRevokeContextSchema } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { paymentLabels } from './paymentLabels';
const a = 'a'.repeat(24),
  b = 'b'.repeat(24),
  historical = 'c'.repeat(24);
const payment = {
  id: 'd'.repeat(24),
  fromId: historical,
  fromName: 'Past',
  fromIsVirtual: true,
  toId: b,
  toName: 'Virtual',
  toIsVirtual: true,
  amount: 1,
  note: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};
it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'payment choices, suggestions and historical revocation keep virtual labels in %s',
  (locale) => {
    const t = messages[locale],
      members = [
        { id: a, displayName: 'Alice', isVirtual: false },
        { id: b, displayName: 'Virtual', isVirtual: true },
      ];
    const context = paymentContextSchema.parse({
      members,
      settlementRevision: 'e'.repeat(64),
      settlement: {
        status: 'outstanding',
        totalExpenses: 1,
        balances: [],
        suggestedTransfers: [
          {
            fromId: b,
            fromName: 'Virtual',
            fromIsVirtual: true,
            toId: a,
            toName: 'Alice',
            toIsVirtual: false,
            amount: 1,
          },
        ],
        payments: [payment],
      },
    });
    const labels = paymentLabels(context, a, t);
    expect(labels.choice(a)).toBe(`Alice · ${t.you}`);
    expect(labels.choice(b)).toBe(`Virtual · ${t.virtualMember}`);
    expect(labels.party(b, 'Virtual')).toBe(labels.choice(b));
    const revoke = paymentRevokeContextSchema.parse({ payment, revision: 'e'.repeat(64) });
    expect(paymentLabels(revoke, a, t, members).party(historical, 'Past')).toBe(
      `Past · #cccccc · ${t.virtualMember}`
    );
    expect(paymentLabels(revoke, a, t).party(historical, 'Past')).toBe(`Past · ${t.virtualMember}`);
    expect(paymentLabels(null, a, t).party(null, '')).toBe(t.removedMember);
  }
);
