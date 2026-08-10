import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { receiptDraftSchema, type ReceiptDraft } from './receiptDraftSchema';
import { receiptDraftPrompt } from './receiptDraftPrompt';
import { AiProviderError, classifyAiProviderFailure, type AiProviderUsage } from './aiProvider';

export type ReceiptDraftGeneration = {
  draft: ReceiptDraft;
  provider: 'openai';
  model: string;
  usage: AiProviderUsage;
};

export async function parseReceiptDraft(
  image: Buffer,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<ReceiptDraftGeneration> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_RECEIPT_MODEL ?? process.env.AI_MODEL;
  if (!apiKey || !model) throw new AiProviderError('FEATURE_DISABLED');
  try {
    const result = await generateText({
      model: createOpenAI({ apiKey })(model.replace(/^openai\//, '')),
      system: receiptDraftPrompt,
      prompt: [{ role: 'user', content: [{ type: 'image', image, mediaType }] }],
      output: Output.object({
        schema: receiptDraftSchema,
        name: 'receipt_draft',
        description: 'Receipt expense draft',
      }),
      temperature: 0,
      timeout: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
      maxRetries: 1,
    });
    if (result.finishReason === 'length') throw new AiProviderError('MODEL_OUTPUT_LIMIT');
    return {
      draft: receiptDraftSchema.parse(result.output),
      provider: 'openai',
      model,
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
