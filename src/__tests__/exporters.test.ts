import { describe, it, expect } from 'vitest';
import { escapeCsvField, toCsv } from '@/lib/exporters/csv';
import { exportItinerary, type ItineraryLabels } from '@/lib/exporters/itinerary';
import { exportExpenses, type ExpenseLabels } from '@/lib/exporters/expenses';
import {
  exportSettlement,
  type SettlementLabels,
  type SettlementExportData,
} from '@/lib/exporters/settlement';
import type { ItineraryDay, Expense } from '@/types';

const BOM = '﻿';

describe('csv helper', () => {
  it('leaves plain fields untouched', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField(42)).toBe('42');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('quotes and escapes fields with comma, quote, or newline', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('joins rows with CRLF and prepends a BOM', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]]);
    expect(csv).toBe(`${BOM}a,b\r\n1,2`);
  });
});

const itineraryLabels: ItineraryLabels = {
  heading: 'Itinerary',
  day: (n) => `Day ${n}`,
  columns: { day: 'Day', title: 'Title', content: 'Content' },
};

const days: ItineraryDay[] = [
  {
    id: '1',
    trip_id: 't',
    day_number: 1,
    title: 'Osaka',
    content: 'Arrive\nCheck in',
    location: null,
    activities: [],
    created_at: '',
    updated_at: '',
  },
  {
    id: '2',
    trip_id: 't',
    day_number: 2,
    title: 'Kyoto',
    content: '',
    location: null,
    activities: [],
    created_at: '',
    updated_at: '',
  },
];

describe('exportItinerary', () => {
  it('renders markdown with day headings and content', () => {
    const { content, extension } = exportItinerary(days, 'markdown', itineraryLabels);
    expect(extension).toBe('md');
    expect(content).toContain('# Itinerary');
    expect(content).toContain('## Day 1 — Osaka');
    expect(content).toContain('Arrive\nCheck in');
    expect(content).toContain('## Day 2 — Kyoto');
  });

  it('renders csv with a header row', () => {
    const { content, extension } = exportItinerary(days, 'csv', itineraryLabels);
    expect(extension).toBe('csv');
    expect(content.startsWith(BOM)).toBe(true);
    expect(content).toContain('Day,Title,Content');
    // multiline content must be quoted
    expect(content).toContain('"Arrive\nCheck in"');
  });

  it('renders json round-trippable to the original data', () => {
    const { content } = exportItinerary(days, 'json', itineraryLabels);
    expect(JSON.parse(content)).toEqual(days);
  });

  it('renders activities as markdown list items, ordered by time', () => {
    const withActivities: ItineraryDay[] = [
      {
        ...days[0],
        activities: [
          {
            id: 'a2',
            time: '12:30',
            end_time: null,
            title: 'Lunch',
            type: 'food',
            location: null,
            note: '',
            confirmation_code: '',
            attachments: [],
          },
          {
            id: 'a1',
            time: '09:00',
            end_time: null,
            title: 'Castle',
            type: 'sightseeing',
            location: null,
            note: '',
            confirmation_code: '',
            attachments: [],
          },
        ],
      },
    ];
    const { content } = exportItinerary(withActivities, 'markdown', {
      ...itineraryLabels,
      activityTypes: { food: 'Food', sightseeing: 'Sightseeing' },
    });
    expect(content).toContain('- 09:00 · **Castle** · (Sightseeing)');
    expect(content).toContain('- 12:30 · **Lunch** · (Food)');
    // 09:00 activity must come before 12:30
    expect(content.indexOf('Castle')).toBeLessThan(content.indexOf('Lunch'));
  });
});

const expenseLabels: ExpenseLabels = {
  heading: 'Expenses',
  total: 'Total',
  columns: {
    date: 'Date',
    description: 'Description',
    category: 'Category',
    payer: 'Payer',
    amountTwd: 'Amount',
    originalAmount: 'Original',
    currency: 'Currency',
    rate: 'Rate',
    splits: 'Splits',
  },
  category: (key) => key.toUpperCase(),
};

const expenses: Expense[] = [
  {
    id: 'e1',
    trip_id: 't',
    payer_id: 'u1',
    payer_name: 'Alice',
    amount: 300,
    original_amount: 1500,
    currency: 'JPY',
    exchange_rate: 0.2,
    description: 'Lunch, with tax',
    category: 'food',
    date: '2026-06-01T08:00:00.000Z',
    created_at: '',
    splits: [
      { user_id: 'u1', username: 'alice', display_name: 'Alice', share_amount: 150 },
      { user_id: 'u2', username: 'bob', display_name: 'Bob', share_amount: 150 },
    ],
    attachments: [],
    itinerary_day_id: null,
  },
];

describe('exportExpenses', () => {
  it('renders a markdown table with a total and escaped pipes', () => {
    const withPipe: Expense[] = [{ ...expenses[0], description: 'a | b' }];
    const { content } = exportExpenses(withPipe, 'markdown', expenseLabels);
    expect(content).toContain('| Date | Description |');
    expect(content).toContain('a \\| b');
    expect(content).toContain('**Total: 300**');
  });

  it('renders csv with localized category and quoted comma field', () => {
    const { content } = exportExpenses(expenses, 'csv', expenseLabels);
    expect(content).toContain('FOOD');
    expect(content).toContain('"Lunch, with tax"');
    expect(content).toContain('2026-06-01');
    expect(content).toContain('Alice: 150; Bob: 150');
  });

  it('renders json round-trippable to the original data', () => {
    const { content } = exportExpenses(expenses, 'json', expenseLabels);
    expect(JSON.parse(content)).toEqual(expenses);
  });
});

const settlementLabels: SettlementLabels = {
  heading: 'Settlement',
  totalExpenses: 'Total',
  balancesHeading: 'Balances',
  transfersHeading: 'Transfers',
  noTransfers: 'All settled',
  columns: { member: 'Member', paid: 'Paid', owed: 'Owed', balance: 'Balance' },
};

const settlement: SettlementExportData = {
  balances: [
    { userId: 'u1', username: 'Alice', totalPaid: 300, totalOwed: 150, balance: 150 },
    { userId: 'u2', username: 'Bob', totalPaid: 0, totalOwed: 150, balance: -150 },
  ],
  transactions: [{ from: 'Bob', to: 'Alice', amount: 150 }],
  totalExpenses: 300,
};

describe('exportSettlement', () => {
  it('renders markdown with balances and transfers', () => {
    const { content } = exportSettlement(settlement, 'markdown', settlementLabels);
    expect(content).toContain('**Total: 300**');
    expect(content).toContain('| Alice | 300 | 150 | 150 |');
    expect(content).toContain('- Bob → Alice: 150');
  });

  it('shows the no-transfers message when settled', () => {
    const { content } = exportSettlement(
      { ...settlement, transactions: [] },
      'markdown',
      settlementLabels
    );
    expect(content).toContain('All settled');
  });

  it('renders csv of balances', () => {
    const { content } = exportSettlement(settlement, 'csv', settlementLabels);
    expect(content).toContain('Member,Paid,Owed,Balance');
    expect(content).toContain('Bob,0,150,-150');
  });

  it('renders json round-trippable to the original data', () => {
    const { content } = exportSettlement(settlement, 'json', settlementLabels);
    expect(JSON.parse(content)).toEqual(settlement);
  });
});
