import { describe, expect, it } from 'vitest';
import { itineraryImportFixtures } from '@/__fixtures__/ai/itineraryImportFixtures';
import { evaluateItineraryImportCases } from '@/lib/ai/evaluateItineraryImport';

describe('evaluateItineraryImportCases', () => {
  it('reports a perfect reproducible baseline for expected fixtures', () => {
    const evaluation = evaluateItineraryImportCases(
      itineraryImportFixtures.map((sample) => ({
        id: sample.id,
        expected: sample.expected,
        actual: structuredClone(sample.expected),
      }))
    );

    expect(evaluation).toMatchObject({
      cases: itineraryImportFixtures.length,
      validSchemaCases: itineraryImportFixtures.length,
      validSchemaRate: 1,
      coreFieldAccuracy: 1,
      invalidCaseIds: [],
    });
    expect(Object.values(evaluation.fields).every((field) => field.accuracy === 1)).toBe(true);
  });

  it('separates schema validity from core field accuracy', () => {
    const [first, second] = itineraryImportFixtures;
    const wrongButValid = structuredClone(first.expected);
    wrongButValid.days[0].activities[0].title = '錯誤標題';

    const evaluation = evaluateItineraryImportCases([
      { id: first.id, expected: first.expected, actual: wrongButValid },
      { id: second.id, expected: second.expected, actual: { days: 'invalid' } },
    ]);

    expect(evaluation.validSchemaCases).toBe(1);
    expect(evaluation.validSchemaRate).toBe(0.5);
    expect(evaluation.invalidCaseIds).toEqual([second.id]);
    expect(evaluation.fields.title.correct).toBeLessThan(evaluation.fields.title.total);
    expect(evaluation.coreFieldAccuracy).toBeLessThan(1);
  });

  it('handles an empty evaluation set without dividing by zero', () => {
    expect(evaluateItineraryImportCases([])).toMatchObject({
      cases: 0,
      validSchemaCases: 0,
      validSchemaRate: 1,
      coreFieldAccuracy: 1,
    });
  });
});
