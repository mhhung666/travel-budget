import { describe, expect, it } from 'vitest';
import { normalizeUnsignedDecimalInput } from '@/lib/decimalInput';

describe('normalizeUnsignedDecimalInput', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['123', '123'],
    ['12.34', '12.34'],
    ['12.', '12.'],
    ['.5', '.5'],
    ['12,34', '12.34'],
  ])('accepts editable decimal input %s', (input, expected) => {
    expect(normalizeUnsignedDecimalInput(input)).toBe(expected);
  });

  it.each(['-1', '+1', '1e3', '1E3', '1.2.3', '1,2,3', 'Infinity', ' 12', '12 '])(
    'rejects unsupported numeric syntax %s',
    (input) => {
      expect(normalizeUnsignedDecimalInput(input)).toBeNull();
    }
  );
});
