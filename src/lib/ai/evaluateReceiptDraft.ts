import { receiptDraftSchema, type ReceiptDraft } from './receiptDraftSchema';

export type ReceiptDraftEvaluationCase = {
  id: string;
  expected: ReceiptDraft;
  actual: unknown;
};

type CoreField = 'merchantName' | 'transactionDate' | 'currency' | 'total';
type AmbiguousField = 'currency' | 'total';
type FieldScore = { correct: number; total: number; accuracy: number };

export type ReceiptDraftEvaluation = {
  cases: number;
  validSchemaCases: number;
  validSchemaRate: number;
  fields: Record<CoreField, FieldScore>;
  coreFieldAccuracy: number;
  ambiguity: Record<AmbiguousField, FieldScore>;
  ambiguityInterceptionRate: number;
  invalidCaseIds: string[];
  mismatchCaseIds: Record<CoreField, string[]>;
  missedAmbiguityCaseIds: Record<AmbiguousField, string[]>;
};

function ratio(correct: number, total: number): number {
  return total === 0 ? 1 : correct / total;
}

function canonicalText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function uniqueTotal(draft: ReceiptDraft): number | undefined {
  const totals = draft.amountCandidates.filter((candidate) => candidate.kind === 'total');
  return totals.length === 1 ? totals[0].amount : undefined;
}

function fieldMatches(field: CoreField, expected: ReceiptDraft, actual: ReceiptDraft): boolean {
  if (field === 'merchantName') {
    return (
      expected.merchantName !== undefined &&
      actual.merchantName !== undefined &&
      canonicalText(actual.merchantName) === canonicalText(expected.merchantName)
    );
  }
  if (field === 'transactionDate') return actual.transactionDate === expected.transactionDate;
  if (field === 'currency') return actual.currency === expected.currency;
  return uniqueTotal(actual) === uniqueTotal(expected);
}

/** Evaluate successful model output separately from provider availability and unsafe ambiguity cases. */
export function evaluateReceiptDraftCases(
  cases: ReceiptDraftEvaluationCase[]
): ReceiptDraftEvaluation {
  const counts: Record<CoreField, { correct: number; total: number }> = {
    merchantName: { correct: 0, total: 0 },
    transactionDate: { correct: 0, total: 0 },
    currency: { correct: 0, total: 0 },
    total: { correct: 0, total: 0 },
  };
  const ambiguityCounts: Record<AmbiguousField, { correct: number; total: number }> = {
    currency: { correct: 0, total: 0 },
    total: { correct: 0, total: 0 },
  };
  const invalidCaseIds: string[] = [];
  const mismatchCaseIds: Record<CoreField, string[]> = {
    merchantName: [],
    transactionDate: [],
    currency: [],
    total: [],
  };
  const missedAmbiguityCaseIds: Record<AmbiguousField, string[]> = {
    currency: [],
    total: [],
  };

  for (const testCase of cases) {
    const result = receiptDraftSchema.safeParse(testCase.actual);
    if (!result.success) invalidCaseIds.push(testCase.id);
    const actual = result.success ? result.data : undefined;

    for (const field of Object.keys(counts) as CoreField[]) {
      if (testCase.expected.fieldStatus[field] !== 'read') continue;
      counts[field].total += 1;
      if (actual && fieldMatches(field, testCase.expected, actual)) counts[field].correct += 1;
      else mismatchCaseIds[field].push(testCase.id);
    }

    for (const field of Object.keys(ambiguityCounts) as AmbiguousField[]) {
      if (testCase.expected.fieldStatus[field] !== 'ambiguous') continue;
      ambiguityCounts[field].total += 1;
      if (actual?.fieldStatus[field] === 'ambiguous') ambiguityCounts[field].correct += 1;
      else missedAmbiguityCaseIds[field].push(testCase.id);
    }
  }

  const fields = Object.fromEntries(
    (Object.keys(counts) as CoreField[]).map((field) => [
      field,
      { ...counts[field], accuracy: ratio(counts[field].correct, counts[field].total) },
    ])
  ) as Record<CoreField, FieldScore>;
  const ambiguity = Object.fromEntries(
    (Object.keys(ambiguityCounts) as AmbiguousField[]).map((field) => [
      field,
      {
        ...ambiguityCounts[field],
        accuracy: ratio(ambiguityCounts[field].correct, ambiguityCounts[field].total),
      },
    ])
  ) as Record<AmbiguousField, FieldScore>;
  const totalCorrect = Object.values(counts).reduce((sum, value) => sum + value.correct, 0);
  const totalFields = Object.values(counts).reduce((sum, value) => sum + value.total, 0);
  const ambiguityCorrect = Object.values(ambiguityCounts).reduce(
    (sum, value) => sum + value.correct,
    0
  );
  const ambiguityTotal = Object.values(ambiguityCounts).reduce(
    (sum, value) => sum + value.total,
    0
  );

  return {
    cases: cases.length,
    validSchemaCases: cases.length - invalidCaseIds.length,
    validSchemaRate: ratio(cases.length - invalidCaseIds.length, cases.length),
    fields,
    coreFieldAccuracy: ratio(totalCorrect, totalFields),
    ambiguity,
    ambiguityInterceptionRate: ratio(ambiguityCorrect, ambiguityTotal),
    invalidCaseIds,
    mismatchCaseIds,
    missedAmbiguityCaseIds,
  };
}
