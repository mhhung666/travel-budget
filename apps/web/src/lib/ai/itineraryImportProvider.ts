import { createGateway } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
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
import { AiProviderError, classifyAiProviderFailure, type AiProviderUsage } from './aiProvider';

export { AiProviderError as ItineraryImportProviderError } from './aiProvider';
export type { AiProviderErrorCode as ItineraryImportProviderErrorCode } from './aiProvider';

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

export type ItineraryImportUsage = AiProviderUsage;

export type ItineraryImportGeneration = {
  draft: ItineraryImportDraft;
  provider: ItineraryImportProviderName;
  model: string;
  usage: ItineraryImportUsage;
};

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
  const timeoutMs = readTimeout(environment.AI_TIMEOUT_MS);

  if (provider === 'vercel') {
    const result = providerConfigSchema.safeParse({
      provider,
      model,
      apiKey: environment.AI_GATEWAY_API_KEY ?? environment.VERCEL_OIDC_TOKEN,
      timeoutMs,
    });
    if (result.success) return result.data;
    throw new AiProviderError('FEATURE_DISABLED');
  }

  if (provider === 'openai') {
    const result = providerConfigSchema.safeParse({
      provider,
      model,
      apiKey: environment.OPENAI_API_KEY,
      timeoutMs,
    });
    if (result.success) return result.data;
    throw new AiProviderError('FEATURE_DISABLED');
  }

  throw new AiProviderError('FEATURE_DISABLED');
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
      throw new AiProviderError('MODEL_OUTPUT_LIMIT');
    }

    // AI SDK validates structured output; parse once more at our boundary so this contract remains
    // enforced even if the provider implementation changes.
    const draft = strictOpenAIOutput
      ? parseOpenAIItineraryImportDraft(result.output)
      : itineraryImportDraftSchema.parse(result.output);
    return {
      draft: retainEvidencedEndDates(draft, input.sourceText),
      provider: config.provider,
      model: config.model,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  } catch (error) {
    throw new AiProviderError(classifyAiProviderFailure(error), { cause: error });
  }
}

/** A clock pair alone is not evidence of a calendar date. Never retain a model-only date claim. */
export function retainEvidencedEndDates(
  draft: ItineraryImportDraft,
  source: string
): ItineraryImportDraft {
  const dateEvidence =
    /(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[月/]\d{1,2}|翌日|翌々日|隔天|次日|同日|當日|当日|next day|same day|following day|\bday\s*[+-]?\d+|\d+\s*(?:days? later|天後|天后|日後)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})/iu;
  return {
    ...draft,
    days: draft.days.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => {
        const { endDateEvidence, endDayOffset, ...rest } = activity;
        return {
          ...rest,
          ...(endDayOffset !== undefined
            ? {
                endDayOffset:
                  endDateEvidence?.trim() &&
                  dateEvidence.test(endDateEvidence) &&
                  source.includes(endDateEvidence.trim())
                    ? endDayOffset
                    : null,
              }
            : {}),
        };
      }),
    })),
  };
}
