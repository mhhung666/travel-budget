// @vitest-environment node

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from 'dotenv';
import { describe, expect, it, vi } from 'vitest';
import { NoObjectGeneratedError } from 'ai';
import { expenseTextDraftFixtures } from '@/__fixtures__/ai/expenseTextDraftFixtures';
import { receiptDraftFixtures } from '@/__fixtures__/ai/receiptDraftFixtures';
import { itineraryImportFixtures } from '@/__fixtures__/ai/itineraryImportFixtures';
import { logger } from '@/lib/logger';
import { expenseTextDraftSchema } from '@/lib/ai/expenseTextDraftSchema';
import { receiptDraftSchema } from '@/lib/ai/receiptDraftSchema';
import { itineraryImportDraftSchema } from '@/lib/ai/itineraryImportSchema';
import { parseExpenseTextDraft } from '@/lib/ai/expenseTextDraftProvider';
import { parseReceiptDraft } from '@/lib/ai/receiptDraftProvider';
import { parseItineraryImport } from '@/lib/ai/itineraryImportProvider';
import { normalizeReceiptDraft } from '@/lib/ai/normalizeReceiptDraft';
import { evaluateExpenseTextDraftCases } from '@/lib/ai/evaluateExpenseTextDraft';
import { evaluateReceiptDraftCases } from '@/lib/ai/evaluateReceiptDraft';
import { evaluateItineraryImportCases } from '@/lib/ai/evaluateItineraryImport';

// Wrap the real SDK for controlled experiments and paced production verification.
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: (async (options: Parameters<typeof actual.generateText>[0]) => {
      const thinking = process.env.AI_DIAGNOSTIC_THINKING;
      const systemAppend = process.env.AI_DIAGNOSTIC_SYSTEM_APPEND;
      let output = options.output;
      if (process.env.AI_DIAGNOSTIC_OPENAI_SCHEMA === '1') {
        if (!process.env.AI_MODEL?.startsWith('openai/'))
          throw new Error('OpenAI schema experiment requires an openai/ model');
        const isText =
          typeof options.system === 'string' &&
          options.system.startsWith('Extract exactly one expense');
        const isItinerary =
          typeof options.system === 'string' &&
          options.system.startsWith('You extract itinerary data');
        if (!isItinerary) {
          const canonical = isText ? expenseTextDraftSchema : receiptDraftSchema;
          const schema = structuredClone(await actual.zodSchema<unknown>(canonical).jsonSchema);
          const convert = (node: unknown) => {
            if (!node || typeof node !== 'object') return;
            const oneOf = Reflect.get(node, 'oneOf');
            if (oneOf) {
              Reflect.set(node, 'anyOf', oneOf);
              Reflect.deleteProperty(node, 'oneOf');
            }
            for (const child of Object.values(node)) convert(child);
            const properties = Reflect.get(node, 'properties');
            if (properties && typeof properties === 'object') {
              const required = new Set(Reflect.get(node, 'required') ?? []);
              for (const [key, child] of Object.entries(properties)) {
                if (!required.has(key))
                  Reflect.set(properties, key, { anyOf: [child, { type: 'null' }] });
              }
              Reflect.set(node, 'required', Object.keys(properties));
            }
          };
          convert(schema);
          const omitNulls = (value: unknown): unknown => {
            if (Array.isArray(value)) return value.map(omitNulls);
            if (value && typeof value === 'object')
              return Object.fromEntries(
                Object.entries(value)
                  .filter(([, child]) => child !== null)
                  .map(([key, child]) => [key, omitNulls(child)])
              );
            return value;
          };
          output = actual.Output.object({
            name: isText ? 'expense_text_draft' : 'receipt_draft',
            schema: actual.jsonSchema(schema, {
              validate(value) {
                const parsed = canonical.safeParse(omitNulls(value));
                return parsed.success
                  ? { success: true, value }
                  : { success: false, error: parsed.error };
              },
            }),
          });
        }
      }
      if (process.env.AI_DIAGNOSTIC_RELAX_TIME_PATTERN === '1') {
        if (
          typeof options.system !== 'string' ||
          !options.system.startsWith('You extract itinerary data')
        ) {
          throw new Error('Time-pattern experiment only supports itinerary imports');
        }
        const schema = structuredClone(
          await actual.zodSchema(itineraryImportDraftSchema).jsonSchema
        );
        const visit = (value: unknown) => {
          if (!value || typeof value !== 'object') return;
          for (const [key, child] of Object.entries(value)) {
            if ((key === 'time' || key === 'endTime') && child && typeof child === 'object') {
              Reflect.deleteProperty(child, 'pattern');
            }
            visit(child);
          }
        };
        visit(schema);
        output = actual.Output.object({
          schema: actual.jsonSchema(schema),
          name: 'itinerary_import_draft',
          description: 'A structured itinerary draft extracted from the supplied source text.',
        });
      }
      return actual.generateText({
        ...options,
        output,
        maxRetries: 0,
        ...(systemAppend && typeof options.system === 'string'
          ? { system: `${options.system}\n${systemAppend}` }
          : {}),
        ...(thinking === 'true' || thinking === 'false'
          ? {
              providerOptions: {
                ...options.providerOptions,
                alibaba: { enableThinking: thinking === 'true' },
              },
            }
          : {}),
      });
    }) as typeof actual.generateText,
  };
});

