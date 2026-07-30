import { describe, it, expect } from 'vitest';
import {
  toExpenseDto,
  toTripDto,
  toChecklistDto,
  toActivityLogDto,
  toTripNoteDto,
  type ExpenseDtoInput,
  type TripDtoInput,
  type ChecklistDtoInput,
  type ActivityLogDtoInput,
  type TripNoteDtoInput,
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
      itinerary_day_ids: [],
      tags: [],
    });
  });

  it('defaults tags to [] when absent and passes them through when present', () => {
    expect(toExpenseDto(base, 'trip9').tags).toEqual([]);
    const tagged: ExpenseDtoInput = { ...base, tags: ['visa', 'insurance'] };
    expect(toExpenseDto(tagged, 'trip9').tags).toEqual(['visa', 'insurance']);
  });

  it('maps linked itinerary days to itinerary_day_ids', () => {
    const linked: ExpenseDtoInput = {
      ...base,
      itineraryDays: [{ toString: () => 'day5' }, { toString: () => 'day6' }],
    };
    expect(toExpenseDto(linked, 'trip9').itinerary_day_ids).toEqual(['day5', 'day6']);
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
      destination_location: { lat: 1, lng: 2 },
      hash_code: 'abc123',
      created_at: '2026-01-01T00:00:00.000Z',
      archived_at: '2026-05-01T00:00:00.000Z',
      budget: null,
      legacy_budget: null,
      currency_settings: null,
    });
  });

  it('treats the trip as never archived when no viewer is given (public share)', () => {
    const dto = toTripDto(base);
    expect(dto.archived_at).toBeNull();
  });

  it('returns null dates/description/destination when absent', () => {
    const dto = toTripDto({
      _id: { toString: () => 'trip2' },
      name: 'Minimal',
      hashCode: 'def456',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(dto.start_date).toBeNull();
    expect(dto.end_date).toBeNull();
    expect(dto.description).toBeNull();
    expect(dto.destination_location).toBeNull();
    expect(dto.budget).toBeNull();
    expect(dto.legacy_budget).toBeNull();
    expect(dto.currency_settings).toBeNull();
  });

  it('maps only the viewer’s member budget and includes legacy group budget for reference', () => {
    const dto = toTripDto(
      {
        ...base,
        members: [
          {
            user: { toString: () => 'u1' },
            budget: { total: 30000, categories: [{ category: 'food', amount: 8000 }] },
          },
          {
            user: { toString: () => 'u2' },
            budget: { total: 99999, categories: [] },
          },
        ],
        legacyBudget: { total: 60000, categories: [] },
      },
      'u1'
    );
    expect(dto.budget).toEqual({
      total: 30000,
      categories: [{ category: 'food', amount: 8000 }],
    });
    expect(dto.legacy_budget).toEqual({ total: 60000, categories: [] });
  });

  it('never exposes member or legacy budgets without a viewer', () => {
    const dto = toTripDto({
      ...base,
      members: [
        {
          user: { toString: () => 'u1' },
          budget: { total: 30000, categories: [] },
        },
      ],
      legacyBudget: { total: 60000, categories: [] },
    });
    expect(dto.budget).toBeNull();
    expect(dto.legacy_budget).toBeNull();
  });

  it('maps currency settings (default currency + currencies with optional pinned rate)', () => {
    const dto = toTripDto({
      ...base,
      currencySettings: {
        defaultCurrency: 'JPY',
        currencies: [
          { code: 'JPY', rate: 0.22 },
          { code: 'USD', rate: null },
        ],
      },
    });
    expect(dto.currency_settings).toEqual({
      default_currency: 'JPY',
      currencies: [
        { code: 'JPY', rate: 0.22 },
        { code: 'USD', rate: null },
      ],
    });
  });
});

