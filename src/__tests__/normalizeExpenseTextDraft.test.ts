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
    expect(result.resolvedSplit).toEqual({
      mode: 'equal',
      entries: [
        { memberId: 'a', value: '' },
        { memberId: 'b', value: '' },
      ],
    });
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
    expect(result.resolvedSplit).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain('AMBIGUOUS_PAYER');
    expect(result.warnings.map((warning) => warning.code)).toContain('AMBIGUOUS_PARTICIPANT');
    expect(result.requiresCorrection).toBe(true);
  });

  it.each([
    [
      'amount',
      {
        method: 'amount' as const,
        shares: [
          { memberName: 'Amy', amount: 700 },
          { memberName: 'Bob', amount: 500 },
        ],
      },
      {
        mode: 'amount',
        entries: [
          { memberId: 'a', value: '700' },
          { memberId: 'b', value: '500' },
        ],
      },
    ],
    [
      'percentage',
      {
        method: 'percentage' as const,
        shares: [
          { memberName: 'Amy', percentage: 25 },
          { memberName: 'Bob', percentage: 75 },
        ],
      },
      {
        mode: 'percent',
        entries: [
          { memberId: 'a', value: '25' },
          { memberId: 'b', value: '75' },
        ],
      },
    ],
    [
      'ratio',
      {
        method: 'ratio' as const,
        shares: [
          { memberName: 'Amy', units: 2 },
          { memberName: 'Bob', units: 1 },
        ],
      },
      {
        mode: 'shares',
        entries: [
          { memberId: 'a', value: '2' },
          { memberId: 'b', value: '1' },
        ],
      },
    ],
  ])('maps a balanced %s split to existing form inputs', (_method, split, expected) => {
    const result = normalizeExpenseTextDraft({ ...base, split }, members, 'a');
    expect(result.resolvedSplit).toEqual(expected);
    expect(result.requiresCorrection).toBe(false);
  });

  it('does not apply an amount or percentage split whose values do not balance', () => {
    const result = normalizeExpenseTextDraft(
      {
        ...base,
        split: {
          method: 'amount',
          shares: [
            { memberName: 'Amy', amount: 500 },
            { memberName: 'Bob', amount: 500 },
          ],
        },
      },
      members,
      'a'
    );
    expect(result.resolvedSplit).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain('INVALID_SPLIT_TOTAL');
    expect(result.requiresCorrection).toBe(true);
  });

  it('does not silently merge duplicate shares for the same member', () => {
    const result = normalizeExpenseTextDraft(
      {
        ...base,
        split: {
          method: 'percentage',
          shares: [
            { memberName: 'Amy', percentage: 50 },
            { memberName: 'amy', percentage: 50 },
          ],
        },
      },
      members,
      'a'
    );
    expect(result.participantIds).toEqual(['a']);
    expect(result.resolvedSplit).toBeUndefined();
    expect(result.warnings.map((warning) => warning.code)).toContain('DUPLICATE_PARTICIPANT');
  });

  it('does not apply a split the provider marked as uncertain', () => {
    const result = normalizeExpenseTextDraft(
      { ...base, warnings: [{ code: 'AMBIGUOUS_SPLIT' }] },
      members,
      'a'
    );
    expect(result.resolvedSplit).toBeUndefined();
    expect(result.requiresCorrection).toBe(true);
  });

  it('requires correction for a missing currency', () => {
    const { currency: _currency, ...withoutCurrency } = base;
    const result = normalizeExpenseTextDraft(withoutCurrency, members, 'a');
    expect(result.warnings.map((warning) => warning.code)).toContain('MISSING_CURRENCY');
    expect(result.requiresCorrection).toBe(true);
  });
});
