import { describe, it, expect } from 'vitest';
import { selectNotificationRecipients, type RecipientCandidate } from '@/lib/notify';

describe('selectNotificationRecipients', () => {
  it('excludes the actor (no self-notification)', () => {
    const candidates: RecipientCandidate[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(selectNotificationRecipients(candidates, 'a')).toEqual(['b', 'c']);
  });

  it('excludes virtual members (they cannot log in)', () => {
    const candidates: RecipientCandidate[] = [
      { id: 'b' },
      { id: 'v', isVirtual: true },
      { id: 'c', isVirtual: false },
    ];
    expect(selectNotificationRecipients(candidates, 'a')).toEqual(['b', 'c']);
  });

  it('deduplicates repeated ids', () => {
    const candidates: RecipientCandidate[] = [{ id: 'b' }, { id: 'b' }, { id: 'c' }];
    expect(selectNotificationRecipients(candidates, 'a')).toEqual(['b', 'c']);
  });

  it('preserves the candidate order', () => {
    const candidates: RecipientCandidate[] = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
    expect(selectNotificationRecipients(candidates, 'x')).toEqual(['c', 'a', 'b']);
  });

  it('returns empty when the actor is the only candidate', () => {
    expect(selectNotificationRecipients([{ id: 'a' }], 'a')).toEqual([]);
  });

  it('returns empty for no candidates', () => {
    expect(selectNotificationRecipients([], 'a')).toEqual([]);
  });

  it('treats null/undefined isVirtual as a real member', () => {
    const candidates: RecipientCandidate[] = [
      { id: 'b', isVirtual: null },
      { id: 'c', isVirtual: undefined },
    ];
    expect(selectNotificationRecipients(candidates, 'a')).toEqual(['b', 'c']);
  });

  it('combines all rules (actor + virtual + dupes) at once', () => {
    const candidates: RecipientCandidate[] = [
      { id: 'a' }, // actor → out
      { id: 'b' },
      { id: 'b' }, // dupe → out
      { id: 'v', isVirtual: true }, // virtual → out
      { id: 'c' },
    ];
    expect(selectNotificationRecipients(candidates, 'a')).toEqual(['b', 'c']);
  });
});
