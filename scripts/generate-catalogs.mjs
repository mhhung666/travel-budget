/**
 * 產生「旅行成就」功能的固定目錄（ROADMAP #19）：
 *
 *   node scripts/generate-catalogs.mjs   （package.json: `pnpm generate:catalogs`）
 *
 * 輸出（生成資產，勿手改——需要修正時改本腳本後重新產生，比照 public/geo/countries.geojson）：
 *   - public/data/airlines.json  自 OpenFlights airlines.dat：有 IATA 代碼的客運航空
 *                                （含已停業者——終身飛行紀錄需要它們），IATA 撞碼時保留 active 者。
 *                                疊上三大聯盟標記與常用航空的繁中名（下方人工 overlay）。
 *   - public/data/airports.json  自 OurAirports airports.csv：有 IATA 代碼且有定期航班的機場，
 *                                含座標（供日後地圖航線弧）。
 *
 * 兩份皆於前端以 fetch 延遲載入（見 src/hooks/queries/useCatalogs.ts），不進 JS bundle。
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');

const AIRLINES_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat';
const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

/** 三大航空聯盟成員（IATA → alliance）。人工維護：聯盟異動極少（一年 0–2 家）。2026-07 現況。 */
const ALLIANCES = {
  star: ['A3', 'AC', 'CA', 'AI', 'NZ', 'NH', 'OZ', 'OS', 'AV', 'SN', 'CM', 'MS', 'ET', 'BR', 'LO', 'LH', 'ZH', 'SQ', 'SA', 'LX', 'TP', 'TG', 'TK', 'UA'],
  oneworld: ['AS', 'AA', 'BA', 'CX', 'FJ', 'AY', 'IB', 'JL', 'MH', 'WY', 'QF', 'QR', 'AT', 'RJ', 'UL'],
  skyteam: ['AR', 'AM', 'UX', 'AF', 'CI', 'MU', 'DL', 'GA', 'KQ', 'KL', 'KE', 'ME', 'SV', 'SK', 'RO', 'VN', 'VS', 'MF'],
};

/** 常用航空的繁中名 overlay（顯示 / 搜尋用；未列者顯示英文名）。 */
const NAME_ZH = {
  BR: '長榮航空', CI: '中華航空', JX: '星宇航空', IT: '台灣虎航', AE: '華信航空', B7: '立榮航空', GE: '復興航空',
  JL: '日本航空', NH: '全日空', MM: '樂桃航空', GK: '捷星日本', BC: '天馬航空', ZG: 'ZIPAIR',
  IJ: '春秋航空日本', NU: '日本越洋航空', '6J': 'Solaseed Air', '7G': '星悅航空',
  CX: '國泰航空', KA: '國泰港龍航空', UO: '香港快運', HX: '香港航空', NX: '澳門航空',
  CA: '中國國際航空', MU: '中國東方航空', CZ: '中國南方航空', HU: '海南航空', '9C': '春秋航空', HO: '吉祥航空',
  ZH: '深圳航空', MF: '廈門航空',
  KE: '大韓航空', OZ: '韓亞航空', '7C': '濟州航空', LJ: '真航空', TW: '德威航空', BX: '釜山航空', RS: '首爾航空',
  SQ: '新加坡航空', TR: '酷航', MI: '勝安航空',
  TG: '泰國國際航空', FD: '泰國亞洲航空', SL: '泰國獅子航空', VZ: '泰國越捷航空',
  VN: '越南航空', VJ: '越捷航空', QH: '越竹航空',
  PR: '菲律賓航空', '5J': '宿霧太平洋航空',
  AK: '亞洲航空', D7: '亞洲航空長程', MH: '馬來西亞航空', OD: '馬印航空',
  GA: '嘉魯達印尼航空', QG: '印尼獅子航空Citilink',
  QF: '澳洲航空', JQ: '捷星航空', NZ: '紐西蘭航空', FJ: '斐濟航空',
  UA: '聯合航空', AA: '美國航空', DL: '達美航空', AS: '阿拉斯加航空', HA: '夏威夷航空', AC: '加拿大航空',
  BA: '英國航空', AF: '法國航空', KL: '荷蘭皇家航空', LH: '漢莎航空', LX: '瑞士國際航空', OS: '奧地利航空',
  TK: '土耳其航空', AY: '芬蘭航空', IB: '西班牙國家航空', AZ: '義大利ITA航空', SK: '北歐航空', VS: '維珍航空',
  EK: '阿聯酋航空', QR: '卡達航空', EY: '阿提哈德航空',
  AI: '印度航空', UL: '斯里蘭卡航空', BG: '孟加拉航空',
};

