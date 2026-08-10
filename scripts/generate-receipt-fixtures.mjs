import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const outputDirectory = resolve('src/__fixtures__/ai/receipts');
const chrome = process.env.CHROME_PATH ?? 'google-chrome';

const cases = [
  [
    'zh-tw-night-market',
    '海風小吃',
    '2026-06-02',
    ['炒麵            NT$360', 'TOTAL           TWD 360'],
  ],
  [
    'zh-tw-service-fee',
    '山嶼茶房',
    '2026-06-03',
    ['小計            TWD 680', '服務費           TWD 68', 'TOTAL           TWD 748'],
  ],
  [
    'zh-cn-hk-cafe',
    '星港茶餐厅',
    '2026-06-04',
    ['午市套餐         HKD 126', '合计            HKD 126'],
  ],
  [
    'en-us-tax',
    'North Pier Cafe',
    '2026-06-05',
    ['Subtotal       USD 17.00', 'Tax             USD 1.36', 'TOTAL          USD 18.36'],
  ],
  [
    'ja-tokyo-tax',
    '青空食堂',
    '2026-06-06',
    ['小計           JPY 1,200', '税              JPY 120', '合計           JPY 1,320'],
  ],
  [
    'mixed-language-bistro',
    'Café Lumière',
    '2026-06-07',
    ['ランチ / Lunch  EUR 24.50', 'TOTAL          EUR 24.50'],
  ],
  [
    'eur-vat',
    'River Table',
    '2026-06-08',
    ['Subtotal       EUR 35.00', 'VAT              EUR 7.00', 'TOTAL          EUR 42.00'],
  ],
  [
    'hkd-shopping',
    '港灣選物',
    '2026-06-09',
    ['旅行用品         HKD 499', 'TOTAL           HKD 499'],
  ],
  [
    'thb-food',
    'Lotus Kitchen',
    '2026-06-10',
    ['Noodles          THB 285', 'TOTAL            THB 285'],
  ],
  [
    'ambiguous-dollar',
    'Corner Deli',
    '2026-06-11',
    ['Sandwich          $12.00', 'TOTAL             $12.00'],
  ],
  [
    'ambiguous-two-totals',
    'Harbor Grill',
    '2026-06-12',
    [
      'Meal            USD 54.00',
      'PRE-TIP TOTAL   USD 54.00',
      'TIP SUGGESTED   USD 10.00',
      'TOTAL WITH TIP  USD 64.00',
    ],
  ],
  ['missing-date', 'Trail Snacks', '', ['Trail Mix        USD 9.75', 'TOTAL            USD 9.75']],
  [
    'missing-currency',
    '晨光早餐',
    '2026-06-14',
    ['早餐套餐             95', '合計                 95'],
  ],
  ['non-receipt-note', '', '', ['明天記得帶雨傘', '下午三點車站集合', '這不是收據']],
  ['handwritten-total', 'Garden Stall', '2026-06-16', ['Handmade soap', 'TOTAL  USD 7.50']],
  [
    'fake-card-slip',
    'Metro Coffee',
    '2026-06-17',
    ['CARD PURCHASE', 'CARD **** 0042', 'APPROVED', 'TOTAL          USD 11.20'],
  ],
  [
    'long-receipt',
    'Long Road Market',
    '2026-06-18',
    [
      'Water           USD 2.50',
      'Fruit           USD 8.40',
      'Bread           USD 4.75',
      'Travel kit     USD 18.99',
      'Notebook        USD 6.25',
      'Umbrella       USD 21.00',
      'Snacks         USD 11.53',
      'TOTAL          USD 73.42',
    ],
  ],
  [
    'low-contrast',
    '午後書店',
    '2026-06-19',
    ['旅行手帳         TWD 520', 'TOTAL           TWD 520'],
  ],
  [
    'hard-shadow',
    'Olive Room',
    '2026-06-20',
    ['Dinner          EUR 31.80', 'TOTAL           EUR 31.80'],
  ],
  [
    'rotated-receipt',
    '旅路売店',
    '2026-06-21',
    ['おみやげ         JPY 880', '合計             JPY 880'],
  ],
  [
    'wrinkled-paper',
    'Palm Cafe',
    '2026-06-22',
    ['Lunch            THB 190', 'TOTAL            THB 190'],
  ],
  [
    'tiny-print',
    'Peak Mini Mart',
    '2026-06-23',
    ['Supplies         HKD 68.50', 'TOTAL            HKD 68.50'],
  ],
  [
    'discount-total',
    'Maple Outlet',
    '2026-06-24',
    ['Subtotal         USD 90.00', 'Discount        -USD 18.00', 'TOTAL            USD 72.00'],
  ],
  [
    'tip-total',
    'Seaside Diner',
    '2026-06-25',
    ['Subtotal         USD 30.00', 'Tip               USD 4.50', 'TOTAL            USD 34.50'],
  ],
  [
    'thb-service',
    'Golden Bowl',
    '2026-06-26',
    ['Subtotal          THB 500', 'Service            THB 50', 'TOTAL             THB 550'],
  ],
  [
    'twd-tax-service',
    '雲端餐桌',
    '2026-06-27',
    [
      '小計          TWD 1,000',
      '稅              TWD 50',
      '服務費          TWD 105',
      '總計          TWD 1,155',
    ],
  ],
  [
    'missing-merchant',
    '',
    '2026-06-28',
    ['Purchase         EUR 16.40', 'TOTAL            EUR 16.40'],
  ],
  [
    'ambiguous-date',
    'Date Corner',
    '06/07/2026',
    ['Meal             USD 21.00', 'TOTAL            USD 21.00'],
  ],
  [
    'explicit-usd-symbol',
    'Union Cafe',
    '2026-06-30',
    ['Coffee          US$ 14.25', 'TOTAL           USD 14.25'],
  ],
  [
    'euro-symbol',
    'Petit Marché',
    '2026-07-01',
    ['Goods              €27.60', 'TOTAL           EUR 27.60'],
  ],
  ['jpy-symbol', '森の駅', '2026-07-02', ['定食               ¥1,450', 'TOTAL          JPY 1,450']],
  ['twd-symbol', '海角咖啡', '2026-07-03', ['飲品              NT$230', 'TOTAL           TWD 230']],
  ['hkd-symbol', '维港书店', '2026-07-04', ['图册              HK$188', 'TOTAL           HKD 188']],
  [
    'thai-baht-code',
    'Blue Mango',
    '2026-07-05',
    ['อาหาร / Meal    THB 420', 'TOTAL            THB 420'],
  ],
  [
    'souvenir-shop',
    'Sunny Souvenirs',
    '2026-07-07',
    ['Postcards        USD 46.00', 'TOTAL            USD 46.00'],
  ],
  [
    'airport-train',
    'Airport Rail',
    '2026-07-08',
    ['Airport ticket  JPY 2,600', 'TOTAL           JPY 2,600'],
  ],
  [
    'fictional-hotel',
    'Hotel Aurora',
    '2026-07-09',
    ['One night        EUR 184.20', 'TOTAL            EUR 184.20'],
  ],
  [
    'city-museum',
    'City Museum',
    '2026-07-10',
    ['Admission         USD 32.00', 'TOTAL             USD 32.00'],
  ],
  [
    'ferry-ticket',
    'Island Ferry',
    '2026-07-11',
    ['Passenger ticket  HKD 44.00', 'TOTAL             HKD 44.00'],
  ],
].map(([id, merchant, date, lines]) => ({ id, merchant, date, lines }));

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box } html, body { margin: 0; width: 700px; height: 1000px; overflow: hidden }
  body { display: grid; place-items: center; background: #d5c3a8; font-family: "Noto Sans Mono", "Noto Sans CJK TC", monospace }
  .receipt { position: relative; width: 430px; min-height: 690px; padding: 58px 42px; background: #fffef7; color: #202020; box-shadow: 8px 14px 24px #0004; white-space: pre-wrap }
  h1 { margin: 0 0 24px; text-align: center; font: 700 29px/1.3 "Noto Sans", "Noto Sans CJK TC", sans-serif }
  .date { text-align: center; margin-bottom: 42px; font-size: 19px }
  .line { font-size: 20px; line-height: 1.8; border-bottom: 1px dotted #aaa }
  .footer { margin-top: 35px; text-align: center; font-size: 15px }
  body.low-contrast .receipt { color: #aaa79c; filter: contrast(.72) brightness(1.07) }
  body.hard-shadow .receipt::after { content: ''; position: absolute; inset: 0; background: linear-gradient(112deg, transparent 38%, #0009 64%, #0002 79%, transparent 80%); pointer-events: none }
  body.rotated-receipt .receipt { transform: rotate(-11deg) scale(.91) }
  body.wrinkled-paper .receipt { background: repeating-linear-gradient(97deg, #fffef7 0 44px, #e6e0cf 48px, #fffef7 53px 92px); transform: perspective(700px) rotateY(8deg) }
  body.tiny-print .line, body.tiny-print .date { font-size: 12px }
  body.long-receipt .receipt { min-height: 920px; padding-top: 35px } body.long-receipt .line { font-size: 16px; line-height: 1.55 }
  body.handwritten-total .line:last-of-type { margin-top: 120px; transform: rotate(-3deg); font: 28px/1.6 cursive }
  body.non-receipt-note .receipt { width: 520px; min-height: 420px; background: #fff5a8; transform: rotate(3deg) } body.non-receipt-note .line { font-size: 28px; border: 0; line-height: 2 }
</style>
<main class="receipt"><h1></h1><div class="date"></div><section></section><div class="footer">THANK YOU</div></main>
<script>
  const cases = ${JSON.stringify(cases)};
  const item = cases.find((candidate) => candidate.id === location.hash.slice(1));
  document.body.className = item.id;
  document.querySelector('h1').textContent = item.merchant;
  document.querySelector('.date').textContent = item.date;
  document.querySelector('section').replaceChildren(...item.lines.map((line) => Object.assign(document.createElement('div'), { className: 'line', textContent: line })));
</script>`;

const documentUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;

mkdirSync(outputDirectory, { recursive: true });
for (const item of cases) {
  const profileDirectory = mkdtempSync(join(tmpdir(), 'travel-budget-receipt-'));
  try {
    const result = spawnSync(
      chrome,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--user-data-dir=${profileDirectory}`,
        '--window-size=700,1000',
        `--screenshot=${resolve(outputDirectory, `${item.id}.png`)}`,
        `${documentUrl}#${item.id}`,
      ],
      { stdio: 'pipe' }
    );
    if (result.status !== 0)
      throw new Error(result.stderr.toString() || `Chrome failed for ${item.id}`);
  } finally {
    rmSync(profileDirectory, { force: true, recursive: true });
  }
}
