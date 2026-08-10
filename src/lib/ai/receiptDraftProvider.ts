import { createGateway } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { receiptDraftSchema, type ReceiptDraft } from './receiptDraftSchema';
import { receiptDraftPrompt } from './receiptDraftPrompt';
import { AiProviderError, classifyAiProviderFailure, type AiProviderUsage } from './aiProvider';

const DEFAULT_TIMEOUT_MS = 30_000;
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

export type ReceiptDraftProviderConfig = z.infer<typeof providerConfigSchema>;

export type ReceiptDraftGeneration = {
  draft: ReceiptDraft;
  provider: ReceiptDraftProviderConfig['provider'];
  model: string;
  usage: AiProviderUsage;
};

type ProviderEnvironment = Record<string, string | undefined>;

function readTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

/** Resolve receipt extraction through the shared AI provider and a vision-capable model. */
export function resolveReceiptDraftProviderConfig(
  environment: ProviderEnvironment = process.env
): ReceiptDraftProviderConfig {
  const provider = environment.AI_PROVIDER ?? (environment.OPENAI_API_KEY ? 'openai' : undefined);
  const model = environment.AI_RECEIPT_MODEL ?? environment.AI_MODEL;
  const result = providerConfigSchema.safeParse({
    provider,
    model,
    apiKey:
      provider === 'vercel'
        ? (environment.AI_GATEWAY_API_KEY ?? environment.VERCEL_OIDC_TOKEN)
        : environment.OPENAI_API_KEY,
    timeoutMs: readTimeout(environment.AI_TIMEOUT_MS ?? environment.AI_IMPORT_TIMEOUT_MS),
  });
  if (result.success) return result.data;
  throw new AiProviderError('FEATURE_DISABLED');
}

function modelFor(config: ReceiptDraftProviderConfig) {
  if (config.provider === 'vercel') return createGateway({ apiKey: config.apiKey })(config.model);
  return createOpenAI({ apiKey: config.apiKey })(config.model.replace(/^openai\//, ''));
}

function providerOptionsFor(
  config: ReceiptDraftProviderConfig
): Record<string, Record<string, string | boolean>> | undefined {
  if (config.provider === 'vercel' && config.model.startsWith('alibaba/')) {
    return { alibaba: { enableThinking: false } };
  }
  return undefined;
}

export async function parseReceiptDraft(
  image: Buffer,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<ReceiptDraftGeneration> {
  const config = resolveReceiptDraftProviderConfig();
  try {
    const result = await generateText({
      model: modelFor(config),
      system: receiptDraftPrompt,
      prompt: [{ role: 'user', content: [{ type: 'image', image, mediaType }] }],
      output: Output.object({
        schema: receiptDraftSchema,
        name: 'receipt_draft',
        description: 'Receipt expense draft',
      }),
      temperature: 0,
      timeout: config.timeoutMs,
      maxRetries: 1,
      providerOptions: providerOptionsFor(config),
    });
    if (result.finishReason === 'length') throw new AiProviderError('MODEL_OUTPUT_LIMIT');
    return {
      draft: receiptDraftSchema.parse(result.output),
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
