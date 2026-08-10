// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { config as loadEnvironment } from 'dotenv';
import { expenseTextDraftFixtures } from '@/__fixtures__/ai/expenseTextDraftFixtures';
import {
  evaluateExpenseTextDraftCases,
  type ExpenseTextDraftEvaluationCase,
} from '@/lib/ai/evaluateExpenseTextDraft';
import { AiProviderError } from '@/lib/ai/aiProvider';
import {
  parseExpenseTextDraft,
  resolveExpenseTextDraftProviderConfig,
} from '@/lib/ai/expenseTextDraftProvider';
import { logger } from '@/lib/logger';

const liveEvaluationEnabled = process.env.RUN_AI_EXPENSE_TEXT_EVAL === '1';
if (liveEvaluationEnabled) loadEnvironment({ path: '.env.local', quiet: true });
const configuredIntervalMs = Number(process.env.AI_EXPENSE_TEXT_EVAL_INTERVAL_MS ?? '10000');
const requestIntervalMs =
  Number.isInteger(configuredIntervalMs) && configuredIntervalMs >= 0 ? configuredIntervalMs : 0;
const configuredCaseLimit = Number(process.env.AI_EXPENSE_TEXT_EVAL_CASE_LIMIT ?? '0');
const caseLimit =
  Number.isInteger(configuredCaseLimit) && configuredCaseLimit > 0
    ? configuredCaseLimit
    : expenseTextDraftFixtures.length;

function safeErrorChain(error: unknown) {
  const chain: Array<{ name?: string; message?: string; statusCode?: number }> = [];
  const visited = new Set<object>();
  let current = error;
  while (current && typeof current === 'object' && !visited.has(current) && chain.length < 5) {
    visited.add(current);
    const name = Reflect.get(current, 'name');
    const message = Reflect.get(current, 'message');
    const statusCode = Reflect.get(current, 'statusCode');
    chain.push({
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof message === 'string' ? { message } : {}),
      ...(typeof statusCode === 'number' ? { statusCode } : {}),
    });
    current = Reflect.get(current, 'cause');
  }
  return chain;
}

describe.skipIf(!liveEvaluationEnabled)('AI expense text live fixture evaluation', () => {
  it(
    'meets the Phase 3B provider and core-field thresholds',
    async () => {
      // Fail once with a clear configuration error instead of reporting every fixture as failed.
      const providerConfig = resolveExpenseTextDraftProviderConfig();
      const cases: ExpenseTextDraftEvaluationCase[] = [];
      const generatedCases: ExpenseTextDraftEvaluationCase[] = [];
      let inputTokens = 0;
      let outputTokens = 0;
      let totalLatencyMs = 0;
      const failureCounts: Record<string, number> = {};
      const failureDetails: Array<{ id: string; chain: ReturnType<typeof safeErrorChain> }> = [];

      // Sequential execution keeps provider usage predictable and avoids rate-limit bursts.
      for (const [index, sample] of expenseTextDraftFixtures.slice(0, caseLimit).entries()) {
        if (index > 0 && requestIntervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, requestIntervalMs));
        }
        const startedAt = Date.now();
        try {
          const generation = await parseExpenseTextDraft(sample.sourceText);
          inputTokens += generation.usage.inputTokens ?? 0;
          outputTokens += generation.usage.outputTokens ?? 0;
          const evaluationCase = {
            id: sample.id,
            expected: sample.expected,
            actual: generation.draft,
          };
          cases.push(evaluationCase);
          generatedCases.push(evaluationCase);
        } catch (error) {
          const code = error instanceof AiProviderError ? error.code : 'UNKNOWN_ERROR';
          failureCounts[code] = (failureCounts[code] ?? 0) + 1;
          if (failureDetails.length < 10) {
            failureDetails.push({ id: sample.id, chain: safeErrorChain(error) });
          }
          cases.push({ id: sample.id, expected: sample.expected, actual: null });
        } finally {
          totalLatencyMs += Date.now() - startedAt;
        }
      }

      const evaluation = evaluateExpenseTextDraftCases(cases);
      const generatedEvaluation = evaluateExpenseTextDraftCases(generatedCases);
      const providerSuccessRate = generatedCases.length / cases.length;
      logger.info('AI expense text live evaluation baseline', {
        provider: providerConfig.provider,
        model: providerConfig.model,
        cases: evaluation.cases,
        providerSuccessRate,
        generatedValidSchemaRate:
          generatedCases.length > 0 ? generatedEvaluation.validSchemaRate : null,
        generatedCoreFieldAccuracy:
          generatedCases.length > 0 ? generatedEvaluation.coreFieldAccuracy : null,
        generatedFieldAccuracy: generatedCases.length > 0 ? generatedEvaluation.fields : null,
        generatedMismatchCaseIds:
          generatedCases.length > 0 ? generatedEvaluation.mismatchCaseIds : null,
        averageLatencyMs: Math.round(totalLatencyMs / cases.length),
        inputTokens,
        outputTokens,
        failureCounts,
        failureDetails: JSON.stringify(failureDetails),
        caseLimit,
        requestIntervalMs,
      });

      expect(providerSuccessRate).toBeGreaterThanOrEqual(0.9);
      expect(generatedEvaluation.validSchemaRate).toBe(1);
      for (const score of Object.values(generatedEvaluation.fields)) {
        expect(score.accuracy).toBeGreaterThanOrEqual(0.95);
      }
    },
    10 * 60 * 1_000
  );
});