const enabled = process.env.RUN_AI_ACCURACY_DIAGNOSTIC === '1';
if (enabled) config({ path: ['.env.local', '.env'], quiet: true });

function safeFailure(error: unknown) {
  const chain: Array<{ name?: string; statusCode?: number; retryAfter?: string }> = [];
  let modelText: string | undefined;
  let validationIssues: unknown;
  let schemaError: string | undefined;
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 5) {
    seen.add(current);
    const headers = Reflect.get(current, 'responseHeaders');
    const retryAfter =
      headers && typeof headers === 'object' ? Reflect.get(headers, 'retry-after') : undefined;
    const name = Reflect.get(current, 'name');
    const statusCode = Reflect.get(current, 'statusCode');
    const message = Reflect.get(current, 'message');
    // Keep only the schema diagnostic, never the surrounding serialized request.
    if (typeof message === 'string') {
      const match = message.match(/Invalid schema[^\n]*?(?=\"\s*,\s*\"|$)/);
      if (match) {
        schemaError = match[0].slice(0, 1500);
        for (const [key, value] of Object.entries(process.env)) {
          if (/KEY|TOKEN|SECRET|PASSWORD/.test(key) && value && value.length >= 8)
            schemaError = schemaError.replaceAll(value, '[REDACTED]');
        }
      }
    }
    // Only synthetic fixture content is sent to this runner. Preserve invalid model output
    // for diagnosis, but never provider request objects, response bodies, or headers.
    if (NoObjectGeneratedError.isInstance(current)) modelText = current.text;
    if (name === 'ZodError') {
      const issues = Reflect.get(current, 'issues');
      if (Array.isArray(issues))
        validationIssues = issues.map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: issue.message,
        }));
    }
    chain.push({
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof statusCode === 'number' ? { statusCode } : {}),
      ...(typeof retryAfter === 'string' ? { retryAfter } : {}),
    });
    current = Reflect.get(current, 'cause');
  }
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    code: error && typeof error === 'object' ? Reflect.get(error, 'code') : undefined,
    chain,
    modelText,
    validationIssues,
    schemaError,
  };
}

