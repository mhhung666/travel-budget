import type { Messages } from '@/i18n/messages';
import type { DraftIssue } from './draft';
import type { UnconfirmedReason } from './entry';

/** The text under a form field for one validation problem. */
export function issueMessage(issue: DraftIssue, t: Messages): string {
  switch (issue.field) {
    case 'description':
      return issue.code === 'required' ? t.descriptionRequired : t.descriptionTooLong;
    case 'amount':
      return {
        empty: t.amountRequired,
        format: t.amountFormat,
        zero: t.amountZero,
        tooLarge: t.amountTooLarge,
      }[issue.code];
    case 'currency':
      return issue.code === 'mismatch' ? t.ledgerMismatch : t.invalidCurrencySettings;
    case 'rate':
      return t.invalidExpenseRate;
    case 'date':
      return t.dateInvalid;
    case 'payer':
      return t.payerRequired;
    case 'members':
      return issue.code === 'changed' ? t.draftMembersChanged : t.membersRequired;
    case 'category':
      return t.draftCategoryChanged;
  }
}

/**
 * What an unconfirmed request's card says after its latest attempt. Without an attempt yet, the card
 * only shows its standing explanation. A cancelled attempt (the account changed) says nothing.
 */
export function reasonMessage(reason: UnconfirmedReason | undefined, t: Messages): string | null {
  switch (reason) {
    case undefined:
    case 'cancelled':
      return null;
    case 'not-found':
      return t.pendingNotFound;
    case 'access':
      return t.pendingAccessLost;
    case 'busy':
      return t.pendingBusy;
    case 'conflict':
      return t.pendingConflict;
    case 'network':
      return t.networkError;
    case 'timeout':
      return t.timeoutError;
    case 'unauthorized':
      return t.sessionExpired;
    case 'server':
      return t.genericError;
    case 'retired':
      return t.retiredRecord;
  }
}
