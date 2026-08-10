// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config as loadEnvironment } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { receiptDraftFixtures } from '@/__fixtures__/ai/receiptDraftFixtures';
import { AiProviderError } from '@/lib/ai/aiProvider';
import { estimateAiUsageCostMicroUsd, resolveAiUsageQuotaConfig } from '@/lib/ai/aiUsageQuota';
import {
  evaluateReceiptDraftCases,
  type ReceiptDraftEvaluationCase,
} from '@/lib/ai/evaluateReceiptDraft';
import { normalizeReceiptDraft } from '@/lib/ai/normalizeReceiptDraft';
import {
  parseReceiptDraft,
  resolveReceiptDraftProviderConfig,
} from '@/lib/ai/receiptDraftProvider';
import { logger } from '@/lib/logger';

const liveEvaluationEnabled = process.env.RUN_AI_RECEIPT_EVAL === '1';
if (liveEvaluationEnabled) loadEnvironment({ path: '.env.local', quiet: true });
const configuredIntervalMs = Number(process.env.AI_RECEIPT_EVAL_INTERVAL_MS ?? '10000');
const requestIntervalMs =
  Number.isInteger(configuredIntervalMs) && configuredIntervalMs >= 0 ? configuredIntervalMs : 0;
const configuredCaseLimit = Number(process.env.AI_RECEIPT_EVAL_CASE_LIMIT ?? '0');
const caseLimit =
  Number.isInteger(configuredCaseLimit) && configuredCaseLimit > 0
    ? configuredCaseLimit
    : receiptDraftFixtures.length;

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

describe.skipIf(!liveEvaluationEnabled)('AI receipt live fixture evaluation', () => {
  it(
    'meets the Phase 3A provider, field, and ambiguity thresholds',
    async () => {
      const providerConfig = resolveReceiptDraftProviderConfig();
      const usageCostConfig = resolveAiUsageQuotaConfig();
      const costEstimationConfigured =
        usageCostConfig.inputMicroUsdPerMillionTokens > 0 ||
        usageCostConfig.outputMicroUsdPerMillionTokens > 0;
      const cases: ReceiptDraftEvaluationCase[] = [];
      const generatedCases: ReceiptDraftEvaluationCase[] = [];
      let inputTokens = 0;
      let outputTokens = 0;
      let totalLatencyMs = 0;
      let estimatedCostMicroUsd = 0;
      const failureCounts: Record<string, number> = {};
      const failureDetails: Array<{ id: string; chain: ReturnType<typeof safeErrorChain> }> = [];

      // Sequential execution keeps image-provider usage predictable and limits request bursts.
      for (const [index, sample] of receiptDraftFixtures.slice(0, caseLimit).entries()) {
        if (index > 0 && requestIntervalMs > 0) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, requestIntervalMs));
        }
        const startedAt = Date.now();
        try {
          const image = await readFile(resolve(process.cwd(), sample.imagePath));
          const generation = await parseReceiptDraft(image, sample.mediaType);
          inputTokens += generation.usage.inputTokens ?? 0;
          outputTokens += generation.usage.outputTokens ?? 0;
          if (costEstimationConfigured) {
            estimatedCostMicroUsd += estimateAiUsageCostMicroUsd(generation.usage, usageCostConfig);
          }
          const evaluationCase = {
            id: sample.id,
            expected: sample.expected,
            actual: normalizeReceiptDraft(generation.draft),
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

      const evaluation = evaluateReceiptDraftCases(cases);
      const generatedEvaluation = evaluateReceiptDraftCases(generatedCases);
      const providerSuccessRate = generatedCases.length / cases.length;
      logger.info('AI receipt live evaluation baseline', {
        provider: providerConfig.provider,
        model: providerConfig.model,
        cases: evaluation.cases,
        providerSuccessRate,
        generatedValidSchemaRate:
          generatedCases.length > 0 ? generatedEvaluation.validSchemaRate : null,
        generatedCoreFieldAccuracy:
          generatedCases.length > 0 ? generatedEvaluation.coreFieldAccuracy : null,
        generatedFieldAccuracy: generatedCases.length > 0 ? generatedEvaluation.fields : null,
        generatedAmbiguityInterceptionRate:
          generatedCases.length > 0 ? generatedEvaluation.ambiguityInterceptionRate : null,
        generatedAmbiguityAccuracy:
          generatedCases.length > 0 ? generatedEvaluation.ambiguity : null,
        generatedMismatchCaseIds:
          generatedCases.length > 0 ? generatedEvaluation.mismatchCaseIds : null,
        generatedMissedAmbiguityCaseIds:
          generatedCases.length > 0 ? generatedEvaluation.missedAmbiguityCaseIds : null,
        averageLatencyMs: Math.round(totalLatencyMs / cases.length),
        inputTokens,
        outputTokens,
        estimatedCostMicroUsd: costEstimationConfigured ? estimatedCostMicroUsd : null,
        averageEstimatedCostMicroUsd:
          costEstimationConfigured && generatedCases.length > 0
            ? Math.round(estimatedCostMicroUsd / generatedCases.length)
            : null,
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
      expect(generatedEvaluation.ambiguityInterceptionRate).toBeGreaterThanOrEqual(0.95);
    },
    15 * 60 * 1_000
  );
});
