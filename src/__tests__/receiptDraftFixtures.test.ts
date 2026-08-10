import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { receiptDraftFixtures } from '@/__fixtures__/ai/receiptDraftFixtures';
import { receiptDraftSchema } from '@/lib/ai/receiptDraftSchema';

describe('receipt draft fixtures', () => {
  it('keeps at least 40 synthetic fixtures and their images valid without calling a model', () => {
    expect(receiptDraftFixtures.length).toBeGreaterThanOrEqual(40);
    for (const sample of receiptDraftFixtures) {
      const imagePath = resolve(process.cwd(), sample.imagePath);
      expect(existsSync(imagePath), sample.imagePath).toBe(true);
      const image = readFileSync(imagePath);
      expect(image.subarray(0, 8), `${sample.imagePath} should be PNG`).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      );
      expect(
        { width: image.readUInt32BE(16), height: image.readUInt32BE(20) },
        `${sample.imagePath} should keep the evaluation dimensions`
      ).toEqual({ width: 700, height: 1000 });
      expect(
        receiptDraftSchema.safeParse(sample.expected),
        `fixture ${sample.id} should be valid`
      ).toMatchObject({ success: true });
    }
  });

  it('covers the required languages, currencies, ambiguity, and image conditions', () => {
    const tags = new Set(receiptDraftFixtures.flatMap((sample) => sample.tags));
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
      'ambiguous-currency',
      'ambiguous-total',
      'tax',
      'service',
      'discount',
      'tip',
      'rotated',
      'shadow',
      'wrinkled',
      'low-contrast',
      'small-text',
      'long',
      'handwritten',
      'card-slip',
      'non-receipt',
    ])
      expect(tags, `missing fixture tag: ${requiredTag}`).toContain(requiredTag);
  });

  it('contains no direct contact details or usable payment references', () => {
    const serialized = JSON.stringify(receiptDraftFixtures);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    expect(serialized).not.toMatch(/(?:phone|tel|電話|地址|address)\s*[:：]/i);
    expect(serialized).not.toMatch(/\b(?:\d[ -]*?){12,19}\b/);
  });
});
