import { expenseTextDraftSchema, type ExpenseTextDraft } from './expenseTextDraftSchema';

export type ExpenseTextDraftEvaluationCase = {
  id: string;
  expected: ExpenseTextDraft;
  actual: unknown;
};

type CoreField = 'payer' | 'currency' | 'date' | 'participants';
type FieldScore = { correct: number; total: number; accuracy: number };

export type ExpenseTextDraftEvaluation = {
  cases: number;
  validSchemaCases: number;
  validSchemaRate: number;
  fields: Record<CoreField, FieldScore>;
  coreFieldAccuracy: number;
  invalidCaseIds: string[];
  mismatchCaseIds: Record<CoreField, string[]>;
};

function ratio(correct: number, total: number): number {
  return total === 0 ? 1 : correct / total;
}

function canonicalName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function participants(draft: ExpenseTextDraft): string[] {
  const names =
    draft.split.method === 'equal'
      ? draft.split.participantNames
      : draft.split.shares.map((share) => share.memberName);
  return names.map(canonicalName).sort();
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Score provider output without letting schema/provider failures inflate field accuracy. */
export function evaluateExpenseTextDraftCases(
  cases: ExpenseTextDraftEvaluationCase[]
): ExpenseTextDraftEvaluation {
  const counts: Record<CoreField, { correct: number; total: number }> = {
    payer: { correct: 0, total: 0 },
    currency: { correct: 0, total: 0 },
    date: { correct: 0, total: 0 },
    participants: { correct: 0, total: 0 },
  };
  const invalidCaseIds: string[] = [];
  const mismatchCaseIds: Record<CoreField, string[]> = {
    payer: [],
    currency: [],
    date: [],
    participants: [],
  };

  for (const testCase of cases) {
    const actualResult = expenseTextDraftSchema.safeParse(testCase.actual);
    if (!actualResult.success) invalidCaseIds.push(testCase.id);
    const actual = actualResult.success ? actualResult.data : undefined;

    for (const field of Object.keys(counts) as CoreField[]) counts[field].total += 1;
    if (actual && actual.payerName === testCase.expected.payerName) counts.payer.correct += 1;
    else mismatchCaseIds.payer.push(testCase.id);
    if (actual && actual.currency === testCase.expected.currency) counts.currency.correct += 1;
    else mismatchCaseIds.currency.push(testCase.id);
    if (actual && actual.date === testCase.expected.date) counts.date.correct += 1;
    else mismatchCaseIds.date.push(testCase.id);
    if (actual && sameStringArray(participants(actual), participants(testCase.expected))) {
      counts.participants.correct += 1;
    } else mismatchCaseIds.participants.push(testCase.id);
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
    mismatchCaseIds,
  };
}
