import { describe, expect, it } from 'vitest';
import { messages } from './messages';

describe('message catalogs', () => {
  const locales = Object.keys(messages) as (keyof typeof messages)[];
  it('covers the four supported locales', () => {
    expect(locales.sort()).toEqual(['en', 'jp', 'zh', 'zh-CN']);
  });
  it.each(locales)('%s defines every key as non-empty text', (locale) => {
    expect(Object.keys(messages[locale]).sort()).toEqual(Object.keys(messages.zh).sort());
    for (const [key, value] of Object.entries(messages[locale])) {
      expect(value.trim(), `${locale}.${key}`).not.toBe('');
      expect(value, `${locale}.${key} leaks a placeholder`).not.toMatch(/\{\w*\}|TODO|undefined/);
    }
  });
  it('uses distinct wording per language for the new screens', () => {
    for (const key of [
      'expenses',
      'settlement',
      'paidBy',
      'unpaid',
      'addExpense',
      'previewSplit',
      'confirmSave',
      'pendingTitle',
      'checkResult',
      'retrySame',
    ] as const) {
      expect(messages.en[key]).not.toBe(messages.zh[key]);
      expect(messages.jp[key]).not.toBe(messages.en[key]);
    }
  });
});
