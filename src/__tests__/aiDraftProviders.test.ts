import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  createOpenAI: vi.fn(),
  openAIModel: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn((options) => ({ kind: 'object', ...options })) },
  NoObjectGeneratedError: { isInstance: vi.fn(() => false) },
  RetryError: { isInstance: vi.fn(() => false) },
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mocks.createOpenAI.mockReturnValue(mocks.openAIModel),
}));

import { parseExpenseTextDraft } from '@/lib/ai/expenseTextDraftProvider';
import { parseReceiptDraft } from '@/lib/ai/receiptDraftProvider';

const originalEnvironment = { ...process.env };
const receiptDraft = {
  merchantName: 'Cafe',
  currency: 'TWD',
  amountCandidates: [{ kind: 'total' as const, amount: 180 }],
  fieldStatus: {
    merchantName: 'read' as const,
    transactionDate: 'missing' as const,
    currency: 'read' as const,
    total: 'read' as const,
  },
  warnings: [],
};
const textDraft = {
  description: 'Lunch',
  originalAmount: 180,
  currency: 'TWD',
  split: { method: 'equal' as const, participantNames: [] },
  warnings: [],
};

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.clearAllMocks();
  mocks.createOpenAI.mockReturnValue(mocks.openAIModel);
});

describe('AI expense draft providers', () => {
  it('treats missing OpenAI configuration as a disabled feature', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_RECEIPT_MODEL;
    delete process.env.AI_EXPENSE_TEXT_MODEL;

    await expect(parseReceiptDraft(Buffer.from('image'), 'image/webp')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    await expect(parseExpenseTextDraft('Lunch 180 TWD')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('returns receipt draft usage without exposing image content in metadata', async () => {
    process.env.OPENAI_API_KEY = 'secret';
    process.env.AI_RECEIPT_MODEL = 'openai/gpt-receipt';
    mocks.openAIModel.mockReturnValue('language-model');
    mocks.generateText.mockResolvedValue({
      output: receiptDraft,
      finishReason: 'stop',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    });

    const result = await parseReceiptDraft(Buffer.from('private-image'), 'image/webp');

    expect(mocks.openAIModel).toHaveBeenCalledWith('gpt-receipt');
    expect(result).toEqual({
      draft: receiptDraft,
      provider: 'openai',
      model: 'openai/gpt-receipt',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    });
  });

  it('returns text draft usage and maps provider timeouts to a stable code', async () => {
    process.env.OPENAI_API_KEY = 'secret';
    process.env.AI_EXPENSE_TEXT_MODEL = 'gpt-text';
    mocks.openAIModel.mockReturnValue('language-model');
    mocks.generateText.mockResolvedValueOnce({
      output: textDraft,
      finishReason: 'stop',
      usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
    });

    await expect(parseExpenseTextDraft('Lunch 180 TWD')).resolves.toEqual({
      draft: textDraft,
      provider: 'openai',
      model: 'gpt-text',
      usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
    });

    mocks.generateText.mockRejectedValueOnce(
      Object.assign(new Error('request aborted'), { name: 'AbortError' })
    );
    await expect(parseExpenseTextDraft('Lunch 180 TWD')).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
    });
  });

  it('maps truncated structured drafts to an output-limit error', async () => {
    process.env.OPENAI_API_KEY = 'secret';
    process.env.AI_RECEIPT_MODEL = 'gpt-receipt';
    mocks.generateText.mockResolvedValue({
      output: receiptDraft,
      finishReason: 'length',
      usage: {},
    });

    await expect(parseReceiptDraft(Buffer.from('image'), 'image/png')).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_LIMIT',
    });
  });
});
