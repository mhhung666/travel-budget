/** Run against `pnpm build && pnpm start --port 3101`; uses synthetic data only. */
import { chromium } from 'playwright';
import { readdir, readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const origin = process.env.PDF_TEST_ORIGIN ?? 'http://localhost:3101';
const output = await mkdtemp(path.join(tmpdir(), 'itinerary-pdf-'));
const chunks = path.resolve('.next/static/chunks');
let workerFile;
for (const file of await readdir(chunks)) {
  if (
    file.endsWith('.js') &&
    (await readFile(path.join(chunks, file), 'utf8')).includes('self.onmessage=')
  ) {
    workerFile = file;
    break;
  }
}
assert(workerFile, 'Build the production PDF worker first.');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
try {
  const page = await browser.newPage();
  await page.route('**/pdf-export-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body>PDF export check</body></html>',
    })
  );
  await page.goto(`${origin}/pdf-export-check`);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  for (const count of [3, 14, 30]) {
    const model = {
      name: '臺灣旅行・东京の旅・简体中文 English',
      dates: '2026-09-18 – 2026-10-18',
      generated: '2026-09-18 10:00 GMT+8',
      locale: 'zh-TW',
      labels: { generated: '產生時間', range: '範圍', confirmation: '確認碼' },
      days: Array.from({ length: count }, (_, d) => ({
        heading: `Day ${d + 1} · 臺北・東京・北京`,
        location: '東京都新宿區',
        content: [
          { kind: 'heading', content: [{ text: '每日說明' }] },
          {
            kind: 'paragraph',
            content: [
              { text: '繁體中文 简体中文 日本語 English 😀', bold: true },
              { text: ' 安全連結', url: 'https://example.com' },
            ],
          },
          {
            kind: 'paragraph',
            content: [
              { text: '景點: 淺草寺\n地址: 台北市\n[圖片未收錄: 照片]\n[x] 已完成\n[ ] 待辦' },
            ],
          },
          {
            kind: 'code',
            content: [{ text: 'https://example.com/' + 'very-long-path-'.repeat(20) }],
          },
        ],
        activities: Array.from({ length: 15 }, (_, a) => ({
          title: `活動 ${a + 1} · 奈良公園 京都駅`,
          time: '09:00 – 10:30',
          type: '景點',
          location: '臺北車站',
          note: `繁體與简体日本語 English. ${count === 30 && d === 0 && a === 0 ? 'LONG_START ' + '不截斷長文字測試日本語English'.repeat(500) + ' LONG_END' : ''}`,
          confirmation: '',
        })),
      })),
    };
    const result = await page.evaluate(
      async ({ model, workerFile }) => {
        const started = performance.now();
        let ticks = 0;
        const interval = setInterval(() => ticks++, 50);
        const worker = new Worker('/_next/static/chunks/' + workerFile);
        let timer;
        try {
          const blob = await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('PDF timeout')), 120_000);
            worker.onmessage = (event) =>
              event.data.blob
                ? resolve(event.data.blob)
                : reject(new Error('Worker generation failed'));
            worker.onerror = (event) => reject(new Error(event.message || 'Worker startup failed'));
            worker.postMessage({
              model,
              fontUrl: location.origin + '/fonts/TravelCJK-Regular.ttf',
            });
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `itinerary-${model.days.length}.pdf`;
          link.textContent = 'Download PDF';
          document.body.replaceChildren(link);
          return { ms: Math.round(performance.now() - started), ticks, size: blob.size, url };
        } finally {
          worker.terminate();
          clearInterval(interval);
          clearTimeout(timer);
        }
      },
      { model, workerFile }
    );
    assert(result.ticks > 0, 'Page should remain responsive during rendering.');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    const destination = path.join(output, download.suggestedFilename());
    await download.saveAs(destination);
    assert.equal((await stat(destination)).size, result.size);
    assert.equal((await readFile(destination)).subarray(0, 5).toString(), '%PDF-');
    const task = getDocument({
      data: new Uint8Array(await readFile(destination)),
      useSystemFonts: false,
      standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
    });
    const document = await task.promise;
    let text = '';
    try {
      for (let number = 1; number <= document.numPages; number++) {
        const pdfPage = await document.getPage(number);
        const items = (await pdfPage.getTextContent()).items.filter((item) => 'str' in item);
        const pageText = items.map((item) => item.str).join('');
        assert(pageText.includes(`${number} / ${document.numPages}`), 'Missing page number');
        const viewport = pdfPage.getViewport({ scale: 1 });
        for (const item of items) {
          assert(
            item.transform[4] >= 35 && item.transform[4] + item.width <= viewport.width - 35,
            'Text outside horizontal bounds'
          );
          assert(
            item.transform[5] >= 18 && item.transform[5] <= viewport.height - 30,
            'Text outside vertical bounds'
          );
        }
        text += pageText;
      }
      assert.equal(text.split('奈良公園').length - 1, count * 15, 'Activity content omitted');
      assert(text.includes('繁體中文 简体中文 日本語 English'));
      if (count === 30) {
        assert(text.includes('LONG_START'));
        assert(text.includes('LONG_END'));
      }
    } finally {
      await task.destroy();
    }
    await page.evaluate((url) => URL.revokeObjectURL(url), result.url);
    console.log(
      JSON.stringify({
        days: count,
        ms: result.ms,
        uiTicks: result.ticks,
        bytes: result.size,
        file: destination,
      })
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'Downloads, extracted text, page numbers and bounds verified. Inspect page images separately; this is not a mobile-device acceptance test.'
  );
} finally {
  await browser.close();
}
