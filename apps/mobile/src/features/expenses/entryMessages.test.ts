import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n/messages';
import type { DraftIssue } from './draft';
import type { UnconfirmedReason } from './entry';
import { issueMessage, reasonMessage } from './entryMessages';

const issues: DraftIssue[] = [
  { field: 'description', code: 'required' },
  { field: 'description', code: 'tooLong' },
  { field: 'amount', code: 'empty' },
  { field: 'amount', code: 'format' },
  { field: 'amount', code: 'zero' },
  { field: 'amount', code: 'tooLarge' },
  { field: 'date', code: 'invalid' },
  { field: 'payer', code: 'required' },
  { field: 'members', code: 'required' },
];
const reasons: UnconfirmedReason[] = [
  'network',
  'timeout',
  'server',
  'busy',
  'unauthorized',
  'access',
  'conflict',
  'cancelled',
  'not-found',
];

describe.each(Object.entries(messages))('%s entry messages', (_locale, t) => {
  it('has a distinct sentence for every validation problem', () => {
    const texts = issues.map((issue) => issueMessage(issue, t));
    for (const text of texts) expect(text.trim()).not.toBe('');
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('explains every unconfirmed reason except a cancelled attempt', () => {
    for (const reason of reasons) {
      const text = reasonMessage(reason, t);
      if (reason === 'cancelled') expect(text).toBeNull();
      else expect(text?.trim()).toBeTruthy();
    }
    expect(reasonMessage(undefined, t)).toBeNull();
  });

  it('never tells the user a request failed when it may be saved', () => {
    // The wording must keep "do not enter it again" guidance for unclear outcomes.
    expect(t.pendingHint.length).toBeGreaterThan(20);
    expect(reasonMessage('not-found', t)).toBe(t.pendingNotFound);
    expect(reasonMessage('access', t)).toBe(t.pendingAccessLost);
  });
});
