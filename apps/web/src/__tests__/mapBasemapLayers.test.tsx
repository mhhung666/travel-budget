import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import TripMapCanvas from '@/components/map/TripMapCanvas';
import { basemapFor, TILE_ERROR_THRESHOLD } from '@/components/map/basemaps';

/** 每個 TileLayer 的 props；tileerror 用來模擬圖磚載入失敗。 */
interface TileProps {
  url: string;
  crossOrigin?: string;
  zIndex?: number;
  eventHandlers?: { tileerror?: () => void };
}

const tiles: TileProps[] = [];

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TileLayer: (props: TileProps) => {
    tiles.push(props);
    return null;
  },
  Marker: () => null,
  Polyline: () => null,
  Tooltip: () => null,
  useMap: () => ({ setView: () => {}, fitBounds: () => {} }),
}));
vi.mock('react-leaflet-cluster', () => ({ default: () => null }));
vi.mock('@/components/map/HeatLayer', () => ({ default: () => null }));
vi.mock('@/components/map/CountriesLayer', () => ({ default: () => null }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));

beforeEach(() => {
  tiles.length = 0;
});
afterEach(cleanup);

/** 取出最近一次 render 推進來的圖磚層，並清空等下一輪。 */
function renderedTiles(): TileProps[] {
  const batch = [...tiles];
  tiles.length = 0;
  return batch;
}

/** 連續讓某一層的圖磚失敗到會換來源的次數，回傳最後看到的圖層。 */
function failTiles(pick: (layers: TileProps[]) => TileProps): TileProps[] {
  let layers = renderedTiles();
  for (let i = 0; i < TILE_ERROR_THRESHOLD; i++) {
    act(() => pick(layers).eventHandlers?.tileerror?.());
    const next = renderedTiles();
    if (next.length > 0) layers = next;
  }
  return layers;
}

it('loads tiles with CORS so the service worker can cache them offline', () => {
  render(<TripMapCanvas mode="flights" />);
  const layers = renderedTiles();
  expect(layers).toHaveLength(2);
  // opaque 回應存不進 CacheFirst，離線就沒有底圖。
  for (const layer of layers) expect(layer.crossOrigin).toBe('anonymous');
});

it('switches to the fallback source when the label layer keeps failing', () => {
  render(<TripMapCanvas mode="flights" />);
  const layers = failTiles((tileLayers) => tileLayers[1]);

  expect(layers[0].url).toBe(basemapFor(false, true).base);
  // 備援只有一層，地名就在底圖上。
  expect(layers).toHaveLength(1);
});

it('switches to the fallback source when the base layer keeps failing', () => {
  render(<TripMapCanvas mode="flights" />);
  const layers = failTiles((tileLayers) => tileLayers[0]);

  expect(layers[0].url).toBe(basemapFor(false, true).base);
});

it('keeps the primary source while failures stay occasional', () => {
  render(<TripMapCanvas mode="flights" />);
  let layers = renderedTiles();
  for (let i = 0; i < TILE_ERROR_THRESHOLD - 1; i++) {
    act(() => layers[0].eventHandlers?.tileerror?.());
    const next = renderedTiles();
    if (next.length > 0) layers = next;
  }

  expect(layers[0].url).toBe(basemapFor(false).base);
  expect(layers).toHaveLength(2);
});
