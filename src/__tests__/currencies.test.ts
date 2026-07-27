import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@/constants/currencies';

describe('formatCurrency', () => {
  it('uses an unambiguous TWD symbol', () => {
    expect(formatCurrency(1234, 'TWD')).toBe('NT$1,234');
  });

  it('rounds JPY to a whole number', () => {
    expect(formatCurrency(1234.56, 'JPY')).toBe('¥1,235');
  });

  it('adds a space for ISO currencies without a curated symbol', () => {
    expect(formatCurrency(1234, 'KRW')).toBe('KRW 1,234');
  });

  it('respects the selected UI locale for number separators', () => {
    expect(formatCurrency(1234.5, 'EUR', 'de-DE')).toBe('€1.234,5');
  });

  it('places a negative sign before the currency symbol', () => {
    expect(formatCurrency(-500, 'TWD')).toBe('-NT$500');
  });
});
