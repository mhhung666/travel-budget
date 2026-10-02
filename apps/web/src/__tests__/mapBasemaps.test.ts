import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { basemapFor, TILE_ERROR_THRESHOLD, TRANSPARENT_TILE } from '@/components/map/basemaps';

describe('map basemaps', () => {
  it('serves both themes from a key-free source that is not CARTO', () => {
    for (const isDark of [false, true]) {
      const source = basemapFor(isDark);
      // CARTO 會在沒有 API key 的圖磚壓上浮水印（UX_IMPROVEMENTS 第 2 項）。
      expect(source.base).not.toContain('cartocdn');
      expect(source.base).not.toMatch(/api[-_]?key|access[-_]?token/i);
      // 地名是獨立一層，缺了地圖上就沒有地名。
      expect(source.reference).toBeTruthy();
      expect(source.attribution).toContain('OpenStreetMap');
    }
    expect(basemapFor(true).base).not.toBe(basemapFor(false).base);
  });

  it('falls back to a different source, dimmed for the dark theme', () => {
    const fallback = basemapFor(false, true);
    expect(fallback.base).not.toBe(basemapFor(false).base);
    expect(fallback.base).toContain('tile.openstreetmap.org');
    expect(basemapFor(true, true).invert).toBe(true);
    expect(basemapFor(false, true).invert).toBeFalsy();
    // 備援要撐得住幾張圖磚的偶發失敗，才不會一閃就換掉底圖。
    expect(TILE_ERROR_THRESHOLD).toBeGreaterThan(1);
    expect(TRANSPARENT_TILE.startsWith('data:image/')).toBe(true);
  });

  it('keeps the service worker tile cache pointed at the hosts actually used', () => {
    // sw.ts 以正規表示式比對 hostname，比對前先去掉跳脫用的反斜線。
    const sw = readFileSync('src/sw.ts', 'utf8').replace(/\\/g, '');
    const hosts = new Set(
      [
        basemapFor(false),
        basemapFor(true),
        basemapFor(false, true),
        basemapFor(true, true),
      ].flatMap((source) =>
        [source.base, source.reference]
          .filter((url): url is string => !!url)
          .map((url) => new URL(url.replace(/\{[^}]+\}/g, '0')).hostname)
      )
    );
    for (const host of hosts) expect(sw).toContain(host);
  });
});
