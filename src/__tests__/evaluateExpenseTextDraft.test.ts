import { describe, expect, it } from 'vitest';
import { expenseTextDraftFixtures } from '@/__fixtures__/ai/expenseTextDraftFixtures';
import { evaluateExpenseTextDraftCases } from '@/lib/ai/evaluateExpenseTextDraft';

describe('evaluateExpenseTextDraftCases', () => {
  it('detects incorrect totals and shares even when all participant names match', () => {
    const sample = expenseTextDraftFixtures.find(({ id }) => id === 'zh-tw-amount')!;
    const actual = structuredClone(sample.expected);
    actual.originalAmount = 9000;
    actual.split = {
      method: 'amount',
      shares: [
        { memberName: '小安', amount: 600 },
        { memberName: '小北', amount: 300 },
      ],
    };
    expect(evaluateExpenseTextDraftCases([{ ...sample, actual }])).toMatchObject({
      fields: { participants: { accuracy: 1 }, amount: { accuracy: 0 }, split: { accuracy: 0 } },
    });
    actual.originalAmount = 900;
    actual.split = { method: 'equal', participantNames: ['小安', '小北'] };
    expect(evaluateExpenseTextDraftCases([{ ...sample, actual }]).fields.split.accuracy).toBe(0);
  });

  it('compares explicit shares independently of ordering and checks categories', () => {
    const sample = expenseTextDraftFixtures.find(({ id }) => id === 'zh-tw-amount')!;
    const actual = structuredClone(sample.expected);
    if (actual.split.method !== 'amount') throw new Error('Expected amount fixture');
    actual.split.shares.reverse();
    actual.category = 'food';
    expect(evaluateExpenseTextDraftCases([{ ...sample, actual }])).toMatchObject({
      fields: { split: { accuracy: 1 }, category: { accuracy: 0 } },
    });
  });

  it('reports a perfect reproducible baseline for expected fixtures', () => {
    const evaluation = evaluateExpenseTextDraftCases(
      expenseTextDraftFixtures.map((sample) => ({
        id: sample.id,
        expected: sample.expected,
        actual: structuredClone(sample.expected),
      }))
    );

    expect(evaluation).toMatchObject({
      cases: expenseTextDraftFixtures.length,
      validSchemaCases: expenseTextDraftFixtures.length,
      validSchemaRate: 1,
      coreFieldAccuracy: 1,
      invalidCaseIds: [],
      mismatchCaseIds: { payer: [], currency: [], date: [], participants: [] },
    });
    expect(Object.values(evaluation.fields).every((field) => field.accuracy === 1)).toBe(true);
  });

  it('compares participant names without depending on provider ordering or casing', () => {
    const sample = expenseTextDraftFixtures.find(({ id }) => id === 'en-usd-equal')!;
    const actual = structuredClone(sample.expected);
    actual.split = { method: 'equal', participantNames: ['blair', 'ALEX'] };

    expect(
      evaluateExpenseTextDraftCases([{ id: sample.id, expected: sample.expected, actual }])
    ).toMatchObject({ fields: { participants: { accuracy: 1 } } });
  });

  it('separates schema validity from each core field score', () => {
    const [first, second] = expenseTextDraftFixtures;
    const wrongButValid = structuredClone(first.expected);
    wrongButValid.payerName = '錯誤付款人';

    const evaluation = evaluateExpenseTextDraftCases([
      { id: first.id, expected: first.expected, actual: wrongButValid },
      { id: second.id, expected: second.expected, actual: { split: 'invalid' } },
    ]);

    expect(evaluation.validSchemaRate).toBe(0.5);
    expect(evaluation.invalidCaseIds).toEqual([second.id]);
    expect(evaluation.fields.payer.accuracy).toBe(0);
    expect(evaluation.fields.currency.accuracy).toBe(0.5);
    expect(evaluation.coreFieldAccuracy).toBeLessThan(1);
  });

  it('handles an empty evaluation set without dividing by zero', () => {
    expect(evaluateExpenseTextDraftCases([])).toMatchObject({
      cases: 0,
      validSchemaCases: 0,
      validSchemaRate: 1,
      coreFieldAccuracy: 1,
    });
  });

  it('never awards omitted expected fields to invalid provider output', () => {
    const sample = expenseTextDraftFixtures.find(({ id }) => id === 'ambiguous-dollar')!;
    const evaluation = evaluateExpenseTextDraftCases([
      { id: sample.id, expected: sample.expected, actual: null },
    ]);

    expect(Object.values(evaluation.fields).every((field) => field.correct === 0)).toBe(true);
  });
});
