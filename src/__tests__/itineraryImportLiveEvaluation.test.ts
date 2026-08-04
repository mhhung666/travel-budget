// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { config as loadEnvironment } from 'dotenv';
import { itineraryImportFixtures } from '@/__fixtures__/ai/itineraryImportFixtures';
import {
  evaluateItineraryImportCases,
  type ItineraryImportEvaluationCase,
} from '@/lib/ai/evaluateItineraryImport';
import {
  ItineraryImportProviderError,
  parseItineraryImport,
} from '@/lib/ai/itineraryImportProvider';
import { logger } from '@/lib/logger';

const liveEvaluationEnabled = process.env.RUN_AI_IMPORT_EVAL === '1';
if (liveEvaluationEnabled) {
  loadEnvironment({ path: '.env.local', quiet: true });
}
const configuredIntervalMs = Number(process.env.AI_IMPORT_EVAL_INTERVAL_MS ?? '0');
const requestIntervalMs =
  Number.isInteger(configuredIntervalMs) && configuredIntervalMs >= 0 ? configuredIntervalMs : 0;
const configuredCaseLimit = Number(process.env.AI_IMPORT_EVAL_CASE_LIMIT ?? '0');
const caseLimit =
  Number.isInteger(configuredCaseLimit) && configuredCaseLimit > 0
    ? configuredCaseLimit
    : itineraryImportFixtures.length;

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

describe.skipIf(!liveEvaluationEnabled)('AI itinerary import live fixture evaluation', () => {
  it(
    'meets the Phase 1 schema and core-field thresholds',
    async () => {
      const cases: ItineraryImportEvaluationCase[] = [];
      let inputTokens = 0;
      let outputTokens = 0;
      let totalLatencyMs = 0;
      const failureCounts: Record<string, number> = {};
      const failureDetails: Array<{ id: string; chain: ReturnType<typeof safeErrorChain> }> = [];

      // Deliberately sequential to avoid bursting provider rate limits and to keep usage predictable.
      for (const [index, sample] of itineraryImportFixtures.slice(0, caseLimit).entries()) {
        if (index > 0 && requestIntervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, requestIntervalMs));
        }
        const startedAt = Date.now();
        try {
          const generation = await parseItineraryImport({
            sourceText: sample.sourceText,
            maxRetries: 0,
            context: {
              tripStartDate: sample.trip.startDate,
              tripEndDate: sample.trip.endDate,
            },
          });
          inputTokens += generation.usage.inputTokens ?? 0;
          outputTokens += generation.usage.outputTokens ?? 0;
          cases.push({ id: sample.id, expected: sample.expected, actual: generation.draft });
        } catch (error) {
          const code = error instanceof ItineraryImportProviderError ? error.code : 'UNKNOWN_ERROR';
          failureCounts[code] = (failureCounts[code] ?? 0) + 1;
          failureDetails.push({ id: sample.id, chain: safeErrorChain(error) });
          cases.push({ id: sample.id, expected: sample.expected, actual: null });
        } finally {
          totalLatencyMs += Date.now() - startedAt;
        }
      }

      const evaluation = evaluateItineraryImportCases(cases);
      logger.info('AI itinerary import live evaluation baseline', {
        cases: evaluation.cases,
        validSchemaRate: evaluation.validSchemaRate,
        coreFieldAccuracy: evaluation.coreFieldAccuracy,
        averageLatencyMs: Math.round(totalLatencyMs / cases.length),
        inputTokens,
        outputTokens,
        failureCounts,
        failureDetails: JSON.stringify(failureDetails),
        caseLimit,
        requestIntervalMs,
      });
      expect(evaluation.validSchemaRate).toBeGreaterThanOrEqual(0.9);
      expect(evaluation.coreFieldAccuracy).toBeGreaterThanOrEqual(0.9);
    },
    10 * 60 * 1_000
  );
});