describe.skipIf(!enabled)('live AI accuracy diagnostic (synthetic fixtures only)', () => {
  it(
    'records per-case expected, raw, normalized, latency and usage before scoring',
    async () => {
      const path = process.env.AI_DIAGNOSTIC_OUTPUT;
      if (!path) throw new Error('Set AI_DIAGNOSTIC_OUTPUT to a JSONL report path');
      const filter = new Set(process.env.AI_DIAGNOSTIC_IDS?.split(',').filter(Boolean));
      const features = new Set(
        (process.env.AI_DIAGNOSTIC_FEATURES ?? 'text,receipt,itinerary').split(',')
      );
      const repeats = Number(process.env.AI_DIAGNOSTIC_REPEATS ?? '1');
      expect(Number.isInteger(repeats) && repeats >= 1 && repeats <= 5).toBe(true);
      const intervalMs = Number(process.env.AI_DIAGNOSTIC_INTERVAL_MS ?? '60000');
      expect(Number.isInteger(intervalMs) && intervalMs >= 0 && intervalMs <= 60000).toBe(true);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, '');
      const results: Record<string, Array<{ id: string; expected: unknown; actual: unknown }>> = {};
      const suites = [
        {
          feature: 'text',
          fixtures: expenseTextDraftFixtures,
          run: async (index: number) =>
            parseExpenseTextDraft(expenseTextDraftFixtures[index].sourceText),
        },
        {
          feature: 'receipt',
          fixtures: receiptDraftFixtures,
          run: async (index: number) => {
            const fixture = receiptDraftFixtures[index];
            return parseReceiptDraft(await readFile(fixture.imagePath), fixture.mediaType);
          },
        },
        {
          feature: 'itinerary',
          fixtures: itineraryImportFixtures,
          run: async (index: number) => {
            const fixture = itineraryImportFixtures[index];
            return parseItineraryImport({
              sourceText: fixture.sourceText,
              context: {
                tripStartDate: fixture.trip.startDate,
                tripEndDate: fixture.trip.endDate,
              },
            });
          },
        },
      ];
      let aborted: string | undefined;
      let attempted = 0;
      const latencies: number[] = [];
      const failureCounts: Record<string, number> = {};
      let inputTokens = 0;
      let outputTokens = 0;
      evaluation: for (let repeat = 1; repeat <= repeats; repeat++) {
        for (const suite of suites) {
          if (!features.has(suite.feature)) continue;
          for (const [index, fixture] of suite.fixtures.entries()) {
            if (filter.size && !filter.has(fixture.id)) continue;
            if (attempted > 0 && intervalMs > 0)
              await new Promise((resolve) => setTimeout(resolve, intervalMs));
            attempted++;
            const startedAt = Date.now();
            let raw: unknown = null;
            let actual: unknown = null;
            let usage: unknown;
            let failure: unknown;
            try {
              const generation = await suite.run(index);
              raw = generation.draft;
              actual =
                suite.feature === 'receipt'
                  ? normalizeReceiptDraft(
                      generation.draft as Parameters<typeof normalizeReceiptDraft>[0]
                    )
                  : raw;
              usage = generation.usage;
              inputTokens += generation.usage.inputTokens ?? 0;
              outputTokens += generation.usage.outputTokens ?? 0;
            } catch (error) {
              // Do not persist provider errors containing request headers or credentials.
              failure = safeFailure(error);
            }
            const row = {
              feature: suite.feature,
              id: fixture.id,
              repeat,
              model: process.env.AI_MODEL,
              thinking: process.env.AI_DIAGNOSTIC_THINKING ?? 'production-default',
              systemAppend: process.env.AI_DIAGNOSTIC_SYSTEM_APPEND,
              timePatternRelaxed: process.env.AI_DIAGNOSTIC_RELAX_TIME_PATTERN === '1',
              openAISchemaAdapter: process.env.AI_DIAGNOSTIC_OPENAI_SCHEMA === '1',
              latencyMs: Date.now() - startedAt,
              expected: fixture.expected,
              raw,
              actual,
              usage,
              failure,
            };
            await appendFile(path, JSON.stringify(row) + '\n');
            latencies.push(row.latencyMs);
            (results[suite.feature] ??= []).push({
              id: `${fixture.id}#${repeat}`,
              expected: fixture.expected,
              actual,
            });
            logger.info('AI diagnostic case', {
              feature: suite.feature,
              id: fixture.id,
              repeat,
              status: failure ? 'FAILED' : 'received',
              latencyMs: row.latencyMs,
            });
            const code =
              failure && typeof failure === 'object' ? Reflect.get(failure, 'code') : undefined;
            if (failure)
              failureCounts[String(code ?? 'UNKNOWN')] =
                (failureCounts[String(code ?? 'UNKNOWN')] ?? 0) + 1;
            if (code === 'RATE_LIMITED' || code === 'FEATURE_DISABLED') {
              aborted = code;
              break evaluation;
            }
          }
        }
      }
      expect(Object.values(results).flat().length).toBeGreaterThan(0);
      const summary = {
        provider: process.env.AI_PROVIDER,
        model: process.env.AI_MODEL,
        thinking: process.env.AI_DIAGNOSTIC_THINKING ?? 'production-default',
        systemAppend: process.env.AI_DIAGNOSTIC_SYSTEM_APPEND,
        timePatternRelaxed: process.env.AI_DIAGNOSTIC_RELAX_TIME_PATTERN === '1',
        openAISchemaAdapter: process.env.AI_DIAGNOSTIC_OPENAI_SCHEMA === '1',
        datasetCounts: Object.fromEntries(
          suites.map((suite) => [suite.feature, suite.fixtures.length])
        ),
        repeats,
        intervalMs,
        maxRetries: 0,
        failureCounts,
        inputTokens,
        outputTokens,
        averageLatencyMs: latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
        p95LatencyMs: [...latencies].sort((a, b) => a - b)[Math.ceil(latencies.length * 0.95) - 1],
        aborted,
        attempted: Object.values(results).flat().length,
        successful: Object.values(results)
          .flat()
          .filter((row) => row.actual !== null).length,
        text: results.text?.some((row) => row.actual !== null)
          ? evaluateExpenseTextDraftCases(
              results.text
                .filter((row) => row.actual !== null)
                .map((row) => ({
                  ...row,
                  expected: expenseTextDraftSchema.parse(row.expected),
                }))
            )
          : null,
        receipt: results.receipt?.some((row) => row.actual !== null)
          ? evaluateReceiptDraftCases(
              results.receipt
                .filter((row) => row.actual !== null)
                .map((row) => ({
                  ...row,
                  expected: receiptDraftSchema.parse(row.expected),
                }))
            )
          : null,
        itinerary: results.itinerary?.some((row) => row.actual !== null)
          ? evaluateItineraryImportCases(
              results.itinerary
                .filter((row) => row.actual !== null)
                .map((row) => ({
                  ...row,
                  expected: itineraryImportDraftSchema.parse(row.expected),
                }))
            )
          : null,
      };
      await writeFile(`${path}.summary.json`, JSON.stringify(summary, null, 2));
      logger.info('AI diagnostic summary', summary);
      expect(
        aborted,
        'Provider access blocked; report is partial, not an accuracy result'
      ).toBeUndefined();
      expect(summary.successful).toBeGreaterThan(0);
      // Collection success is deliberately separate from model quality thresholds.
    },
    // Allow every selected case its maximum provider timeout and pacing delay.
    60_000 +
      (expenseTextDraftFixtures.length +
        receiptDraftFixtures.length +
        itineraryImportFixtures.length) *
        Math.max(1, Math.min(5, Number(process.env.AI_DIAGNOSTIC_REPEATS) || 1)) *
        (120_000 + 60_000)
  );
});

