import { describe, expect, it } from 'vitest';
import { searchAirports, type SearchableAirport } from '@/lib/airportSearch';

// 目錄原順序刻意把名稱吻合放在代碼吻合前面，重現「輸入 TPE 第一筆卻是 MPL」。
const catalog: SearchableAirport[] = [
  { iata: 'MPL', name: 'Montpellier-Méditerranée Airport', city: 'Montpellier/Méditerranée' },
  { iata: 'TPA', name: 'Tampa International Airport', city: 'Tampa' },
  { iata: 'XTP', name: 'Tpexample Field', city: null },
  { iata: 'TPE', name: 'Taiwan Taoyuan International Airport', city: 'Taoyuan' },
  { iata: 'TPQ', name: 'Tepic International Airport', city: 'Tepic' },
];

const codes = (list: SearchableAirport[]) => list.map((a) => a.iata);

describe('searchAirports', () => {
  it('puts the exact code match first regardless of case', () => {
    expect(codes(searchAirports(catalog, 'TPE', 50))[0]).toBe('TPE');
    expect(codes(searchAirports(catalog, 'tpe', 50))[0]).toBe('TPE');
    expect(codes(searchAirports(catalog, ' tpe ', 50))).toEqual(['TPE', 'XTP', 'MPL']);
  });

  it('ranks code prefix before name start before name contains, keeping catalog order', () => {
    expect(codes(searchAirports(catalog, 'TP', 50))).toEqual(['TPA', 'TPE', 'TPQ', 'XTP', 'MPL']);
  });

  it('ranks city or name start above a substring match', () => {
    expect(codes(searchAirports(catalog, 'ta', 50))).toEqual(['TPA', 'TPE']);
    expect(codes(searchAirports(catalog, 'pellier', 50))).toEqual(['MPL']);
  });

  it('keeps code matches when name matches would fill the limit first', () => {
    const noise = Array.from({ length: 60 }, (_, i) => ({
      iata: `Z${String(i).padStart(2, '0')}`.slice(0, 3),
      name: `Airport Tpe ${i}`,
      city: null,
    }));
    const result = searchAirports([...noise, ...catalog], 'tpe', 50);
    expect(result).toHaveLength(50);
    expect(result[0].iata).toBe('TPE');
  });

  it('returns nothing for a blank query', () => {
    expect(searchAirports(catalog, '   ', 50)).toEqual([]);
  });
});
