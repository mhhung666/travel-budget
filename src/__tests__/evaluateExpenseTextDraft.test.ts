import { describe, expect, it } from 'vitest';
import { expenseTextDraftFixtures } from '@/__fixtures__/ai/expenseTextDraftFixtures';
import { evaluateExpenseTextDraftCases } from '@/lib/ai/evaluateExpenseTextDraft';

describe('evaluateExpenseTextDraftCases', () => {
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
