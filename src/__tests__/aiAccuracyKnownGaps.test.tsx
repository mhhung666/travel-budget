import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExpenseForm } from '@/components/trips/detail/expense-form/useExpenseForm';
import { normalizeExpenseTextDraft } from '@/lib/ai/normalizeExpenseTextDraft';
import { normalizeReceiptDraft } from '@/lib/ai/normalizeReceiptDraft';
import { normalizeItineraryImport } from '@/lib/ai/normalizeItineraryImport';
import { evaluateItineraryImportCases } from '@/lib/ai/evaluateItineraryImport';
import { evaluateReceiptDraftCases } from '@/lib/ai/evaluateReceiptDraft';
import { expenseTextDraftFixtures } from '@/__fixtures__/ai/expenseTextDraftFixtures';
import { receiptDraftFixtures } from '@/__fixtures__/ai/receiptDraftFixtures';
import { itineraryImportFixtures } from '@/__fixtures__/ai/itineraryImportFixtures';
import type { Member } from '@/types';

const members = [
  { id: 'a', username: 'a', displayName: '小安' },
  { id: 'b', username: 'b', displayName: '小北' },
];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AI accuracy audit: scoring and product regressions', () => {
  it('text normalization should flag an impossible calendar date', () => {
    const draft = normalizeExpenseTextDraft(
      { ...expenseTextDraftFixtures[0].expected, date: '2026-02-30' },
      members,
      'a'
    );
    expect(draft.requiresCorrection).toBe(true);
    expect(draft.date).toBeUndefined();
    expect(draft.warnings).toContainEqual({ code: 'INVALID_DATE' });
  });

  it('text normalization should flag an invalid ISO currency', () => {
    const draft = normalizeExpenseTextDraft(
      { ...expenseTextDraftFixtures[0].expected, currency: 'ZZZ' },
      members,
      'a'
    );
    expect(draft.requiresCorrection).toBe(true);
    expect(draft.currency).toBeUndefined();
    expect(draft.warnings).toContainEqual({ code: 'INVALID_CURRENCY' });
  });

  it('receipt normalization should preserve supported GBP instead of dropping it', () => {
    const draft = normalizeReceiptDraft({ ...receiptDraftFixtures[0].expected, currency: 'GBP' });
    expect(draft.currency).toBe('GBP');
    expect(draft.fieldStatus.currency).toBe('read');
  });

  it('preserves leap dates and flags impossible itinerary dates without mutating input', () => {
    const input = {
      ...expenseTextDraftFixtures[0].expected,
      date: '2024-02-29',
      itineraryDate: '2026-02-29',
    };
    const draft = normalizeExpenseTextDraft(input, members, 'a');
    expect(draft.date).toBe('2024-02-29');
    expect(draft.itineraryDate).toBeUndefined();
    expect(draft.warnings).toContainEqual({ code: 'INVALID_ITINERARY_DATE' });
    expect(input.itineraryDate).toBe('2026-02-29');
  });

  it('receipt evaluation should penalize hallucinated missing merchant names', () => {
    const sample = receiptDraftFixtures.find((fixture) => fixture.id === 'missing-merchant')!;
    const actual = {
      ...sample.expected,
      merchantName: 'Invented Store',
      fieldStatus: { ...sample.expected.fieldStatus, merchantName: 'read' },
    };
    expect(evaluateReceiptDraftCases([{ ...sample, actual }]).coreFieldAccuracy).toBeLessThan(1);
  });

  it('itinerary evaluation should penalize extra invented activities', () => {
    const sample = itineraryImportFixtures[0];
    const actual = structuredClone(sample.expected);
    actual.days[0].activities.push({ title: 'Invented visit', type: 'shopping' });
    expect(evaluateItineraryImportCases([{ ...sample, actual }]).coreFieldAccuracy).toBeLessThan(1);
  });

  it('itinerary warning indices should follow activities after time sorting', () => {
    const draft = normalizeItineraryImport(
      {
        days: [
          {
            date: '2026-09-01',
            activities: [
              { title: 'Late', type: 'food', time: '18:00' },
              { title: 'Early', type: 'food', time: '09:00' },
            ],
          },
        ],
        sourceSummary: '',
        warnings: [{ code: 'UNRECOGNIZED_CONTENT', dayIndex: 0, activityIndex: 0 }],
      },
      {}
    );
    const warning = draft.warnings[0];
    expect(draft.days[warning.dayIndex!].activities[warning.activityIndex!].title).toBe('Late');
  });

  it.each([null, 30])(
    'applying a text draft refreshes the exchange rate (pinned: %s)',
    async (pinnedRate) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: true, rates: { USD: 32 } }),
        })
      );
      const formMembers = members.map((member) => ({
        id: member.id,
        username: member.username,
        display_name: member.displayName,
      })) as Member[];
      const currentUser = { id: 'a' };
      const { result } = renderHook(() =>
        useExpenseForm({
          mode: 'add',
          tripId: 'accuracy-audit',
          open: true,
          members: formMembers,
          currentUser,
          currencySettings: {
            default_currency: null,
            currencies: [{ code: 'USD', rate: pinnedRate }],
          },
        })
      );
      await waitFor(() => expect(result.current.loadingRates).toBe(false));
      const draft = normalizeExpenseTextDraft(
        { ...expenseTextDraftFixtures[0].expected, currency: 'USD', originalAmount: 10 },
        members,
        'a'
      );
      act(() => result.current.applyTextDraft(draft));
      expect(result.current.form.currency).toBe('USD');
      expect(Number(result.current.form.exchange_rate)).toBe(pinnedRate ?? 32);
      expect(result.current.totalAmountTWD).toBe((pinnedRate ?? 32) * 10);
      act(() => result.current.setForm((previous) => ({ ...previous, exchange_rate: '31.5' })));
      act(() => result.current.applyTextDraft(draft));
      expect(result.current.form.exchange_rate).toBe('31.5');
      act(() => result.current.applyTextDraft({ ...draft, currency: 'GBP' }));
      expect(result.current.form.exchange_rate).toBe('');
      expect(result.current.hasValidExchangeRate).toBe(false);
      act(() => result.current.applyTextDraft({ ...draft, currency: 'TWD' }));
      expect(Number(result.current.form.exchange_rate)).toBe(1);
    }
  );
});
