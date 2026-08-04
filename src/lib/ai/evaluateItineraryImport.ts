import { itineraryImportDraftSchema } from './itineraryImportSchema';
import type { ItineraryImportDraft } from './itineraryImportSchema';

export type ItineraryImportEvaluationCase = {
  id: string;
  expected: ItineraryImportDraft;
  actual: unknown;
};

type CoreField = 'date' | 'time' | 'title' | 'type';

type FieldScore = {
  correct: number;
  total: number;
  accuracy: number;
};

export type ItineraryImportEvaluation = {
  cases: number;
  validSchemaCases: number;
  validSchemaRate: number;
  fields: Record<CoreField, FieldScore>;
  coreFieldAccuracy: number;
  invalidCaseIds: string[];
};

function ratio(correct: number, total: number): number {
  return total === 0 ? 1 : correct / total;
}

function dayIdentity(day: ItineraryImportDraft['days'][number]): string | number | undefined {
  return day.date ?? day.relativeDay;
}

export function evaluateItineraryImportCases(
  cases: ItineraryImportEvaluationCase[]
): ItineraryImportEvaluation {
  const counts: Record<CoreField, { correct: number; total: number }> = {
    date: { correct: 0, total: 0 },
    time: { correct: 0, total: 0 },
    title: { correct: 0, total: 0 },
    type: { correct: 0, total: 0 },
  };
  const invalidCaseIds: string[] = [];

  for (const testCase of cases) {
    const actualResult = itineraryImportDraftSchema.safeParse(testCase.actual);
    if (!actualResult.success) invalidCaseIds.push(testCase.id);

    testCase.expected.days.forEach((expectedDay, dayIndex) => {
      const actualDay = actualResult.success ? actualResult.data.days[dayIndex] : undefined;
      counts.date.total += 1;
      if (actualDay && dayIdentity(actualDay) === dayIdentity(expectedDay))
        counts.date.correct += 1;

      expectedDay.activities.forEach((expectedActivity, activityIndex) => {
        const actualActivity = actualDay?.activities[activityIndex];
        for (const field of ['time', 'title', 'type'] as const) {
          counts[field].total += 1;
          if (actualActivity?.[field] === expectedActivity[field]) counts[field].correct += 1;
        }
      });
    });
  }

  const fields = Object.fromEntries(
    (Object.keys(counts) as CoreField[]).map((field) => [
      field,
      { ...counts[field], accuracy: ratio(counts[field].correct, counts[field].total) },
    ])
  ) as Record<CoreField, FieldScore>;
  const totalCorrect = Object.values(counts).reduce((sum, value) => sum + value.correct, 0);
  const totalFields = Object.values(counts).reduce((sum, value) => sum + value.total, 0);

  return {
    cases: cases.length,
    validSchemaCases: cases.length - invalidCaseIds.length,
    validSchemaRate: ratio(cases.length - invalidCaseIds.length, cases.length),
    fields,
    coreFieldAccuracy: ratio(totalCorrect, totalFields),
    invalidCaseIds,
  };
}
