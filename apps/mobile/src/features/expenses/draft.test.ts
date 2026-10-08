import { describe, expect, it } from 'vitest';
import {
  MAX_EXPENSE_DESCRIPTION,
  expenseCreateInput,
  type ExpenseOptions,
  type ExpensePreview,
} from '@/api/contracts';
import {
  confirmedFields,
  newDraft,
  previewInputOf,
  previewKey,
  validateDraft,
  type ExpenseDraft,
} from './draft';

const id = (n: number) => n.toString(16).padStart(24, '0');
const [ME, ANN, BOB, CAT] = [id(1), id(2), id(3), id(4)];
const options: ExpenseOptions = {
  members: [
    { id: ME, displayName: 'Me' },
    { id: ANN, displayName: 'Ann' },
    { id: BOB, displayName: 'Bob' },
    { id: CAT, displayName: 'Cat' },
  ],
  categories: ['food', 'other'],
};
const valid = (patch: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  description: 'Dinner',
  amountText: '100',
  category: 'food',
  date: '2026-10-04',
  payerId: ME,
  memberIds: [ME, ANN, BOB],
  ...patch,
});
const preview = (amount: number, shares: [string, number][]): ExpensePreview => ({
  amount,
  splits: shares.map(([userId, shareAmount]) => ({ userId, displayName: userId, shareAmount })),
});

describe('newDraft', () => {
  it('starts with the viewer paying and everyone sharing', () => {
    expect(newDraft(options, ANN, '2026-10-04')).toEqual({
      description: '',
      amountText: '',
      currency: 'TWD',
      rateText: '1',
      rateSource: 'trip',
      rateDate: undefined,
      category: 'food',
      date: '2026-10-04',
      payerId: ANN,
      memberIds: [ME, ANN, BOB, CAT],
    });
  });
  it('falls back to the first member when the viewer is not listed, and survives no members', () => {
    expect(newDraft(options, id(99), '2026-10-04').payerId).toBe(ME);
    expect(newDraft(options, undefined, '2026-10-04').payerId).toBe(ME);
    expect(newDraft({ members: [], categories: [] }, ME, '2026-10-04').payerId).toBeNull();
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(valid(), options)).toEqual([]);
  });
  it('reports every problem with its field', () => {
    expect(
      validateDraft(
        valid({
          description: '  ',
          amountText: '',
          date: '2026-02-31',
          payerId: null,
          memberIds: [],
        }),
        options
      )
    ).toEqual([
      { field: 'description', code: 'required' },
      { field: 'amount', code: 'empty' },
      { field: 'date', code: 'invalid' },
      { field: 'payer', code: 'required' },
      { field: 'members', code: 'required' },
    ]);
  });
  it('measures the description after trimming and stops at the contract limit', () => {
    expect(
      validateDraft(valid({ description: ` ${'a'.repeat(MAX_EXPENSE_DESCRIPTION)} ` }), options)
    ).toEqual([]);
    expect(
      validateDraft(valid({ description: 'a'.repeat(MAX_EXPENSE_DESCRIPTION + 1) }), options)
    ).toEqual([{ field: 'description', code: 'tooLong' }]);
  });
  it.each([
    ['12abc', 'format'],
    ['0', 'zero'],
    ['1000000000.01', 'tooLarge'],
  ] as const)('rejects amount %j', (amountText, code) => {
    expect(validateDraft(valid({ amountText }), options)).toEqual([{ field: 'amount', code }]);
  });
  it('requires a payer and members that belong to the trip', () => {
    expect(validateDraft(valid({ payerId: id(99) }), options)).toEqual([
      { field: 'payer', code: 'required' },
    ]);
    expect(validateDraft(valid({ memberIds: [id(99)] }), options)).toEqual([
      { field: 'members', code: 'changed' },
    ]);
  });
  it('requires explicit correction of removed members and categories, never shrinking a split silently', () => {
    const input = valid({ category: 'shopping', memberIds: [ME, id(99)] });
    expect(validateDraft(input, options)).toEqual([
      { field: 'category', code: 'required' },
      { field: 'members', code: 'changed' },
    ]);
    expect(previewInputOf(input, options)).toBeNull();
    expect(input.memberIds).toEqual([ME, id(99)]);
  });
  it('lets the payer stay out of the split', () => {
    expect(validateDraft(valid({ payerId: CAT, memberIds: [ME, ANN] }), options)).toEqual([]);
  });
});

