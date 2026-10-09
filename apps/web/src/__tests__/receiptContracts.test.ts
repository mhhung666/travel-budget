import { describe, expect, it } from 'vitest';
import {
  receiptAttachmentsV2Schema,
  receiptViewV2Schema,
  expenseDetailV2Schema,
} from '@travel-budget/contracts';
describe('private receipt contracts', () => {
  const metadata = { id: 'a'.repeat(64), contentType: 'application/pdf', size: 1024 };
  const ledger = { baseCurrency: 'JPY', moneyScale: 2 };
  it('whitelists metadata and requires the actual ledger', () => {
    expect(
      receiptAttachmentsV2Schema.parse({
        ledger,
        items: [{ ...metadata, key: 'private', url: 'https://private' }],
      })
    ).toEqual({ ledger, items: [metadata] });
    expect(receiptAttachmentsV2Schema.safeParse({ items: [] }).success).toBe(false);
  });
  it('rejects unsafe URLs and invalid metadata', () => {
    const view = { ...metadata, ledger, expiresAt: Date.now() + 300000 };
    for (const url of [
      'http://private.test/a',
      'file:///a',
      'javascript:alert(1)',
      'https://u:p@private.test/a',
      'https://private.test/a#x',
    ])
      expect(receiptViewV2Schema.safeParse({ ...view, url }).success).toBe(false);
    for (const item of [
      { ...metadata, size: 0 },
      { ...metadata, contentType: 'text/html' },
      { ...metadata, id: '../key' },
    ])
      expect(receiptAttachmentsV2Schema.safeParse({ ledger, items: [item] }).success).toBe(false);
  });
  it('does not add attachments to ordinary expense read or historical receipt schemas', () => {
    expect(Object.keys(expenseDetailV2Schema.shape)).not.toContain('attachments');
  });
});
