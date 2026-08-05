import { describe, expect, it } from 'vitest';
import { normalizeExpenseTextDraft } from '@/lib/ai/normalizeExpenseTextDraft';

const members = [
  { id: 'a', displayName: 'Amy', username: 'amy' },
  { id: 'b', displayName: 'Bob', username: 'bob' },
];
const base = {
  description: 'Taxi',
  originalAmount: 1200,
  currency: 'JPY' as const,
  split: { method: 'equal' as const, participantNames: [] },
  warnings: [],
};

describe('normalizeExpenseTextDraft', () => {
  it('defaults omitted payer to current user and omitted participants to everyone', () => {
    const result = normalizeExpenseTextDraft(base, members, 'a');
    expect(result.payerId).toBe('a');
    expect(result.participantIds).toEqual(['a', 'b']);
    expect(result.requiresCorrection).toBe(false);
  });

  it('does not choose a duplicate matching person', () => {
    const result = normalizeExpenseTextDraft(
      { ...base, payerName: 'Amy', split: { method: 'equal', participantNames: ['Amy'] } },
      [...members, { id: 'c', displayName: 'Amy', username: 'amy-two' }],
      'b'
    );
    expect(result.payerId).toBeUndefined();
    expect(result.participantIds).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toContain('AMBIGUOUS_PAYER');
    expect(result.warnings.map((warning) => warning.code)).toContain('AMBIGUOUS_PARTICIPANT');
    expect(result.requiresCorrection).toBe(true);
  });

  it('requires correction for a missing currency', () => {
    const { currency: _currency, ...withoutCurrency } = base;
    const result = normalizeExpenseTextDraft(withoutCurrency, members, 'a');
    expect(result.warnings.map((warning) => warning.code)).toContain('MISSING_CURRENCY');
    expect(result.requiresCorrection).toBe(true);
  });
});
