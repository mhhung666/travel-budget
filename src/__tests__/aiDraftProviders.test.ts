import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  createGateway: vi.fn(),
  gatewayModel: vi.fn(),
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
vi.mock('@ai-sdk/gateway', () => ({
  createGateway: mocks.createGateway.mockReturnValue(mocks.gatewayModel),
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
  mocks.createGateway.mockReturnValue(mocks.gatewayModel);
});

describe('AI expense draft providers', () => {
  it('treats missing AI provider configuration as a disabled feature', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_RECEIPT_MODEL;
    delete process.env.AI_EXPENSE_TEXT_MODEL;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    await expect(parseReceiptDraft(Buffer.from('image'), 'image/webp')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    await expect(parseExpenseTextDraft('Lunch 180 TWD')).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('returns receipt draft usage without exposing image content in metadata', async () => {
    process.env.AI_PROVIDER = 'openai';
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

  it('uses the configured Vercel AI Gateway vision model for receipt drafts', async () => {
    process.env.AI_PROVIDER = 'vercel';
    process.env.AI_GATEWAY_API_KEY = 'gateway-secret';
    process.env.AI_RECEIPT_MODEL = 'alibaba/qwen-vision';
    delete process.env.OPENAI_API_KEY;
    mocks.gatewayModel.mockReturnValue('gateway-vision-model');
    mocks.generateText.mockResolvedValue({
      output: receiptDraft,
      finishReason: 'stop',
      usage: { inputTokens: 110, outputTokens: 18, totalTokens: 128 },
    });

    await expect(parseReceiptDraft(Buffer.from('private-image'), 'image/webp')).resolves.toEqual({
      draft: receiptDraft,
      provider: 'vercel',
      model: 'alibaba/qwen-vision',
      usage: { inputTokens: 110, outputTokens: 18, totalTokens: 128 },
    });
    expect(mocks.createGateway).toHaveBeenCalledWith({ apiKey: 'gateway-secret' });
    expect(mocks.gatewayModel).toHaveBeenCalledWith('alibaba/qwen-vision');
    expect(mocks.createOpenAI).not.toHaveBeenCalled();
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gateway-vision-model',
        providerOptions: { alibaba: { enableThinking: false } },
        system: expect.stringContaining('return only JSON'),
        prompt: [
          {
            role: 'user',
            content: [{ type: 'file', data: expect.any(Buffer), mediaType: 'image/webp' }],
          },
        ],
      })
    );
  });

  it('returns text draft usage and maps provider timeouts to a stable code', async () => {
    process.env.AI_PROVIDER = 'openai';
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

  it('uses the configured Vercel AI Gateway model for text drafts', async () => {
    process.env.AI_PROVIDER = 'vercel';
    process.env.AI_GATEWAY_API_KEY = 'gateway-secret';
    process.env.AI_EXPENSE_TEXT_MODEL = 'alibaba/qwen3.7-flash';
    delete process.env.OPENAI_API_KEY;
    mocks.gatewayModel.mockReturnValue('gateway-language-model');
    mocks.generateText.mockResolvedValue({
      output: textDraft,
      finishReason: 'stop',
      usage: { inputTokens: 24, outputTokens: 8, totalTokens: 32 },
    });

    await expect(parseExpenseTextDraft('Lunch 180 TWD')).resolves.toMatchObject({
      draft: textDraft,
      provider: 'vercel',
      model: 'alibaba/qwen3.7-flash',
    });
    expect(mocks.createGateway).toHaveBeenCalledWith({ apiKey: 'gateway-secret' });
    expect(mocks.gatewayModel).toHaveBeenCalledWith('alibaba/qwen3.7-flash');
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gateway-language-model',
        providerOptions: { alibaba: { enableThinking: false } },
        system: expect.stringContaining('originalAmount'),
      })
    );
  });

  it('maps truncated structured drafts to an output-limit error', async () => {
    process.env.AI_PROVIDER = 'openai';
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
