import { expect, it } from 'vitest';
import { ledgerMessages } from './ledgerMessages';
import { messages } from './messages';
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'B3 ledger units and stable localized copy in %s',
  (locale) => {
    const t = ledgerMessages(locale, 'USD');
    expect(t.amountTwd).toContain('USD');
    expect(t.amountsInTwd).toContain('USD');
    expect(t.newExpenseHint).not.toContain('TWD');
    expect(t.expenseRateHint).toContain('USD');
    expect(t.foreignDraftOnlineOnly).toContain('TWD');
    expect(ledgerMessages(locale, 'USD')).toBe(t);
    expect(ledgerMessages(locale).amountTwd).toBe(messages[locale].amountTwd);
  }
);
