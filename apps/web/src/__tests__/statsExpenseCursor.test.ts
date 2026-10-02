import { describe, expect, it } from 'vitest';
import { decodeStatsExpenseCursor, encodeStatsExpenseCursor } from '@/lib/statsExpenseCursor';

const id = '507f1f77bcf86cd799439011';

describe('stats expense cursor', () => {
  it('round-trips date and amount cursors', () => {
    const dateCursor = { sort: 'dateDesc' as const, value: '2026-07-12T00:00:00.000Z', id };
    const amountCursor = { sort: 'amountAsc' as const, value: 500, id };

    expect(decodeStatsExpenseCursor(encodeStatsExpenseCursor(dateCursor), 'dateDesc')).toEqual(
      dateCursor
    );
    expect(decodeStatsExpenseCursor(encodeStatsExpenseCursor(amountCursor), 'amountAsc')).toEqual(
      amountCursor
    );
  });

  it('rejects malformed, mismatched, and wrong-value-type cursors', () => {
    const dateCursor = encodeStatsExpenseCursor({
      sort: 'dateDesc',
      value: '2026-07-12T00:00:00.000Z',
      id,
    });
    const wrongType = Buffer.from(
      JSON.stringify({ sort: 'amountDesc', value: '500', id })
    ).toString('base64url');

    expect(decodeStatsExpenseCursor('not-json', 'dateDesc')).toBeNull();
    expect(decodeStatsExpenseCursor(dateCursor, 'dateAsc')).toBeNull();
    expect(decodeStatsExpenseCursor(wrongType, 'amountDesc')).toBeNull();
  });
});