describe('previewInputOf and previewKey', () => {
  it('orders members as the backend does, whatever the selection order was', () => {
    expect(previewInputOf(valid({ memberIds: [BOB, ME, ANN] }), options)).toEqual({
      amount: 100,
      member_ids: [ME, ANN, BOB],
    });
  });
  it('refuses removed members and invalid input', () => {
    expect(previewInputOf(valid({ memberIds: [ME, id(99)] }), options)).toBeNull();
    expect(previewInputOf(valid({ amountText: 'x' }), options)).toBeNull();
    expect(previewInputOf(valid({ memberIds: [id(99)] }), options)).toBeNull();
  });
  it('changes the key whenever the amount or the members change, not for other fields', () => {
    const key = (patch: Partial<ExpenseDraft>) =>
      previewKey(previewInputOf(valid(patch), options)!);
    const base = key({});
    expect(key({ amountText: '100.00' })).toBe(base);
    expect(key({ description: 'Lunch', category: 'other', date: '2026-10-05', payerId: ANN })).toBe(
      base
    );
    expect(key({ memberIds: [ME, BOB, ANN] })).toBe(base);
    expect(key({ amountText: '100.01' })).not.toBe(base);
    expect(key({ memberIds: [ME, ANN] })).not.toBe(base);
    expect(key({ memberIds: [ME, ANN, CAT] })).not.toBe(base);
  });
});

describe('confirmedFields', () => {
  const shares = preview(100, [
    [ME, 33.34],
    [ANN, 33.33],
    [BOB, 33.33],
  ]);
  it('sends the backend shares exactly as previewed and passes the request contract', () => {
    const fields = confirmedFields(valid({ description: '  Dinner  ' }), options, shares);
    expect(fields).toEqual({
      payer_id: ME,
      original_amount: 100,
      currency: 'TWD',
      exchange_rate: 1,
      description: 'Dinner',
      category: 'food',
      date: '2026-10-04',
      splits: [
        { user_id: ME, share_amount: 33.34 },
        { user_id: ANN, share_amount: 33.33 },
        { user_id: BOB, share_amount: 33.33 },
      ],
    });
    const body = { ...fields, client_request_id: '8d2b0f0e-6a63-4f6f-a0f5-0b7a4d2c9e11' };
    expect(expenseCreateInput.safeParse(body).success).toBe(true);
  });
  it('allows a payer who is not part of the split', () => {
    const fields = confirmedFields(valid({ payerId: CAT }), options, shares);
    expect(fields.payer_id).toBe(CAT);
    expect(fields.splits.map((split) => split.user_id)).toEqual([ME, ANN, BOB]);
  });
  it('refuses a preview that belongs to different input', () => {
    expect(() => confirmedFields(valid({ amountText: '100.01' }), options, shares)).toThrow(
      'STALE_PREVIEW'
    );
    expect(() => confirmedFields(valid({ memberIds: [ME, ANN] }), options, shares)).toThrow(
      'STALE_PREVIEW'
    );
    expect(() => confirmedFields(valid({ memberIds: [ME, ANN, CAT] }), options, shares)).toThrow(
      'STALE_PREVIEW'
    );
  });
  it('refuses an invalid draft', () => {
    expect(() => confirmedFields(valid({ description: '' }), options, shares)).toThrow(
      'INVALID_DRAFT'
    );
    expect(() => confirmedFields(valid({ date: '2026-02-31' }), options, shares)).toThrow(
      'INVALID_DRAFT'
    );
    expect(() => confirmedFields(valid({ payerId: null }), options, shares)).toThrow(
      'INVALID_DRAFT'
    );
  });
});