describe('toChecklistDto', () => {
  const base: ChecklistDtoInput = {
    _id: { toString: () => 'cl1' },
    trip: { toString: () => 'trip9' },
    kind: 'todo',
    title: 'Packing',
    items: [
      {
        _id: { toString: () => 'i1' },
        text: 'Passport',
        doneBy: [{ toString: () => 'u1' }],
        assignee: ref('u1', 'alice', 'Alice'),
      },
      { _id: { toString: () => 'i2' }, text: 'Charger', doneBy: [], assignee: null },
    ],
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
  };

  it('maps a checklist with assigned + unassigned items to the snake_case DTO', () => {
    expect(toChecklistDto(base)).toEqual({
      id: 'cl1',
      trip_id: 'trip9',
      kind: 'todo',
      title: 'Packing',
      items: [
        {
          id: 'i1',
          text: 'Passport',
          done: true,
          done_by: ['u1'],
          assignee_id: 'u1',
          assignee_name: 'Alice',
        },
        {
          id: 'i2',
          text: 'Charger',
          done: false,
          done_by: [],
          assignee_id: null,
          assignee_name: null,
        },
      ],
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
    });
  });

  it('defaults kind to todo, derives done from doneBy, tolerates a dangling assignee', () => {
    const dto = toChecklistDto({
      ...base,
      kind: undefined,
      items: [
        {
          _id: { toString: () => 'i3' },
          text: 'Map',
          doneBy: undefined,
          assignee: null,
        },
      ],
    });
    expect(dto.kind).toBe('todo');
    expect(dto.items[0].done).toBe(false);
    expect(dto.items[0].done_by).toEqual([]);
    expect(dto.items[0].assignee_id).toBeNull();
    expect(dto.items[0].assignee_name).toBeNull();
  });

  it('reflects per-member doneBy for a packing list (done = doneBy non-empty)', () => {
    const dto = toChecklistDto({
      ...base,
      kind: 'packing',
      items: [
        {
          _id: { toString: () => 'i4' },
          text: 'Toothbrush',
          doneBy: [{ toString: () => 'u1' }, { toString: () => 'u2' }],
          assignee: null,
        },
      ],
    });
    expect(dto.kind).toBe('packing');
    expect(dto.items[0].done).toBe(true);
    expect(dto.items[0].done_by).toEqual(['u1', 'u2']);
  });
});

describe('toTripNoteDto', () => {
  const base: TripNoteDtoInput = {
    _id: { toString: () => 'n1' },
    trip: { toString: () => 'trip9' },
    text: '想去藍瓶咖啡',
    createdBy: { toString: () => 'u1' },
    authorName: 'Alice',
    pinned: true,
    plannedAt: null,
    plannedDayNumber: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
  };

  it('maps an unplanned note to the snake_case DTO (planned fields null)', () => {
    expect(toTripNoteDto(base)).toEqual({
      id: 'n1',
      trip_id: 'trip9',
      text: '想去藍瓶咖啡',
      author_id: 'u1',
      author_name: 'Alice',
      attachments: [],
      pinned: true,
      planned_at: null,
      planned_day_number: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
    });
  });

  it('maps embedded attachments to key + metadata (no URL)', () => {
    const dto = toTripNoteDto({
      ...base,
      attachments: [{ key: 'notes/trip9/abc.webp', contentType: 'image/webp', size: 2048 }],
    });
    expect(dto.attachments).toEqual([
      { key: 'notes/trip9/abc.webp', content_type: 'image/webp', size: 2048 },
    ]);
  });

  it('serializes plannedAt to ISO and keeps the day snapshot', () => {
    const dto = toTripNoteDto({
      ...base,
      plannedAt: new Date('2026-06-03T12:00:00Z'),
      plannedDayNumber: 3,
    });
    expect(dto.planned_at).toBe('2026-06-03T12:00:00.000Z');
    expect(dto.planned_day_number).toBe(3);
  });

  it('defaults missing optional fields (legacy docs) to safe values', () => {
    const dto = toTripNoteDto({
      ...base,
      authorName: undefined,
      pinned: undefined,
      plannedAt: undefined,
      plannedDayNumber: undefined,
    });
    expect(dto.author_name).toBe('');
    expect(dto.pinned).toBe(false);
    expect(dto.planned_at).toBeNull();
    expect(dto.planned_day_number).toBeNull();
  });
});

describe('toActivityLogDto', () => {
  it('maps a lean activity doc to the frontend DTO (denormalized actor, untouched meta)', () => {
    const input: ActivityLogDtoInput = {
      _id: { toString: () => 'a1' },
      type: 'expense_added',
      actorName: 'Alice',
      meta: { description: 'Dinner', amount: 300, expense_id: 'e1' },
      createdAt: new Date('2026-06-28T10:00:00Z'),
    };
    expect(toActivityLogDto(input)).toEqual({
      id: 'a1',
      type: 'expense_added',
      actor_name: 'Alice',
      meta: { description: 'Dinner', amount: 300, expense_id: 'e1' },
      created_at: '2026-06-28T10:00:00.000Z',
    });
  });

  it('defaults a missing actorName/meta (e.g. removed member) to empty values', () => {
    const dto = toActivityLogDto({
      _id: { toString: () => 'a2' },
      type: 'member_joined',
      actorName: null,
      meta: null,
      createdAt: new Date('2026-06-28T11:00:00Z'),
    });
    expect(dto.actor_name).toBe('');
    expect(dto.meta).toEqual({});
  });
});
