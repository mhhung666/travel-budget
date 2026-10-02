// @vitest-environment node
import { expect, it } from 'vitest';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildItineraryPdf } from '@/lib/exporters/itineraryPdf';
import type { ItineraryPdfModel } from '@/lib/exporters/itineraryPdfModel';

it('renders a long itinerary with fixed page numbers', async () => {
  const model: ItineraryPdfModel = {
    name: '臺灣旅行 東京 简体 English',
    dates: '',
    generated: '2026-09-18 GMT+8',
    locale: 'zh-TW',
    labels: {
      day: 'Day {n}',
      generated: 'Generated',
      range: 'Range',
      outsideRange: 'Outside',
      end: 'End',
      confirmation: 'Code',
      imageOmitted: 'Omitted',
      types: {} as ItineraryPdfModel['labels']['types'],
    },
    days: Array.from({ length: 14 }, (_, d) => ({
      heading: `Day ${d + 1}`,
      location: '東京都',
      content: [{ kind: 'paragraph', content: [{ text: '繁體中文 简体 日本語 English' }] }],
      activities: Array.from({ length: 15 }, (_, a) => ({
        title: `ACTIVITY_${d + 1}_${a + 1}`,
        time: '09:00',
        type: 'Other',
        location: '臺北車站',
        note:
          d === 0 && a === 0
            ? 'LONG_START' + '長備註完整保留'.repeat(500) + 'LONG_END'
            : '保留備註文字',
        confirmation: '',
      })),
    })),
  };
  const blob = await buildItineraryPdf(model, path.resolve('public/fonts/TravelCJK-Regular.ttf'));
  const task = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    useSystemFonts: false,
    standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
  });
  const document = await task.promise;
  try {
    expect(document.numPages).toBeGreaterThan(10);
    let text = '';
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const items = (await page.getTextContent()).items.filter((item) => 'str' in item);
      const pageText = items.map((item) => item.str).join('');
      expect(pageText).toContain(`${number} / ${document.numPages}`);
      const viewport = page.getViewport({ scale: 1 });
      for (const item of items) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(35);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width - 35);
        expect(item.transform[5]).toBeGreaterThanOrEqual(18);
        expect(item.transform[5]).toBeLessThanOrEqual(viewport.height - 30);
      }
      text += pageText;
    }
    for (let d = 1; d <= 14; d++)
      for (let a = 1; a <= 15; a++) expect(text).toContain(`ACTIVITY_${d}_${a}`);
    expect(text).toContain('繁體中文 简体 日本語 English');
    expect(text).toContain('LONG_START');
    expect(text).toContain('LONG_END');
    // The fixed footer is interleaved in reading order at a page boundary.
    const body = text.replaceAll(/臺灣旅行 東京 简体 English\s*·\s*\d+ \/ \d+/g, '');
    expect(body.split('長備註完整保留')).toHaveLength(501);
  } finally {
    await task.destroy();
  }
}, 30_000);
