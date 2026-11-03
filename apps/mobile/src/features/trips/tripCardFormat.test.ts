import { expect, it } from 'vitest';
import { messages } from '@/i18n/messages';
import { cardDates, cardMoney, cardPhase, cardSummaryColumns } from './tripCardFormat';

it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'card amounts keep ISO codes and cents without symbols in %s',
  (locale) => {
    for (const currency of ['TWD', 'JPY', 'KRW', 'USD']) {
      expect(cardMoney(27897.92, currency, locale)).toBe(`27,897.92 ${currency}`);
      expect(cardMoney(-0.01, currency, locale)).toBe(`0.01 ${currency}`);
      expect(cardMoney(0.06, currency, locale)).toBe(`0.06 ${currency}`);
      expect(cardMoney(0, currency, locale)).toBe(`0 ${currency}`);
      expect(cardMoney(999999999999.99, currency, locale)).toBe(`999,999,999,999.99 ${currency}`);
    }
  }
);
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'dates stay explicit and phase stays truthful when archived in %s',
  (locale) => {
    const t = messages[locale];
    expect(cardDates({ startDate: null, endDate: null }, t, locale)).toBe(t.unscheduled);
    expect(cardDates({ startDate: null, endDate: '2027-01-18' }, t, locale)).toContain(t.notSet);
    const single = cardDates({ startDate: '2027-01-12', endDate: '2027-01-12' }, t, locale);
    expect(single.match(/2027/g)).toHaveLength(1);
    const sameYear = cardDates({ startDate: '2027-01-12', endDate: '2027-01-18' }, t, locale);
    expect(sameYear).toContain('2027');
    if (locale !== 'en') expect(sameYear).toBe('2027年1月12日 – 1月18日');
    const crossYear = cardDates({ startDate: '2026-12-31', endDate: '2027-01-01' }, t, locale);
    expect(crossYear).toContain('2026');
    expect(crossYear).toContain('2027');
    for (const phase of ['ongoing', 'upcoming', 'unscheduled', 'past'] as const) {
      const label = cardPhase({ archived: true, phase }, t);
      expect(label).toBe(
        phase === 'past'
          ? t.archived
          : `${t.archived} · ${phase === 'unscheduled' ? t.unscheduledPhase : t[phase]}`
      );
    }
  }
);
it('summary decisions use usable width, text scale and the longest number', () => {
  expect(cardSummaryColumns(0, 1)).toBe(false);
  expect(cardSummaryColumns(255, 1)).toBe(false);
  expect(cardSummaryColumns(320, 1)).toBe(true);
  expect(cardSummaryColumns(320, 2)).toBe(false);
  expect(cardSummaryColumns(600, 2)).toBe(true);
  expect(cardSummaryColumns(320, 1, 17)).toBe(false);
});
