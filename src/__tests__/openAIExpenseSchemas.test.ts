import { describe, expect, it } from 'vitest';
import { zodSchema } from 'ai';
import { expenseTextDraftFixtures } from '@/__fixtures__/ai/expenseTextDraftFixtures';
import { receiptDraftFixtures } from '@/__fixtures__/ai/receiptDraftFixtures';
import {
  openAIExpenseTextDraftSchema,
  parseOpenAIExpenseTextDraft,
} from '@/lib/ai/expenseTextDraftSchema';
import { openAIReceiptDraftSchema, parseOpenAIReceiptDraft } from '@/lib/ai/receiptDraftSchema';

function checkStrictSchema(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  expect(node).not.toHaveProperty('oneOf');
  const properties = Reflect.get(node, 'properties');
  if (properties) {
    expect(Reflect.get(node, 'required').toSorted()).toEqual(Object.keys(properties).toSorted());
    expect(Reflect.get(node, 'additionalProperties')).toBe(false);
  }
  Object.values(node).forEach(checkStrictSchema);
}
const textNulls = {
  date: null,
  currency: null,
  payerName: null,
  category: null,
  tags: null,
  itineraryDate: null,
};
const receiptNulls = {
  merchantName: null,
  transactionDate: null,
  currency: null,
  suggestedCategory: null,
};

describe('OpenAI expense structured output contracts', () => {
  it('emits required nullable fields, closed objects and anyOf splits at the SDK boundary', async () => {
    const text = await zodSchema(openAIExpenseTextDraftSchema).jsonSchema;
    checkStrictSchema(text);
    checkStrictSchema(await zodSchema(openAIReceiptDraftSchema).jsonSchema);
    expect(text.properties?.split).toHaveProperty('anyOf');
  });
  it.each(expenseTextDraftFixtures.map((f) => [f.id, f.expected] as const))(
    'roundtrips text fixture %s',
    (_, draft) => {
      expect(parseOpenAIExpenseTextDraft({ ...textNulls, ...draft })).toEqual(draft);
    }
  );
  it.each(receiptDraftFixtures.map((f) => [f.id, f.expected] as const))(
    'roundtrips receipt fixture %s',
    (_, draft) => {
      expect(
        parseOpenAIReceiptDraft({
          ...receiptNulls,
          ...draft,
          warnings: draft.warnings.map((w) => ({ field: null, ...w })),
        })
      ).toEqual(draft);
    }
  );
  it('rejects missing required fields, null required values, extra fields and invalid split branches', () => {
    const draft = { ...textNulls, ...expenseTextDraftFixtures[0].expected };
    expect(() => parseOpenAIExpenseTextDraft({ ...draft, originalAmount: null })).toThrow();
    expect(() => parseOpenAIExpenseTextDraft({ ...draft, date: undefined })).toThrow();
    expect(() => parseOpenAIExpenseTextDraft({ ...draft, invented: null })).toThrow();
    expect(() =>
      parseOpenAIExpenseTextDraft({ ...draft, split: { method: 'amount', participantNames: [] } })
    ).toThrow();
    expect(() =>
      parseOpenAIReceiptDraft({
        ...receiptNulls,
        ...receiptDraftFixtures[0].expected,
        warnings: [{ code: 'MISSING_DATE', field: 'invented' }],
      })
    ).toThrow();
  });
});
