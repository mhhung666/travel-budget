import { describe, it, expect } from 'vitest';
import {
  toExpenseDto,
  toTripDto,
  toChecklistDto,
  type ExpenseDtoInput,
  type TripDtoInput,
  type ChecklistDtoInput,
} from '@/lib/dto';

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
      attachments: [],
    });
  });

  it('maps attachments by default and omits them when attachments:false (public share)', () => {
    const withReceipts: ExpenseDtoInput = {
      ...base,
      attachments: [{ key: 'receipts/trip9/abc.webp', contentType: 'image/webp', size: 1234 }],
    };
    expect(toExpenseDto(withReceipts, 'trip9').attachments).toEqual([
      { key: 'receipts/trip9/abc.webp', content_type: 'image/webp', size: 1234 },
    ]);
    // 公開分享路由傳 { attachments: false }：收據不外洩到未登入分享頁
    expect(toExpenseDto(withReceipts, 'trip9', { attachments: false }).attachments).toEqual([]);
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
    departureLocation: { lat: 0, lng: 0 },
    destinationLocation: { lat: 1, lng: 2 },
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
      departure_location: { lat: 0, lng: 0 },
      destination_location: { lat: 1, lng: 2 },
      hash_code: 'abc123',
      created_at: '2026-01-01T00:00:00.000Z',
      archived_at: '2026-05-01T00:00:00.000Z',
      budget: null,
    });
  });

  it('treats the trip as never archived when no viewer is given (public share)', () => {
    const dto = toTripDto(base);
    expect(dto.archived_at).toBeNull();
  });

  it('returns null dates/description/locations when absent', () => {
    const dto = toTripDto({
      _id: { toString: () => 'trip2' },
      name: 'Minimal',
      hashCode: 'def456',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(dto.start_date).toBeNull();
    expect(dto.end_date).toBeNull();
    expect(dto.description).toBeNull();
    expect(dto.departure_location).toBeNull();
    expect(dto.destination_location).toBeNull();
    expect(dto.budget).toBeNull();
  });

  it('maps budget (total + categories) when present', () => {
    const dto = toTripDto({
      ...base,
      budget: { total: 30000, categories: [{ category: 'food', amount: 8000 }] },
    });
    expect(dto.budget).toEqual({
      total: 30000,
      categories: [{ category: 'food', amount: 8000 }],
    });
  });
});

describe('toChecklistDto', () => {
  const base: ChecklistDtoInput = {
    _id: { toString: () => 'cl1' },
    trip: { toString: () => 'trip9' },
    title: 'Packing',
    items: [
      {
        _id: { toString: () => 'i1' },
        text: 'Passport',
        done: true,
        assignee: ref('u1', 'alice', 'Alice'),
      },
      { _id: { toString: () => 'i2' }, text: 'Charger', done: false, assignee: null },
    ],
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
  };

  it('maps a checklist with assigned + unassigned items to the snake_case DTO', () => {
    expect(toChecklistDto(base)).toEqual({
      id: 'cl1',
      trip_id: 'trip9',
      title: 'Packing',
      items: [
        { id: 'i1', text: 'Passport', done: true, assignee_id: 'u1', assignee_name: 'Alice' },
        { id: 'i2', text: 'Charger', done: false, assignee_id: null, assignee_name: null },
      ],
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
    });
  });

  it('coerces done to boolean and tolerates a dangling assignee (deleted user → null)', () => {
    const dto = toChecklistDto({
      ...base,
      items: [
        {
          _id: { toString: () => 'i3' },
          text: 'Map',
          done: undefined as unknown as boolean,
          assignee: null,
        },
      ],
    });
    expect(dto.items[0].done).toBe(false);
    expect(dto.items[0].assignee_id).toBeNull();
    expect(dto.items[0].assignee_name).toBeNull();
  });
});
