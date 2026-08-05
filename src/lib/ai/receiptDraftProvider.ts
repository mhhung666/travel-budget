import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { receiptDraftSchema, type ReceiptDraft } from './receiptDraftSchema';
import { receiptDraftPrompt } from './receiptDraftPrompt';

export async function parseReceiptDraft(
  image: Buffer,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<ReceiptDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_RECEIPT_MODEL ?? process.env.AI_MODEL;
  if (!apiKey || !model) throw new Error('FEATURE_DISABLED');
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
  return receiptDraftSchema.parse(result.output);
}