describe('G2b raw currency intent', () => {
  const foreign = (patch: Partial<ExpenseDraft> = {}) =>
    valid({ currency: 'JPY', amountText: '000100.00', rateText: '0.2156789012345', ...patch });
  it('prefills only new drafts from pinned settings, never defaulting missing foreign rates to 1', () => {
    const settingOptions = {
      ...options,
      currencySettings: {
        default_currency: 'JPY',
        currencies: [{ code: 'JPY', rate: 0.2156789012345 }],
      },
    };
    expect(newDraft(settingOptions, ME, '2026-10-08')).toMatchObject({
      currency: 'JPY',
      rateText: '0.2156789012345',
      rateSource: 'trip',
    });
    expect(
      newDraft(
        {
          ...settingOptions,
          currencySettings: { ...settingOptions.currencySettings, currencies: [] },
        },
        ME,
        '2026-10-08'
      ).rateText
    ).toBe('');
    expect(validateDraft(foreign({ rateText: '' }), options)).toContainEqual({
      field: 'rate',
      code: 'invalid',
    });
  });
  it('checks both currency and full precision rate against the preview, keeping TWD shares', () => {
    const input = foreign();
    const value = {
      ...preview(21.57, [
        [ME, 7.19],
        [ANN, 7.19],
        [BOB, 7.19],
      ]),
      originalAmount: 100,
      currency: 'JPY',
      exchangeRate: 0.2156789012345,
    };
    expect(confirmedFields(input, options, value)).toMatchObject({
      original_amount: 100,
      currency: 'JPY',
      exchange_rate: 0.2156789012345,
      splits: [
        { user_id: ME, share_amount: 7.19 },
        { user_id: ANN, share_amount: 7.19 },
        { user_id: BOB, share_amount: 7.19 },
      ],
    });
    for (const change of [{ rateText: '0.216' }, { currency: 'USD' }, { amountText: '101' }]) {
      expect(() => confirmedFields(foreign(change), options, value)).toThrow('STALE_PREVIEW');
      expect(previewKey(previewInputOf(foreign(change), options)!)).not.toBe(
        previewKey(previewInputOf(input, options)!)
      );
    }
    expect(() =>
      confirmedFields(
        input,
        options,
        preview(100, [
          [ME, 33.34],
          [ANN, 33.33],
          [BOB, 33.33],
        ])
      )
    ).toThrow('STALE_PREVIEW');
  });
  it.each(['', '0', '-1', '1oops', 'Infinity', '1,234', '1e309'])(
    'rejects rate %j without guessing',
    (rateText) => {
      expect(validateDraft(foreign({ rateText }), options)).toContainEqual({
        field: 'rate',
        code: 'invalid',
      });
      expect(previewInputOf(foreign({ rateText }), options)).toBeNull();
    }
  );
  it.each(['1e-7', '1e11', '0.2156789012345'])(
    'preserves rate %s numerically without display rounding',
    (rateText) => {
      expect(previewInputOf(foreign({ rateText }), options)).toMatchObject({
        currency: 'JPY',
        exchange_rate: Number(rateText),
      });
    }
  );
  it('allows safe large foreign originals, keeps JPY cents and rejects unsupported currencies', () => {
    expect(validateDraft(foreign({ amountText: '50000000000' }), options)).toEqual([]);
    expect(previewInputOf(foreign({ amountText: '100.01' }), options)?.amount).toBe(100.01);
    expect(
      validateDraft(foreign({ currency: 'ZZZ' }), {
        ...options,
        supportedCurrencies: ['TWD', 'JPY'],
      })
    ).toContainEqual({ field: 'currency', code: 'invalid' });
  });
});