/**
 * 人工修正：OpenFlights 資料集約停更於 2017，之後成立的航空沿用了舊代碼、
 * 或名稱/國家已變。key = IATA，值覆蓋該筆欄位（nameZh 直接在此指定，優先於 NAME_ZH）。
 */
const OVERRIDES = {
  JX: { name: 'STARLUX Airlines', country: 'Taiwan', nameZh: '星宇航空' }, // 原 Jusur airways（埃及）
  IT: { name: 'Tigerair Taiwan', country: 'Taiwan', nameZh: '台灣虎航' }, // 原 Kingfisher Airlines（已停業）
  GK: { name: 'Jetstar Japan', country: 'Japan', nameZh: '捷星日本' }, // 原 Genesis（巴基斯坦）
  ZG: { name: 'ZIPAIR Tokyo', country: 'Japan', nameZh: 'ZIPAIR' }, // 原 Viva Macau（已停業）
  '6J': { name: 'Solaseed Air', country: 'Japan' }, // Skynet Asia 2015 更名
  '9C': { name: 'Spring Airlines', country: 'China', nameZh: '春秋航空' }, // 原資料名稱錯誤（China SSS）
  RS: { name: 'Air Seoul', country: 'South Korea', nameZh: '首爾航空' }, // 原 Sky Regional（加拿大）
  TR: { name: 'Scoot', country: 'Singapore', nameZh: '酷航' }, // Tigerair 2017 併入 Scoot 後沿用 TR
  VZ: { name: 'Thai Vietjet Air', country: 'Thailand', nameZh: '泰國越捷航空' }, // 原 MyTravel（已停業）
  VJ: { name: 'VietJet Air', country: 'Vietnam', nameZh: '越捷航空' }, // 原 Royal Air Cambodge（已停業）
  QH: { name: 'Bamboo Airways', country: 'Vietnam', nameZh: '越竹航空' }, // 原 Air Florida（已停業）
  FJ: { name: 'Fiji Airways', country: 'Fiji', nameZh: '斐濟航空' }, // Air Pacific 2013 更名
  AZ: { name: 'ITA Airways', country: 'Italy', nameZh: '義大利ITA航空' }, // Alitalia 2021 停業後由 ITA 接手
  OD: { name: 'Batik Air Malaysia', country: 'Malaysia', nameZh: '馬印航空' }, // Malindo 2022 更名
  KA: { country: 'Hong Kong', defunct: true }, // 國泰港龍 2020 停業；原資料 country 欄壞值
  AS: { country: 'United States' }, // 原資料 country 欄壞值（ALASKA）
  GE: { defunct: true }, // 復興航空 2016 停業
  MI: { defunct: true }, // 勝安航空 2021 併入新航
  HB: { name: 'Greater Bay Airlines', country: 'Hong Kong', nameZh: '大灣區航空', defunct: false }, // 原 Harbor Airlines（已停業）
  RF: { name: 'Aero K', country: 'South Korea', defunct: false }, // 原 Florida West（已停業）
};

/** 人工補充：資料集缺漏的近年新航空（IATA 不存在、或被已停業者占碼時取代）。 */
const SUPPLEMENTS = [
  { iata: 'YP', name: 'Air Premia', nameZh: '普萊米亞航空', country: 'South Korea' },
];

