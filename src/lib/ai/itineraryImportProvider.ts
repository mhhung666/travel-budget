import { createGateway } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, NoObjectGeneratedError, Output, RetryError } from 'ai';
import { z } from 'zod';
import {
  itineraryImportDraftSchema,
  openAIItineraryImportDraftSchema,
  parseOpenAIItineraryImportDraft,
  type ItineraryImportDraft,
} from './itineraryImportSchema';
import {
  buildItineraryImportSystemPrompt,
  buildItineraryImportUserPrompt,
} from './itineraryImportPrompt';
import type { NormalizeItineraryImportContext } from './normalizeItineraryImport';
import type { Locale } from '@/i18n/routing';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 8_000;

const providerConfigSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('vercel'),
    model: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
    timeoutMs: z.number().int().min(1_000).max(120_000),
  }),
  z.object({
    provider: z.literal('openai'),
    model: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
    timeoutMs: z.number().int().min(1_000).max(120_000),
  }),
]);

export type ItineraryImportProviderConfig = z.infer<typeof providerConfigSchema>;
export type ItineraryImportProviderName = ItineraryImportProviderConfig['provider'];

export type ItineraryImportUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ItineraryImportGeneration = {
  draft: ItineraryImportDraft;
  provider: ItineraryImportProviderName;
  model: string;
  usage: ItineraryImportUsage;
};

export type ItineraryImportProviderErrorCode =
  | 'FEATURE_DISABLED'
  | 'RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'INVALID_MODEL_OUTPUT'
  | 'MODEL_OUTPUT_LIMIT'
  | 'INTERNAL_ERROR';

export class ItineraryImportProviderError extends Error {
  constructor(
    public readonly code: ItineraryImportProviderErrorCode,
    options?: { cause?: unknown }
  ) {
    super(code, options);
    this.name = 'ItineraryImportProviderError';
  }
}

type ProviderEnvironment = Record<string, string | undefined>;

function readTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

/** Resolve configuration without exposing credentials to callers or logs. */
export function resolveItineraryImportProviderConfig(
  environment: ProviderEnvironment = process.env
): ItineraryImportProviderConfig {
  const provider = environment.AI_PROVIDER;
  const model = environment.AI_MODEL;
  const timeoutMs = readTimeout(environment.AI_IMPORT_TIMEOUT_MS);

  if (provider === 'vercel') {
    const result = providerConfigSchema.safeParse({
      provider,
      model,
      apiKey: environment.AI_GATEWAY_API_KEY ?? environment.VERCEL_OIDC_TOKEN,
      timeoutMs,
    });
    if (result.success) return result.data;
    throw new ItineraryImportProviderError('FEATURE_DISABLED');
  }

  if (provider === 'openai') {
    const result = providerConfigSchema.safeParse({
      provider,
      model,
      apiKey: environment.OPENAI_API_KEY,
      timeoutMs,
    });
    if (result.success) return result.data;
    throw new ItineraryImportProviderError('FEATURE_DISABLED');
  }

  throw new ItineraryImportProviderError('FEATURE_DISABLED');
}

function numericProperty(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const property = Reflect.get(value, key);
  return typeof property === 'number' ? property : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const property = Reflect.get(value, key);
  return typeof property === 'string' ? property : undefined;
}

