import type {
  ItineraryImportActivity,
  ItineraryImportDay,
  ItineraryImportDraft,
  ItineraryImportWarning,
} from '@/lib/ai/itineraryImportSchema';

export type ItineraryImportFixture = {
  id: string;
  tags: string[];
  trip: { startDate?: string; endDate?: string };
  sourceText: string;
  expected: ItineraryImportDraft;
};

const activity = (
  title: string,
  type: ItineraryImportActivity['type'],
  extra: Omit<ItineraryImportActivity, 'title' | 'type'> = {}
): ItineraryImportActivity => ({ title, type, ...extra });

const fixture = (
  id: string,
  tags: string[],
  sourceText: string,
  trip: ItineraryImportFixture['trip'],
  days: ItineraryImportDay[],
  warnings: ItineraryImportWarning[] = []
): ItineraryImportFixture => ({
  id,
  tags,
  sourceText,
  trip,
  expected: { sourceSummary: `匿名測試樣本 ${id}`, days, warnings },
});

export const itineraryImportFixtures: ItineraryImportFixture[] = [
  fixture(
    'markdown-table-dates',
    ['markdown-table', 'full-date'],
    `| 日期 | 時間 | 行程 |\n|---|---|---|\n| 2026-09-01 | 09:00 | 抵達東京站 |\n| 2026-09-01 | 12:30 | 午餐 |`,
    { startDate: '2026-09-01', endDate: '2026-09-03' },
    [
      {
        date: '2026-09-01',
        activities: [
          activity('抵達東京站', 'ground_transport', { time: '09:00', locationName: '東京站' }),
          activity('午餐', 'food', { time: '12:30' }),
        ],
      },
    ]
  ),
  fixture(
    'day-headings',
    ['markdown-heading', 'day-number'],
    `## Day 1\n- 10:00 大阪城\n- 18:00 道頓堀晚餐\n## Day 2\n- 京都散步`,
    { startDate: '2026-10-05', endDate: '2026-10-08' },
    [
      {
        relativeDay: 1,
        activities: [
          activity('大阪城', 'sightseeing', { time: '10:00' }),
          activity('道頓堀晚餐', 'food', { time: '18:00' }),
        ],
      },
      { relativeDay: 2, activities: [activity('京都散步', 'sightseeing')] },
    ]
  ),
  fixture(
    'plain-paragraph',
    ['paragraph', 'missing-time'],
    `9 月 12 日安排故宮博物院，接著到永康街吃晚餐。當天不需要排固定時間。`,
    { startDate: '2026-09-12', endDate: '2026-09-12' },
    [
      {
        date: '2026-09-12',
        activities: [
          activity('故宮博物院', 'sightseeing'),
          activity('永康街晚餐', 'food', { locationName: '永康街' }),
        ],
      },
    ]
  ),
  fixture(
    'cross-year',
    ['full-date', 'cross-year'],
    `2026-12-31 20:00 跨年晚餐\n2027-01-01 00:00 港邊看煙火`,
    { startDate: '2026-12-31', endDate: '2027-01-02' },
    [
      { date: '2026-12-31', activities: [activity('跨年晚餐', 'food', { time: '20:00' })] },
      {
        date: '2027-01-01',
        activities: [activity('港邊看煙火', 'activity', { time: '00:00', locationName: '港邊' })],
      },
    ]
  ),
  fixture(
    'flight-arrival',
    ['flight', 'time-range'],
    `Day 1：07:10–11:35 搭機前往札幌，抵達後領取行李。`,
    { startDate: '2026-11-02', endDate: '2026-11-05' },
    [
      {
        relativeDay: 1,
        activities: [
          activity('搭機前往札幌', 'flight', {
            time: '07:10',
            endTime: '11:35',
            locationName: '札幌',
            note: '抵達後領取行李',
          }),
        ],
      },
    ]
  ),
  fixture(
    'hotel-check-in',
    ['accommodation', 'bullet-list'],
    `2026-10-20\n• 15:00 飯店辦理入住\n• 16:30 附近散步`,
    { startDate: '2026-10-20', endDate: '2026-10-22' },
    [
      {
        date: '2026-10-20',
        activities: [
          activity('飯店辦理入住', 'accommodation', { time: '15:00' }),
          activity('附近散步', 'sightseeing', { time: '16:30' }),
        ],
      },
    ]
  ),
  fixture(
    'rail-transfer',
    ['ground-transport', 'numbered-list'],
    `第 2 天\n1. 08:20 搭新幹線到名古屋\n2. 10:15 轉乘地鐵到榮站`,
    { startDate: '2026-08-11', endDate: '2026-08-14' },
    [
      {
        relativeDay: 2,
        activities: [
          activity('搭新幹線到名古屋', 'ground_transport', { time: '08:20' }),
          activity('轉乘地鐵到榮站', 'ground_transport', { time: '10:15' }),
        ],
      },
    ]
  ),
  fixture(
    'food-and-shopping',
    ['mixed-types', 'full-date'],
    `2026-09-18：11:30 市場吃海鮮，14:00 百貨公司採買伴手禮。`,
    { startDate: '2026-09-18', endDate: '2026-09-20' },
    [
      {
        date: '2026-09-18',
        activities: [
          activity('市場吃海鮮', 'food', { time: '11:30' }),
          activity('百貨公司採買伴手禮', 'shopping', { time: '14:00' }),
        ],
      },
    ]
  ),
  fixture(
    'month-day',
    ['month-day', 'inferred-year'],
    `8/10 09:30 集合，10:00 參觀美術館。`,
    { startDate: '2026-08-10', endDate: '2026-08-12' },
    [
      {
        date: '2026-08-10',
        activities: [
          activity('集合', 'other', { time: '09:30' }),
          activity('參觀美術館', 'sightseeing', { time: '10:00' }),
        ],
      },
    ]
  ),
  fixture(
    'relative-without-start',
    ['day-number', 'missing-trip-start'],
    `Day 3 下午去水族館，晚上自由活動。`,
    {},
    [
      {
        relativeDay: 3,
        activities: [activity('水族館', 'sightseeing'), activity('自由活動', 'activity')],
      },
    ]
  ),
  fixture(
    'outside-trip-range',
    ['full-date', 'outside-range'],
    `旅行結束後的 2026-09-10 安排紀念品店。`,
    { startDate: '2026-09-01', endDate: '2026-09-05' },
    [{ date: '2026-09-10', activities: [activity('紀念品店', 'shopping')] }]
  ),
  fixture(
    'duplicate-lines',
    ['duplicate', 'bullet-list'],
    `2026-10-01\n- 10:00 海洋館\n- 10:00 海洋館`,
    { startDate: '2026-10-01', endDate: '2026-10-02' },
    [
      {
        date: '2026-10-01',
        activities: [
          activity('海洋館', 'sightseeing', { time: '10:00' }),
          activity('海洋館', 'sightseeing', { time: '10:00' }),
        ],
      },
    ]
  ),
  fixture(
    'all-day-plan',
    ['missing-time', 'all-day'],
    `2026-11-15 全天：租車環島、沿途拍照，晚餐視情況決定。`,
    { startDate: '2026-11-15', endDate: '2026-11-15' },
    [
      {
        date: '2026-11-15',
        activities: [
          activity('租車環島', 'ground_transport', { note: '沿途拍照' }),
          activity('晚餐', 'food', { note: '視情況決定' }),
        ],
      },
    ]
  ),
  fixture(
    'time-ranges',
    ['time-range', 'markdown-table'],
    `| 時段 | 活動 |\n| 09:00-11:00 | 城堡參觀 |\n| 13:30-15:00 | 手作體驗 |`,
    { startDate: '2026-07-07', endDate: '2026-07-07' },
    [
      {
        relativeDay: 1,
        activities: [
          activity('城堡參觀', 'sightseeing', { time: '09:00', endTime: '11:00' }),
          activity('手作體驗', 'activity', { time: '13:30', endTime: '15:00' }),
        ],
      },
    ]
  ),
  fixture(
    'nested-bullets',
    ['nested-list', 'notes'],
    `Day 1\n- 09:00 市區導覽\n  - 備註：穿好走的鞋\n- 12:00 午餐`,
    { startDate: '2026-06-01', endDate: '2026-06-02' },
    [
      {
        relativeDay: 1,
        activities: [
          activity('市區導覽', 'sightseeing', { time: '09:00', note: '穿好走的鞋' }),
          activity('午餐', 'food', { time: '12:00' }),
        ],
      },
    ]
  ),
  fixture(
    'checkbox-list',
    ['checkbox-list', 'mixed-types'],
    `2026-08-22\n- [ ] 08:00 飯店退房\n- [ ] 09:00 搭巴士前往機場`,
    { startDate: '2026-08-20', endDate: '2026-08-22' },
    [
      {
        date: '2026-08-22',
        activities: [
          activity('飯店退房', 'accommodation', { time: '08:00' }),
          activity('搭巴士前往機場', 'ground_transport', { time: '09:00' }),
        ],
      },
    ]
  ),
  fixture(
    'mixed-language-place',
    ['mixed-language', 'location'],
    `2026-10-12 10:00 到 teamLab Borderless，之後在麻布台之丘午餐。`,
    { startDate: '2026-10-12', endDate: '2026-10-14' },
    [
      {
        date: '2026-10-12',
        activities: [
          activity('teamLab Borderless', 'sightseeing', {
            time: '10:00',
            locationName: '麻布台之丘',
          }),
          activity('麻布台之丘午餐', 'food', { locationName: '麻布台之丘' }),
        ],
      },
    ]
  ),
  fixture(
    'three-days-compact',
    ['compact', 'day-number'],
    `D1 抵達福岡、屋台；D2 太宰府、柳川；D3 市區購物、返程。`,
    { startDate: '2026-09-03', endDate: '2026-09-05' },
    [
      {
        relativeDay: 1,
        activities: [activity('抵達福岡', 'ground_transport'), activity('屋台', 'food')],
      },
      {
        relativeDay: 2,
        activities: [activity('太宰府', 'sightseeing'), activity('柳川', 'sightseeing')],
      },
      {
        relativeDay: 3,
        activities: [activity('市區購物', 'shopping'), activity('返程', 'ground_transport')],
      },
    ]
  ),
  fixture(
    'missing-date',
    ['missing-date', 'blocking-warning'],
    `早餐後去植物園，下午搭船。原文沒有提供日期或第幾天。`,
    { startDate: '2026-05-01', endDate: '2026-05-04' },
    [
      {
        activities: [activity('植物園', 'sightseeing'), activity('搭船', 'activity')],
      },
    ],
    [{ code: 'MISSING_DATE', dayIndex: 0 }]
  ),
  fixture(
    'day-four',
    ['day-number', 'single-activity'],
    `第四天 17:30 到觀景台看夕陽。`,
    { startDate: '2026-07-01', endDate: '2026-07-06' },
    [
      {
        relativeDay: 4,
        activities: [activity('觀景台看夕陽', 'sightseeing', { time: '17:30' })],
      },
    ]
  ),
  fixture(
    'hotel-note',
    ['accommodation', 'notes'],
    `2026-12-05 15:00 入住溫泉旅館。備註：晚餐前先到櫃台預約私人湯屋。`,
    { startDate: '2026-12-05', endDate: '2026-12-07' },
    [
      {
        date: '2026-12-05',
        activities: [
          activity('入住溫泉旅館', 'accommodation', {
            time: '15:00',
            note: '晚餐前先到櫃台預約私人湯屋',
          }),
        ],
      },
    ]
  ),
  fixture(
    'free-morning',
    ['paragraph', 'mixed-time'],
    `2026-06-18 上午自由活動。下午 14:20 在車站集合，15:00 出發前往郊區。`,
    { startDate: '2026-06-18', endDate: '2026-06-20' },
    [
      {
        date: '2026-06-18',
        activities: [
          activity('自由活動', 'activity', { note: '上午' }),
          activity('車站集合', 'other', { time: '14:20', locationName: '車站' }),
          activity('前往郊區', 'ground_transport', { time: '15:00' }),
        ],
      },
    ]
  ),
  fixture(
    'colon-lines',
    ['key-value', 'full-date'],
    `日期：2026-08-06\n上午：老街散步\n午餐：牛肉麵\n晚上：夜市`,
    { startDate: '2026-08-06', endDate: '2026-08-08' },
    [
      {
        date: '2026-08-06',
        activities: [
          activity('老街散步', 'sightseeing', { note: '上午' }),
          activity('牛肉麵', 'food', { note: '午餐' }),
          activity('夜市', 'sightseeing', { note: '晚上' }),
        ],
      },
    ]
  ),
  fixture(
    'emoji-headings',
    ['emoji', 'markdown-heading'],
    `### Day 2 🏝️\n09:00 海灘散步\n12:00 海邊餐廳\n🌙 晚上自由活動`,
    { startDate: '2026-05-10', endDate: '2026-05-13' },
    [
      {
        relativeDay: 2,
        activities: [
          activity('海灘散步', 'sightseeing', { time: '09:00' }),
          activity('海邊餐廳', 'food', { time: '12:00' }),
          activity('自由活動', 'activity', { note: '晚上' }),
        ],
      },
    ]
  ),
  fixture(
    'overnight-flight',
    ['flight', 'cross-midnight'],
    `2026-09-25 23:40 起飛，隔天 05:55 抵達。`,
    { startDate: '2026-09-25', endDate: '2026-09-28' },
    [
      {
        date: '2026-09-25',
        activities: [
          activity('搭乘夜間航班', 'flight', {
            time: '23:40',
            endTime: '05:55',
            note: '隔天抵達',
          }),
        ],
      },
    ]
  ),
  fixture(
    'two-cities',
    ['location', 'multi-day'],
    `2026-11-08 住在首爾並逛景福宮。2026-11-09 搭車去水原參觀華城。`,
    { startDate: '2026-11-08', endDate: '2026-11-10' },
    [
      {
        date: '2026-11-08',
        activities: [
          activity('入住首爾', 'accommodation', { locationName: '首爾' }),
          activity('景福宮', 'sightseeing', { locationName: '首爾' }),
        ],
      },
      {
        date: '2026-11-09',
        activities: [
          activity('搭車前往水原', 'ground_transport', { locationName: '水原' }),
          activity('水原華城', 'sightseeing', { locationName: '水原' }),
        ],
      },
    ]
  ),
  fixture(
    'optional-backup',
    ['notes', 'weather-backup'],
    `Day 2 10:00 公園野餐；若下雨就改去科學館。`,
    { startDate: '2026-04-03', endDate: '2026-04-05' },
    [
      {
        relativeDay: 2,
        activities: [activity('公園野餐', 'activity', { time: '10:00', note: '下雨改去科學館' })],
      },
    ]
  ),
  fixture(
    'unsorted-times',
    ['unsorted', 'full-date'],
    `2026-08-30\n18:00 晚餐\n09:00 博物館\n14:00 咖啡店`,
    { startDate: '2026-08-30', endDate: '2026-08-31' },
    [
      {
        date: '2026-08-30',
        activities: [
          activity('晚餐', 'food', { time: '18:00' }),
          activity('博物館', 'sightseeing', { time: '09:00' }),
          activity('咖啡店', 'food', { time: '14:00' }),
        ],
      },
    ]
  ),
  fixture(
    'empty-day-note',
    ['empty-day', 'day-number'],
    `Day 5 保留為休息日，不安排活動。`,
    { startDate: '2026-10-01', endDate: '2026-10-07' },
    [{ relativeDay: 5, title: '休息日', content: '不安排活動', activities: [] }]
  ),
  fixture(
    'restaurant-reservation',
    ['food', 'reservation-note'],
    `2026-07-19 19:30 已預約河畔餐廳，請提前十分鐘抵達。`,
    { startDate: '2026-07-19', endDate: '2026-07-21' },
    [
      {
        date: '2026-07-19',
        activities: [
          activity('河畔餐廳', 'food', {
            time: '19:30',
            note: '已預約，提前十分鐘抵達',
          }),
        ],
      },
    ]
  ),
  fixture(
    'final-day-departure',
    ['departure', 'day-number'],
    `最後一天（Day 4）：07:00 早餐，08:30 退房，09:00 前往機場。`,
    { startDate: '2026-09-14', endDate: '2026-09-17' },
    [
      {
        relativeDay: 4,
        activities: [
          activity('早餐', 'food', { time: '07:00' }),
          activity('退房', 'accommodation', { time: '08:30' }),
          activity('前往機場', 'ground_transport', { time: '09:00' }),
        ],
      },
    ]
  ),
];