const allianceByIata = new Map();
for (const [alliance, codes] of Object.entries(ALLIANCES)) {
  for (const code of codes) allianceByIata.set(code, alliance);
}

/** 解析一行 CSV（雙引號包裹、引號內可含逗號、`""` 跳脫）；OpenFlights 的 `\N` 視為 null。 */
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => (f === '\\N' ? null : f));
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.text();
}

async function buildAirlines() {
  const text = await fetchText(AIRLINES_URL);
  /** IATA → entry；撞碼時 active 者優先。 */
  const byIata = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    // 欄位：id, name, alias, iata, icao, callsign, country, active
    const [, name, , iata, icao, , country, active] = parseCsvLine(line);
    if (!name || !iata || !/^[A-Z0-9]{2}$/.test(iata)) continue;
    if (name === 'Unknown' || name === 'Private flight') continue;
    const entry = {
      iata,
      name,
      country: country || null,
      active: active === 'Y',
      hasIcao: Boolean(icao && /^[A-Z]{3}$/.test(icao)),
    };
    const prev = byIata.get(iata);
    // 優先序：active > 有 ICAO 代碼（撞碼多半是「現役 vs 已停業重用代碼」）
    if (!prev || (!prev.active && entry.active) || (prev.active === entry.active && !prev.hasIcao && entry.hasIcao)) {
      byIata.set(iata, entry);
    }
  }

  for (const s of SUPPLEMENTS) {
    const prev = byIata.get(s.iata);
    if (!prev || !prev.active) byIata.set(s.iata, { ...s, active: true });
  }

  const airlines = [...byIata.values()]
    .map((raw) => {
      const o = OVERRIDES[raw.iata] ?? {};
      const name = o.name ?? raw.name;
      const nameZh = o.nameZh ?? raw.nameZh ?? NAME_ZH[raw.iata];
      const country = o.country ?? raw.country;
      const defunct = o.defunct ?? !raw.active;
      return {
        iata: raw.iata,
        name,
        ...(nameZh ? { nameZh } : {}),
        country,
        ...(allianceByIata.has(raw.iata) ? { alliance: allianceByIata.get(raw.iata) } : {}),
        ...(defunct ? { defunct: true } : {}),
      };
    })
    .sort((a, b) => a.iata.localeCompare(b.iata));

  await writeFile(path.join(OUT_DIR, 'airlines.json'), JSON.stringify(airlines));
  return airlines.length;
}

async function buildAirports() {
  const text = await fetchText(AIRPORTS_URL);
  const lines = text.split('\n');
  const header = parseCsvLine(lines[0]);
  const col = (name) => header.indexOf(name);
  const [iName, iLat, iLon, iCountry, iCity, iScheduled, iIata, iType] = [
    col('name'), col('latitude_deg'), col('longitude_deg'), col('iso_country'),
    col('municipality'), col('scheduled_service'), col('iata_code'), col('type'),
  ];

  const airports = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = parseCsvLine(lines[i]);
    const iata = f[iIata];
    if (f[iScheduled] !== 'yes' || !iata || !/^[A-Z]{3}$/.test(iata)) continue;
    if (f[iType] === 'closed') continue;
    const lat = Number(f[iLat]);
    const lon = Number(f[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    airports.push({
      iata,
      name: f[iName] || iata,
      city: f[iCity] || null,
      country: f[iCountry] || null,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
    });
  }
  airports.sort((a, b) => a.iata.localeCompare(b.iata));

  await writeFile(path.join(OUT_DIR, 'airports.json'), JSON.stringify(airports));
  return airports.length;
}

await mkdir(OUT_DIR, { recursive: true });
const [airlineCount, airportCount] = await Promise.all([buildAirlines(), buildAirports()]);
console.log(`airlines.json: ${airlineCount} 家（含已停業）`);
console.log(`airports.json: ${airportCount} 座（定期航班 + IATA 碼）`);
