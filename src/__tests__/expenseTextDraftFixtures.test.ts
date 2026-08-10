import { describe, expect, it } from 'vitest';
import { expenseTextDraftFixtures } from '@/__fixtures__/ai/expenseTextDraftFixtures';
import { expenseTextDraftSchema } from '@/lib/ai/expenseTextDraftSchema';

describe('expense text draft fixtures', () => {
  it('keeps at least 30 synthetic fixtures valid without calling a model', () => {
    expect(expenseTextDraftFixtures.length).toBeGreaterThanOrEqual(30);
    for (const sample of expenseTextDraftFixtures) {
      expect(
        expenseTextDraftSchema.safeParse(sample.expected),
        `fixture ${sample.id} should be valid`
      ).toMatchObject({ success: true });
    }
  });

  it('covers languages, currencies, all split methods, defaults, and unsafe cases', () => {
    const tags = new Set(expenseTextDraftFixtures.flatMap((sample) => sample.tags));
    for (const requiredTag of [
      'zh-TW',
      'zh-CN',
      'en',
      'ja',
      'mixed-language',
      'TWD',
      'JPY',
      'USD',
      'EUR',
      'HKD',
      'THB',
      'equal',
      'amount',
      'percentage',
      'ratio',
      'default-participants',
      'ambiguous-currency',
      'ambiguous-member',
      'duplicate-participant',
      'safety-warning',
    ]) {
      expect(tags, `missing fixture tag: ${requiredTag}`).toContain(requiredTag);
    }
  });

  it('does not include direct personal identifiers or usable payment references', () => {
    const serialized = JSON.stringify(expenseTextDraftFixtures);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    expect(serialized).not.toMatch(/(?:卡號|card|交易序號|reference)\s*[:：#]?\s*[A-Z0-9-]{6,}/i);
  });
});