function classifyProviderFailure(
  error: unknown,
  visited: Set<unknown> = new Set()
): ItineraryImportProviderErrorCode {
  if (visited.has(error)) return 'INTERNAL_ERROR';
  visited.add(error);

  if (error instanceof ItineraryImportProviderError) return error.code;
  if (error instanceof z.ZodError) return 'INVALID_MODEL_OUTPUT';
  if (NoObjectGeneratedError.isInstance(error)) {
    const finishReason = stringProperty(error.cause, 'finishReason');
    return finishReason === 'length' ? 'MODEL_OUTPUT_LIMIT' : 'INVALID_MODEL_OUTPUT';
  }

  if (RetryError.isInstance(error)) {
    if (error.reason === 'abort') return 'PROVIDER_TIMEOUT';
    return classifyProviderFailure(error.lastError, visited);
  }

  const statusCode = numericProperty(error, 'statusCode') ?? numericProperty(error, 'status');
  const name = stringProperty(error, 'name') ?? '';
  if (statusCode === 401 || statusCode === 403) return 'FEATURE_DISABLED';
  if (statusCode === 429 || /RateLimit/i.test(name)) return 'RATE_LIMITED';
  if (/Abort|Timeout/i.test(name)) return 'PROVIDER_TIMEOUT';

  if (error && typeof error === 'object') {
    const cause = Reflect.get(error, 'cause');
    if (cause) return classifyProviderFailure(cause, visited);
  }
  return 'INTERNAL_ERROR';
}

function modelFor(config: ItineraryImportProviderConfig) {
  if (config.provider === 'vercel') {
    return createGateway({ apiKey: config.apiKey })(config.model);
  }

  const openAIModel = config.model.startsWith('openai/')
    ? config.model.slice('openai/'.length)
    : config.model;
  return createOpenAI({ apiKey: config.apiKey })(openAIModel);
}

function providerOptionsFor(
  config: ItineraryImportProviderConfig
): Record<string, Record<string, string | boolean>> | undefined {
  if (config.provider === 'vercel' && config.model.startsWith('alibaba/')) {
    return { alibaba: { enableThinking: false } };
  }
  const openAIModel = config.model.startsWith('openai/')
    ? config.model.slice('openai/'.length)
    : config.model;
  if (
    (config.provider === 'openai' || config.model.startsWith('openai/')) &&
    openAIModel.startsWith('gpt-5')
  ) {
    return { openai: { reasoningEffort: 'minimal' as const } };
  }
  return undefined;
}

function usesOpenAIStructuredOutput(config: ItineraryImportProviderConfig): boolean {
  return config.provider === 'openai' || config.model.startsWith('openai/');
}

export async function parseItineraryImport(input: {
  sourceText: string;
  context: Pick<NormalizeItineraryImportContext, 'tripStartDate' | 'tripEndDate'>;
  locale?: Locale;
  maxRetries?: number;
}): Promise<ItineraryImportGeneration> {
  const config = resolveItineraryImportProviderConfig();
  const strictOpenAIOutput = usesOpenAIStructuredOutput(config);

  try {
    const generationOptions = {
      model: modelFor(config),
      system: buildItineraryImportSystemPrompt(input.context, input.locale),
      prompt: buildItineraryImportUserPrompt(input.sourceText),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: input.maxRetries ?? 1,
      timeout: config.timeoutMs,
      temperature: 0,
      providerOptions: providerOptionsFor(config),
    };
    const outputMetadata = {
      name: 'itinerary_import_draft',
      description: 'A structured itinerary draft extracted from the supplied source text.',
    };
    const result = strictOpenAIOutput
      ? await generateText({
          ...generationOptions,
          output: Output.object({ schema: openAIItineraryImportDraftSchema, ...outputMetadata }),
        })
      : await generateText({
          ...generationOptions,
          output: Output.object({ schema: itineraryImportDraftSchema, ...outputMetadata }),
        });

    if (result.finishReason === 'length') {
      throw new ItineraryImportProviderError('MODEL_OUTPUT_LIMIT');
    }

    // AI SDK validates structured output; parse once more at our boundary so this contract remains
    // enforced even if the provider implementation changes.
    const draft = strictOpenAIOutput
      ? parseOpenAIItineraryImportDraft(result.output)
      : itineraryImportDraftSchema.parse(result.output);
    return {
      draft,
      provider: config.provider,
      model: config.model,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  } catch (error) {
    throw new ItineraryImportProviderError(classifyProviderFailure(error), { cause: error });
  }
}
