import { describe, it, expect } from 'vitest';
import { toExpenseDto, toTripDto, type ExpenseDtoInput, type TripDtoInput } from '@/lib/dto';

const ref = (id: string, username: string, displayName: string) => ({
  _id: { toString: () => id },
  username,
  displayName,
});

describe('toExpenseDto', () => {
  const base: ExpenseDtoInput = {
    _id: { toString: () => 'exp1' },
    amount: 300,
    originalAmount: 1500,
    currency: 'JPY',
    exchangeRate: 0.2,
    description: 'Lunch',
    category: 'food',
    date: new Date('2026-06-17T09:00:00Z'),
    createdAt: new Date('2026-06-17T10:00:00Z'),
    payer: ref('u1', 'alice', 'Alice'),
    splits: [
      { user: ref('u1', 'alice', 'Alice'), shareAmount: 150 },
      { user: ref('u2', 'bob', 'Bob'), shareAmount: 150 },
    ],
  };

  it('maps a lean expense to the snake_case DTO with trip_id', () => {
    expect(toExpenseDto(base, 'trip9')).toEqual({
      id: 'exp1',
      trip_id: 'trip9',
      amount: 300,
      original_amount: 1500,
      currency: 'JPY',
      exchange_rate: 0.2,
      description: 'Lunch',
      category: 'food',
      date: '2026-06-17',
      created_at: '2026-06-17T10:00:00.000Z',
      payer_id: 'u1',
      payer_name: 'Alice',
      splits: [
        { user_id: 'u1', share_amount: 150, username: 'alice', display_name: 'Alice' },
        { user_id: 'u2', share_amount: 150, username: 'bob', display_name: 'Bob' },
      ],
    });
  });

  it('falls back to "other" category and tolerates a missing payer/split user', () => {
    const dto = toExpenseDto(
      { ...base, category: null, payer: null, splits: [{ user: null, shareAmount: 5 }] },
      'trip9'
    );
    expect(dto.category).toBe('other');
    expect(dto.payer_id).toBe('');
    expect(dto.payer_name).toBe('Unknown');
    expect(dto.splits[0]).toEqual({
      user_id: '',
      share_amount: 5,
      username: 'Unknown',
      display_name: 'Unknown',
    });
  });
});

describe('toTripDto', () => {
  const base: TripDtoInput = {
    _id: { toString: () => 'trip1' },
    name: 'Japan',
    description: 'spring',
    startDate: new Date('2026-04-01T00:00:00Z'),
    endDate: new Date('2026-04-10T00:00:00Z'),
    location: { lat: 1, lng: 2 },
    hashCode: 'abc123',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    members: [
      { user: { toString: () => 'u1' }, archivedAt: new Date('2026-05-01T00:00:00Z') },
      { user: { toString: () => 'u2' }, archivedAt: null },
    ],
  };

  it('maps a trip and resolves archived_at from the viewer’s own member entry', () => {
    expect(toTripDto(base, 'u1')).toEqual({
      id: 'trip1',
      name: 'Japan',
      description: 'spring',
      start_date: '2026-04-01',
      end_date: '2026-04-10',
      location: { lat: 1, lng: 2 },
      hash_code: 'abc123',
      created_at: '2026-01-01T00:00:00.000Z',
      archived_at: '2026-05-01T00:00:00.000Z',
    });
  });

  it('treats the trip as never archived when no viewer is given (public share)', () => {
    const dto = toTripDto(base);
    expect(dto.archived_at).toBeNull();
  });

  it('returns null dates/description/location when absent', () => {
    const dto = toTripDto({
      _id: { toString: () => 'trip2' },
      name: 'Minimal',
      hashCode: 'def456',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(dto.start_date).toBeNull();
    expect(dto.end_date).toBeNull();
    expect(dto.description).toBeNull();
    expect(dto.location).toBeNull();
  });
});
