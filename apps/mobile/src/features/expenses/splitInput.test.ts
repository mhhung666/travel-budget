import { describe, expect, it } from 'vitest';
import { expenseCreateInput, expenseOptionsSchema, type ExpenseOptions } from '@/api/contracts';
import { expenseDraftSchema, isTwdQueueDraft, type ExpenseDraft } from '@/storage/expenseDrafts';
import { confirmedFields, previewInputOf, previewKey, validateDraft } from './draft';
import { splitInputOf, splitModes, splitNumber } from './splitInput';
import { hex, uuidOf } from '@/test/expenseServer';

const ids = [hex(1), hex(2), hex(3)];
const ledger = { baseCurrency: 'TWD', moneyScale: 2 as const };
const options: ExpenseOptions = {
  ledger,
  members: ids.map((id, i) => ({ id, displayName: 'Same', isVirtual: i === 2 })),
  categories: ['food'],
  splitPreviewModes: [...splitModes],
  splitCreateModes: [...splitModes],
};
const draft: ExpenseDraft = {
  ledger,
  apiVersion: 2,
  description: 'Dinner',
  amountText: '100',
  currency: 'TWD',
  rateText: '1',
  payerId: ids[0],
  memberIds: [...ids].reverse(),
  category: 'food',
  date: '2026-10-09',
};
describe('G3 raw input and confirmation', () => {
  it.each([
    ['amount', '00020.00', 20],
    ['amount', '', null],
    ['percent', '  ', null],
    ['shares', '0', 0],
    ['shares', '1000000', 1000000],
    ['shares', '0.0001', 0.0001],
    ['percent', '100.00', 100],
    ['percent', '33.33', 33.33],
  ] as const)('reads %s %j without changing raw text', (mode, text, value) => {
    expect(splitNumber(text, mode)).toBe(value);
  });
  it.each(['-1', '+1', '1e2', '1,000', '12oops', 'Infinity', 'NaN', '.', '0x10', '1.'])(
    'refuses partial or ambiguous text %j',
    (text) => {
      for (const mode of ['amount', 'percent', 'shares'] as const)
        expect(splitNumber(text, mode)).toBeUndefined();
    }
  );
  it.each([
    ['amount', '0.001'],
    ['amount', '900719925474099.99'],
    ['percent', '100.01'],
    ['percent', '33.333'],
    ['shares', '1000000.0001'],
    ['shares', '0.00001'],
  ] as const)('refuses %s beyond precision/range: %s', (mode, text) => {
    expect(splitNumber(text, mode)).toBeUndefined();
  });
  it.each([
    ['equal', {}, undefined, [33.34, 33.33, 33.33]],
    ['amount', { [ids[0]]: '020.00' }, [20, null, null], [20, 40, 40]],
    [
      'percent',
      Object.fromEntries(ids.map((id) => [id, '33.33'])),
      [33.33, 33.33, 33.33],
      [33.34, 33.33, 33.33],
    ],
    [
      'shares',
      Object.fromEntries(ids.map((id, i) => [id, String(i + 1)])),
      [1, 2, 3],
      [16.67, 33.33, 50],
    ],
  ] as const)(
    'maps %s by ID across selection, preview and reversed response order',
    (mode, text, values, shares) => {
      const input: ExpenseDraft = {
        ...draft,
        splitMode: mode,
        splitValues: mode === 'equal' ? {} : { [mode]: text },
      };
      expect(validateDraft(input, options)).toEqual([]);
      const split = mode === 'equal' ? { mode } : { mode, values };
      expect(previewInputOf(input, options)).toMatchObject({ member_ids: ids, split });
      const preview = {
        ledger,
        amount: 100,
        originalAmount: 100,
        currency: 'TWD',
        exchangeRate: 1,
        splitMode: mode,
        splits: ids
          .map((id, i) => ({
            userId: id,
            displayName: 'Same',
            shareAmount: shares[i],
            originalShareAmount: shares[i],
          }))
          .reverse(),
      };
      const body = confirmedFields(input, options, preview);
      expect(body).toMatchObject({
        split: mode === 'equal' ? split : { mode, values: [...values!].reverse() },
      });
      expect(body.splits.map((s) => s.share_amount)).toEqual([...shares].reverse());
      expect(expenseCreateInput.parse({ ...body, client_request_id: uuidOf(1) })).toMatchObject(
        body
      );
      expect(() => confirmedFields(input, options, { ...preview, splitMode: undefined })).toThrow(
        'STALE_PREVIEW'
      );
      expect(() =>
        confirmedFields(input, options, {
          ...preview,
          splits: preview.splits.map((s) => ({ ...s, originalShareAmount: undefined })),
        })
      ).toThrow('STALE_PREVIEW');
    }
  );
  it('retains legacy raw JSON and omits split when capability is absent', () => {
    expect(expenseDraftSchema.parse(draft)).toEqual(draft);
    const old = { ...options, splitPreviewModes: undefined, splitCreateModes: undefined };
    expect(previewInputOf(draft, old)).not.toHaveProperty('split');
    expect(expenseOptionsSchema.parse(options)).toEqual(options);
    for (const caps of [
      old,
      { ...options, splitCreateModes: undefined },
      { ...options, splitPreviewModes: undefined },
    ]) {
      const input = { ...draft, splitMode: 'shares' as const };
      expect(previewInputOf(input, caps)).toBeNull();
      expect(validateDraft(input, caps)).toContainEqual({ field: 'split', code: 'unsupported' });
      expect(isTwdQueueDraft(input)).toBe(false);
    }
  });
  it('keys mode and values, refuses removed members, and preserves deselected text', () => {
    const input: ExpenseDraft = {
      ...draft,
      splitMode: 'shares',
      splitValues: { shares: { [ids[0]]: '0', [ids[1]]: '2' } },
    };
    expect(splitInputOf(input, ids)).toEqual({ mode: 'shares', values: [0, 2, null] });
    const key = previewKey(previewInputOf(input, options)!);
    for (const patch of [
      { splitMode: 'amount' as const },
      { splitValues: { shares: { [ids[0]]: '1' } } },
      { memberIds: ids.slice(1) },
      { amountText: '100.01' },
      { currency: 'JPY', rateText: '0.215' },
    ])
      expect(previewKey(previewInputOf({ ...input, ...patch }, options)!)).not.toBe(key);
    expect(previewInputOf(input, { ...options, members: options.members.slice(1) })).toBeNull();
    expect(splitInputOf({ ...input, memberIds: ids.slice(1) }, ids.slice(1))).toEqual({
      mode: 'shares',
      values: [2, null],
    });
    expect(input.splitValues?.shares?.[ids[0]]).toBe('0');
    for (const mode of ['amount', 'percent', 'shares'] as const) {
      const zero = {
        ...draft,
        splitMode: mode,
        splitValues: { [mode]: Object.fromEntries(ids.map((id) => [id, '0'])) },
      };
      expect(previewInputOf(zero, options)).toBeNull();
      expect(isTwdQueueDraft(zero)).toBe(false);
    }
  });
  it.each([
    ['TWD', 'JPY', '100', '0.2156789012345', 21.57, [0, 7.19, 14.38], [0, 33.33, 66.67]],
    ['USD', 'JPY', '100', '0.0067', 0.67, [0, 0.22, 0.45], [0, 33.33, 66.67]],
    ['JPY', 'JPY', '100.01', '1', 100.01, [0, 33.34, 66.67], [0, 33.34, 66.67]],
    ['TWD', 'KRW', '0.01', '1e-7', 0, [0, 0, 0], [0, 0, 0.01]],
    ['TWD', 'USD', '0.01', '1e11', 1e9, [0, 0, 1e9], [0, 0, 0.01]],
  ] as const)(
    'preserves %s/%s preview units and precise rate',
    (base, currency, amountText, rateText, total, shares, originals) => {
      const unit = { baseCurrency: base, moneyScale: 2 as const };
      const input: ExpenseDraft = {
        ...draft,
        ledger: unit,
        currency,
        amountText,
        rateText,
        splitMode: 'shares',
        splitValues: { shares: Object.fromEntries(ids.map((id, i) => [id, String(i)])) },
      };
      const fields = confirmedFields(
        input,
        { ...options, ledger: unit },
        {
          ledger: unit,
          amount: total,
          originalAmount: Number(amountText),
          currency,
          exchangeRate: Number(rateText),
          splitMode: 'shares',
          splits: ids.map((id, i) => ({
            userId: id,
            displayName: 'Same',
            shareAmount: shares[i],
            originalShareAmount: originals[i],
          })),
        }
      );
      expect(fields).toMatchObject({
        base_currency: base,
        exchange_rate: Number(rateText),
        split: { mode: 'shares', values: [0, 1, 2] },
      });
    }
  );
});
