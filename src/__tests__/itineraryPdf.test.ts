import { describe, expect, it } from 'vitest';
import { buildItineraryPdfModel, type PdfLabels } from '@/lib/exporters/itineraryPdfModel';
import { itineraryPdfMarkdown, safePdfLink } from '@/lib/exporters/itineraryPdfMarkdown';
import { pdfText } from '@/lib/exporters/pdfText';
import type { Activity, ItineraryDay } from '@/types';

const labels: PdfLabels = {
  day: 'Day {n}',
  generated: 'Generated',
  range: 'Range',
  outsideRange: 'Outside trip',
  end: 'End',
  confirmation: 'Booking',
  imageOmitted: 'Image omitted',
  types: {
    sightseeing: 'Sightseeing',
    food: 'Food',
    flight: 'Flight',
    ground_transport: 'Ground',
    transport: 'Transport',
    accommodation: 'Stay',
    shopping: 'Shopping',
    activity: 'Activity',
    other: 'Other',
  },
};
const activity = (id: string, time: string | null): Activity => ({
  id,
  revision: 0,
  title: id,
  time,
  end_time: '19:00',
  type: 'other',
  location: null,
  location_name: 'Text place',
  note: 'Keep note',
  confirmation_code: 'PRIVATE-PNR',
  attachments: [{ key: 'SECRET-R2-KEY' }] as Activity['attachments'],
});
const day = (n: number): ItineraryDay => ({
  id: String(n),
  trip_id: 'secret-trip-id',
  revision: 0,
  day_number: n,
  title: '臺北 東京 北京',
  content: 'Daily notes',
  location: null,
  activities: [
    activity('untimed', null),
    activity('late', '17:00'),
    activity('first', '08:00'),
    activity('tie', '08:00'),
  ],
  created_at: '',
  updated_at: '',
});
const trip = { name: 'Trip', start_date: '2024-02-28', end_date: '2024-02-29' };
const options = { dayIds: ['1', '3'], includeNotes: true, includeConfirmation: false };
const build = (member: boolean, includeConfirmation = false) =>
  buildItineraryPdfModel(
    trip,
    [day(3), day(1)],
    { ...options, includeConfirmation },
    member,
    'zh',
    labels,
    new Date('2024-02-28T00:00:00Z')
  );

describe('PDF itinerary projection', () => {
  it('preserves sparse days and UTC leap-day arithmetic, stable time ordering and fallback places', () => {
    const model = build(true);
    expect(model.days[0].heading).toContain('Day 1');
    expect(model.days[1].heading).toContain('Day 3');
    expect(model.days[1].heading).toContain('3月1日');
    expect(model.days[1].heading).toContain('Outside trip');
    expect(model.days[0].activities.map((a) => a.title)).toEqual([
      'first',
      'tie',
      'late',
      'untimed',
    ]);
    expect(model.days[0].activities[3]).toMatchObject({
      time: 'End 19:00',
      location: 'Text place',
    });
  });
  it('only includes confirmation codes for explicitly opted-in members, never attachments', () => {
    expect(JSON.stringify(build(false, true))).not.toContain('PRIVATE-PNR');
    expect(JSON.stringify(build(true))).not.toContain('PRIVATE-PNR');
    expect(JSON.stringify(build(true, true))).toContain('PRIVATE-PNR');
    for (const model of [build(false, true), build(true, true)]) {
      expect(JSON.stringify(model)).not.toContain('SECRET-R2-KEY');
      expect(JSON.stringify(model)).not.toContain('secret-trip-id');
    }
  });
  it('does not fabricate dates, omit empty days or truncate legacy activity counts', () => {
    const empty = { ...day(1), activities: [] };
    const full = {
      ...day(3),
      activities: Array.from({ length: 20 }, (_, i) => activity(String(i), null)),
    };
    const model = buildItineraryPdfModel(
      { ...trip, start_date: null, end_date: null },
      [empty, full],
      { ...options, includeNotes: false },
      true,
      'jp',
      labels
    );
    expect(model.dates).toBe('');
    expect(model.days[0].heading).toBe('Day 1 · 臺北 東京 北京');
    expect(model.days[0].content).toEqual([]);
    expect(model.days[0].activities).toEqual([]);
    expect(model.days[1].activities).toHaveLength(20);
  });
  it('rejects empty or deleted selections instead of silently reducing the export', () => {
    for (const dayIds of [[], ['1', 'removed']])
      expect(() =>
        buildItineraryPdfModel(trip, [day(1)], { ...options, dayIds }, true, 'en', labels)
      ).toThrow('PDF_SELECTION_CHANGED');
  });
});

describe('printable Markdown', () => {
  it('preserves tables, tasks, code, nested text and image placeholders without remote image URLs', () => {
    const blocks = itineraryPdfMarkdown(
      '# Heading\n\n**bold** *italic* ~~gone~~\n\n- [x] Done\n- [ ] Later\n\n| Place | Note |\n| --- | --- |\n| Tokyo | 長文字 |\n\n![Alt](https://private.example/image.jpg)\n\n```js\nconst x = 1\n```\n\n> Quote\n\n<script>alert(1)</script>',
      'Image omitted'
    );
    const text = blocks.flatMap((b) => b.content.map((p) => p.text)).join('');
    for (const expected of [
      'Heading',
      'bold',
      'italic',
      'gone',
      '[x] Done',
      '[ ] Later',
      'Place: Tokyo',
      'Note: 長文字',
      '[Image omitted: Alt]',
      'const x = 1',
      'Quote',
      '<script>alert(1)</script>',
    ])
      expect(text).toContain(expected);
    expect(text).not.toContain('private.example');
    expect(blocks.some((b) => b.content.some((p) => p.bold))).toBe(true);
  });
  it('resolves safe reference links and rejects executable/file/relative URLs', () => {
    const blocks = itineraryPdfMarkdown(
      '[safe][ref] [bad](javascript:alert)\n\n[ref]: https://example.com',
      'omitted'
    );
    expect(blocks[0].content.find((p) => p.text === 'safe')?.url).toBe('https://example.com');
    expect(blocks[0].content.find((p) => p.text === 'bad')?.url).toBeUndefined();
    for (const value of [
      'javascript:alert(1)',
      'file:///secret',
      '//example.com',
      '/relative',
      'data:text/html,hi',
    ])
      expect(safePdfLink(value)).toBeUndefined();
  });
  it('retains CJK and represents unsupported glyphs explicitly', () => {
    expect(pdfText('臺灣 简体 東京 カタカナ English')).toBe('臺灣 简体 東京 カタカナ English');
    expect(pdfText('😀')).toBe('[U+1F600]');
  });
});
