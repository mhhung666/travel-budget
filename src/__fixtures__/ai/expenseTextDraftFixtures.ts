import type { ExpenseTextDraft } from '@/lib/ai/expenseTextDraftSchema';

export type ExpenseTextDraftFixture = {
  id: string;
  tags: string[];
  sourceText: string;
  expected: ExpenseTextDraft;
};

type FixtureInput = Omit<ExpenseTextDraft, 'warnings'> & {
  warnings?: ExpenseTextDraft['warnings'];
};

const fixture = (
  id: string,
  tags: string[],
  sourceText: string,
  expected: FixtureInput
): ExpenseTextDraftFixture => ({
  id,
  tags,
  sourceText,
  expected: { ...expected, warnings: expected.warnings ?? [] },
});

/**
 * Synthetic, non-identifying examples for reproducible provider evaluation.
 * Names are deliberately generic fixture identities rather than real trip members.
 */
export const expenseTextDraftFixtures: ExpenseTextDraftFixture[] = [
  fixture(
    'zh-tw-equal-explicit',
    ['zh-TW', 'TWD', 'equal', 'explicit-date'],
    '2026-09-03 晚餐 1,200 元，小安付，小安和小北平分',
    {
      description: '晚餐',
      originalAmount: 1200,
      currency: 'TWD',
      date: '2026-09-03',
      payerName: '小安',
      category: 'food',
      split: { method: 'equal', participantNames: ['小安', '小北'] },
    }
  ),
  fixture(
    'zh-tw-equal-default',
    ['zh-TW', 'TWD', 'equal', 'default-participants'],
    '9/4 早餐 360 TWD，我先付，大家平分',
    {
      description: '早餐',
      originalAmount: 360,
      currency: 'TWD',
      payerName: '我',
      category: 'food',
      split: { method: 'equal', participantNames: [] },
    }
  ),
  fixture(
    'zh-tw-taxi-jpy',
    ['zh-TW', 'JPY', 'equal', 'exclusion'],
    '2026-09-05 計程車 2400 日圓，小安付款，小南不用出，小安、小北、小東平分',
    {
      description: '計程車',
      originalAmount: 2400,
      currency: 'JPY',
      date: '2026-09-05',
      payerName: '小安',
      category: 'transportation',
      split: { method: 'equal', participantNames: ['小安', '小北', '小東'] },
    }
  ),
  fixture(
    'zh-tw-amount',
    ['zh-TW', 'TWD', 'amount', 'explicit-date'],
    '2026-09-06 門票共 900 TWD，小北付；小安 300、小北 600',
    {
      description: '門票',
      originalAmount: 900,
      currency: 'TWD',
      date: '2026-09-06',
      payerName: '小北',
      category: 'tickets',
      split: {
        method: 'amount',
        shares: [
          { memberName: '小安', amount: 300 },
          { memberName: '小北', amount: 600 },
        ],
      },
    }
  ),
  fixture(
    'zh-tw-percentage',
    ['zh-TW', 'USD', 'percentage'],
    '租車 200 USD，小東刷卡，小東負擔 60%，小南 40%',
    {
      description: '租車',
      originalAmount: 200,
      currency: 'USD',
      payerName: '小東',
      category: 'transportation',
      split: {
        method: 'percentage',
        shares: [
          { memberName: '小東', percentage: 60 },
          { memberName: '小南', percentage: 40 },
        ],
      },
    }
  ),
  fixture(
    'zh-tw-ratio',
    ['zh-TW', 'EUR', 'ratio'],
    '2026-09-08 公寓 480 EUR 小南先付，小安、小北、小南按 1:1:2 分',
    {
      description: '公寓',
      originalAmount: 480,
      currency: 'EUR',
      date: '2026-09-08',
      payerName: '小南',
      category: 'accommodation',
      split: {
        method: 'ratio',
        shares: [
          { memberName: '小安', units: 1 },
          { memberName: '小北', units: 1 },
          { memberName: '小南', units: 2 },
        ],
      },
    }
  ),
  fixture(
    'zh-cn-cny',
    ['zh-CN', 'CNY', 'equal'],
    '2026-10-02 午餐 288 CNY，小东付款，小东和小南均摊',
    {
      description: '午餐',
      originalAmount: 288,
      currency: 'CNY',
      date: '2026-10-02',
      payerName: '小东',
      category: 'food',
      split: { method: 'equal', participantNames: ['小东', '小南'] },
    }
  ),
  fixture(
    'zh-cn-amount',
    ['zh-CN', 'CNY', 'amount'],
    '打车 150 人民币，小北付，小北出 50、小南出 100',
    {
      description: '打车',
      originalAmount: 150,
      currency: 'CNY',
      payerName: '小北',
      category: 'transportation',
      split: {
        method: 'amount',
        shares: [
          { memberName: '小北', amount: 50 },
          { memberName: '小南', amount: 100 },
        ],
      },
    }
  ),
  fixture(
    'en-usd-equal',
    ['en', 'USD', 'equal', 'explicit-date'],
    'Dinner on 2026-11-12 was USD 84, Alex paid, split equally between Alex and Blair.',
    {
      description: 'Dinner',
      originalAmount: 84,
      currency: 'USD',
      date: '2026-11-12',
      payerName: 'Alex',
      category: 'food',
      split: { method: 'equal', participantNames: ['Alex', 'Blair'] },
    }
  ),
  fixture(
    'en-gbp-amount',
    ['en', 'GBP', 'amount'],
    'Museum tickets GBP 75 paid by Casey. Alex owes 25 and Casey owes 50.',
    {
      description: 'Museum tickets',
      originalAmount: 75,
      currency: 'GBP',
      payerName: 'Casey',
      category: 'tickets',
      split: {
        method: 'amount',
        shares: [
          { memberName: 'Alex', amount: 25 },
          { memberName: 'Casey', amount: 50 },
        ],
      },
    }
  ),
  fixture(
    'en-eur-percentage',
    ['en', 'EUR', 'percentage'],
    'Hotel EUR 500 paid by Blair; Alex pays 30% and Blair pays 70%.',
    {
      description: 'Hotel',
      originalAmount: 500,
      currency: 'EUR',
      payerName: 'Blair',
      category: 'accommodation',
      split: {
        method: 'percentage',
        shares: [
          { memberName: 'Alex', percentage: 30 },
          { memberName: 'Blair', percentage: 70 },
        ],
      },
    }
  ),
  fixture(
    'en-cad-ratio',
    ['en', 'CAD', 'ratio'],
    'Rental car CAD 360, Casey paid. Split Alex:Blair:Casey in a 1:2:3 ratio.',
    {
      description: 'Rental car',
      originalAmount: 360,
      currency: 'CAD',
      payerName: 'Casey',
      category: 'transportation',
      split: {
        method: 'ratio',
        shares: [
          { memberName: 'Alex', units: 1 },
          { memberName: 'Blair', units: 2 },
          { memberName: 'Casey', units: 3 },
        ],
      },
    }
  ),
  fixture(
    'ja-jpy-equal',
    ['ja', 'JPY', 'equal'],
    '2026-12-01の夕食は12,000円、アキが支払い、アキとハルで均等に分ける。',
    {
      description: '夕食',
      originalAmount: 12000,
      currency: 'JPY',
      date: '2026-12-01',
      payerName: 'アキ',
      category: 'food',
      split: { method: 'equal', participantNames: ['アキ', 'ハル'] },
    }
  ),
  fixture(
    'ja-jpy-amount',
    ['ja', 'JPY', 'amount'],
    '新幹線代18,000 JPYはハルが払った。アキ6,000、ハル12,000。',
    {
      description: '新幹線代',
      originalAmount: 18000,
      currency: 'JPY',
      payerName: 'ハル',
      category: 'transportation',
      split: {
        method: 'amount',
        shares: [
          { memberName: 'アキ', amount: 6000 },
          { memberName: 'ハル', amount: 12000 },
        ],
      },
    }
  ),
  fixture(
    'ja-usd-percentage',
    ['ja', 'USD', 'percentage'],
    'ホテル代300 USD、アキが支払い。アキ40%、ナオ60%。',
    {
      description: 'ホテル代',
      originalAmount: 300,
      currency: 'USD',
      payerName: 'アキ',
      category: 'accommodation',
      split: {
        method: 'percentage',
        shares: [
          { memberName: 'アキ', percentage: 40 },
          { memberName: 'ナオ', percentage: 60 },
        ],
      },
    }
  ),
  fixture(
    'mixed-language',
    ['mixed-language', 'THB', 'equal'],
    '2027-01-03 Bangkok massage 1,500 THB，小安 paid，小安、小北 equal split',
    {
      description: 'Bangkok massage',
      originalAmount: 1500,
      currency: 'THB',
      date: '2027-01-03',
      payerName: '小安',
      category: 'entertainment',
      split: { method: 'equal', participantNames: ['小安', '小北'] },
    }
  ),
  fixture(
    'hkd-shopping',
    ['zh-TW', 'HKD', 'equal'],
    '2027-01-04 紀念品 680 港幣，小北付，小北和小東平分',
    {
      description: '紀念品',
      originalAmount: 680,
      currency: 'HKD',
      date: '2027-01-04',
      payerName: '小北',
      category: 'shopping',
      split: { method: 'equal', participantNames: ['小北', '小東'] },
    }
  ),
  fixture('krw-food', ['zh-TW', 'KRW', 'equal'], '韓式烤肉 96000 KRW，小東先付，四個人均分', {
    description: '韓式烤肉',
    originalAmount: 96000,
    currency: 'KRW',
    payerName: '小東',
    category: 'food',
    split: { method: 'equal', participantNames: [] },
  }),
  fixture(
    'aud-activity',
    ['en', 'AUD', 'equal'],
    'Surf lesson AUD 240 paid by Alex, shared equally by Alex, Blair and Casey.',
    {
      description: 'Surf lesson',
      originalAmount: 240,
      currency: 'AUD',
      payerName: 'Alex',
      category: 'entertainment',
      split: { method: 'equal', participantNames: ['Alex', 'Blair', 'Casey'] },
    }
  ),
  fixture(
    'sgd-food',
    ['en', 'SGD', 'amount'],
    'Hawker dinner SGD 48, Blair paid; Alex 12, Blair 12, Casey 24.',
    {
      description: 'Hawker dinner',
      originalAmount: 48,
      currency: 'SGD',
      payerName: 'Blair',
      category: 'food',
      split: {
        method: 'amount',
        shares: [
          { memberName: 'Alex', amount: 12 },
          { memberName: 'Blair', amount: 12 },
          { memberName: 'Casey', amount: 24 },
        ],
      },
    }
  ),
  fixture(
    'missing-payer',
    ['zh-TW', 'TWD', 'missing-payer', 'equal'],
    '2027-02-01 午餐 800 TWD，小安和小北平分',
    {
      description: '午餐',
      originalAmount: 800,
      currency: 'TWD',
      date: '2027-02-01',
      category: 'food',
      split: { method: 'equal', participantNames: ['小安', '小北'] },
    }
  ),
  fixture(
    'missing-participants',
    ['en', 'USD', 'default-participants'],
    'Coffee USD 18 paid by Casey.',
    {
      description: 'Coffee',
      originalAmount: 18,
      currency: 'USD',
      payerName: 'Casey',
      category: 'food',
      split: { method: 'equal', participantNames: [] },
    }
  ),
  fixture(
    'ambiguous-dollar',
    ['en', 'ambiguous-currency', 'safety-warning'],
    'Lunch was $60, Alex paid, split with Blair.',
    {
      description: 'Lunch',
      originalAmount: 60,
      payerName: 'Alex',
      category: 'food',
      split: { method: 'equal', participantNames: ['Alex', 'Blair'] },
      warnings: [{ code: 'AMBIGUOUS_CURRENCY' }],
    }
  ),
  fixture(
    'missing-currency',
    ['zh-TW', 'missing-currency', 'safety-warning'],
    '2027-02-04 晚餐 1200，小南付款，小安和小南平分',
    {
      description: '晚餐',
      originalAmount: 1200,
      date: '2027-02-04',
      payerName: '小南',
      category: 'food',
      split: { method: 'equal', participantNames: ['小安', '小南'] },
      warnings: [{ code: 'MISSING_CURRENCY' }],
    }
  ),
  fixture(
    'unbalanced-amount',
    ['zh-TW', 'TWD', 'amount', 'safety-warning'],
    '車票 1000 TWD，小安付，小安 300、小北 600',
    {
      description: '車票',
      originalAmount: 1000,
      currency: 'TWD',
      payerName: '小安',
      category: 'transportation',
      split: {
        method: 'amount',
        shares: [
          { memberName: '小安', amount: 300 },
          { memberName: '小北', amount: 600 },
        ],
      },
      warnings: [{ code: 'SPLIT_TOTAL_MISMATCH' }],
    }
  ),
  fixture(
    'unbalanced-percentage',
    ['en', 'EUR', 'percentage', 'safety-warning'],
    'Apartment EUR 400 paid by Blair; Alex 30%, Blair 50%.',
    {
      description: 'Apartment',
      originalAmount: 400,
      currency: 'EUR',
      payerName: 'Blair',
      category: 'accommodation',
      split: {
        method: 'percentage',
        shares: [
          { memberName: 'Alex', percentage: 30 },
          { memberName: 'Blair', percentage: 50 },
        ],
      },
      warnings: [{ code: 'SPLIT_TOTAL_MISMATCH' }],
    }
  ),
  fixture(
    'duplicate-participant',
    ['en', 'USD', 'duplicate-participant', 'safety-warning'],
    'Taxi USD 90, Casey paid; split equally between Alex, Alex and Casey.',
    {
      description: 'Taxi',
      originalAmount: 90,
      currency: 'USD',
      payerName: 'Casey',
      category: 'transportation',
      split: { method: 'equal', participantNames: ['Alex', 'Alex', 'Casey'] },
      warnings: [{ code: 'DUPLICATE_PARTICIPANT' }],
    }
  ),
  fixture(
    'unknown-member',
    ['zh-TW', 'JPY', 'unknown-member', 'safety-warning'],
    '午餐 5000 JPY，小安付，小安和同行的新朋友平分',
    {
      description: '午餐',
      originalAmount: 5000,
      currency: 'JPY',
      payerName: '小安',
      category: 'food',
      split: { method: 'equal', participantNames: ['小安', '同行的新朋友'] },
      warnings: [{ code: 'PARTICIPANT_UNCERTAIN' }],
    }
  ),
  fixture(
    'same-name-members',
    ['zh-TW', 'TWD', 'ambiguous-member', 'safety-warning'],
    '晚餐 1500 TWD，阿明付款，兩位阿明平分',
    {
      description: '晚餐',
      originalAmount: 1500,
      currency: 'TWD',
      payerName: '阿明',
      category: 'food',
      split: { method: 'equal', participantNames: ['阿明'] },
      warnings: [{ code: 'PARTICIPANT_AMBIGUOUS' }],
    }
  ),
  fixture(
    'tags-and-date',
    ['zh-TW', 'TWD', 'tags', 'itinerary-date'],
    '2027-03-08 夜市晚餐 720 TWD，小北付，和小東均分，標記美食、夜市，放到 2027-03-08 行程',
    {
      description: '夜市晚餐',
      originalAmount: 720,
      currency: 'TWD',
      date: '2027-03-08',
      payerName: '小北',
      category: 'food',
      tags: ['美食', '夜市'],
      itineraryDate: '2027-03-08',
      split: { method: 'equal', participantNames: ['小北', '小東'] },
    }
  ),
  fixture(
    'decimal-usd',
    ['en', 'USD', 'decimal', 'amount'],
    'Snacks USD 19.95 paid by Alex; Alex 9.95 and Blair 10.',
    {
      description: 'Snacks',
      originalAmount: 19.95,
      currency: 'USD',
      payerName: 'Alex',
      category: 'food',
      split: {
        method: 'amount',
        shares: [
          { memberName: 'Alex', amount: 9.95 },
          { memberName: 'Blair', amount: 10 },
        ],
      },
    }
  ),
  fixture(
    'ratio-words',
    ['en', 'NZD', 'ratio'],
    'Cabin NZD 600 paid by Casey. Alex gets one share, Blair two shares, Casey three shares.',
    {
      description: 'Cabin',
      originalAmount: 600,
      currency: 'NZD',
      payerName: 'Casey',
      category: 'accommodation',
      split: {
        method: 'ratio',
        shares: [
          { memberName: 'Alex', units: 1 },
          { memberName: 'Blair', units: 2 },
          { memberName: 'Casey', units: 3 },
        ],
      },
    }
  ),
];
