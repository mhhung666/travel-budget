import { describe, expect, it } from 'vitest';
import { receiptDraftFixtures } from '@/__fixtures__/ai/receiptDraftFixtures';
import { evaluateReceiptDraftCases } from '@/lib/ai/evaluateReceiptDraft';

describe('evaluateReceiptDraftCases', () => {
  it('reports a perfect reproducible baseline for expected fixtures', () => {
    const evaluation = evaluateReceiptDraftCases(
      receiptDraftFixtures.map((sample) => ({
        id: sample.id,
        expected: sample.expected,
        actual: structuredClone(sample.expected),
      }))
    );
    expect(evaluation).toMatchObject({
      cases: receiptDraftFixtures.length,
      validSchemaRate: 1,
      coreFieldAccuracy: 1,
      ambiguityInterceptionRate: 1,
      invalidCaseIds: [],
    });
    expect(Object.values(evaluation.fields).every((field) => field.accuracy === 1)).toBe(true);
  });

  it('separates invalid output, readable-field accuracy, and ambiguity interception', () => {
    const readable = receiptDraftFixtures.find((sample) => sample.id === 'en-us-tax')!;
    const ambiguous = receiptDraftFixtures.find((sample) => sample.id === 'ambiguous-dollar')!;
    const wrongReadable = structuredClone(readable.expected);
    wrongReadable.currency = 'EUR';
    const missedAmbiguity = structuredClone(ambiguous.expected);
    missedAmbiguity.fieldStatus.currency = 'read';
    missedAmbiguity.currency = 'USD';
    const evaluation = evaluateReceiptDraftCases([
      { id: readable.id, expected: readable.expected, actual: wrongReadable },
      { id: ambiguous.id, expected: ambiguous.expected, actual: missedAmbiguity },
      { id: 'invalid', expected: readable.expected, actual: { amountCandidates: 'invalid' } },
    ]);
    expect(evaluation.validSchemaRate).toBe(2 / 3);
    expect(evaluation.fields.currency.accuracy).toBe(0);
    expect(evaluation.ambiguity.currency.accuracy).toBe(0);
    expect(evaluation.missedAmbiguityCaseIds.currency).toEqual([ambiguous.id]);
  });

  it('handles an empty evaluation set without dividing by zero', () => {
    expect(evaluateReceiptDraftCases([])).toMatchObject({
      cases: 0,
      validSchemaRate: 1,
      coreFieldAccuracy: 1,
      ambiguityInterceptionRate: 1,
    });
  });
});