// Re-score saved synthetic results without making any provider calls. Keep one successful
// output per feature/case (last file wins), so partial runs do not inflate the sample count.
describe.skipIf(!process.env.AI_DIAGNOSTIC_REPLAY_INPUT)('offline AI report replay', () => {
  it('scores unique saved cases with the current evaluators', async () => {
    const output = process.env.AI_DIAGNOSTIC_OUTPUT;
    if (!output) throw new Error('Set AI_DIAGNOSTIC_OUTPUT to the output JSON path');
    const paths = process.env.AI_DIAGNOSTIC_REPLAY_INPUT!.split(',');
    const rows = (
      await Promise.all(
        paths.map(async (path) =>
          (await readFile(path, 'utf8'))
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(
              (line) =>
                JSON.parse(line) as {
                  feature: string;
                  id: string;
                  model: string;
                  expected: unknown;
                  actual: unknown;
                }
            )
        )
      )
    ).flat();
    const successful = rows.filter((row) => row.actual !== null);
    expect(successful.length).toBeGreaterThan(0);
    expect(
      new Set(successful.map((row) => row.model)).size,
      'Do not combine different models'
    ).toBe(1);
    const unique = [
      ...new Map(successful.map((row) => [`${row.feature}:${row.id}`, row])).values(),
    ];
    const text = unique.filter((row) => row.feature === 'text');
    const receipt = unique.filter((row) => row.feature === 'receipt');
    const itinerary = unique.filter((row) => row.feature === 'itinerary');
    const summary = {
      sourceFiles: paths,
      model: successful[0].model,
      collectedRows: rows.length,
      successfulRows: successful.length,
      uniqueSuccessfulCases: unique.length,
      text: text.length
        ? evaluateExpenseTextDraftCases(
            text.map((row) => ({ ...row, expected: expenseTextDraftSchema.parse(row.expected) }))
          )
        : null,
      receipt: receipt.length
        ? evaluateReceiptDraftCases(
            receipt.map((row) => ({ ...row, expected: receiptDraftSchema.parse(row.expected) }))
          )
        : null,
      itinerary: itinerary.length
        ? evaluateItineraryImportCases(
            itinerary.map((row) => ({
              ...row,
              expected: itineraryImportDraftSchema.parse(row.expected),
            }))
          )
        : null,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(summary, null, 2));
    logger.info('AI replay summary', summary);
  });
});
