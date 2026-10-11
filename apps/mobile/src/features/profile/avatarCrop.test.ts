import { expect, it } from 'vitest';
import { centerCrop, constrainCrop, cropGeometry, cropRectangle, moveCrop } from './avatarCrop';

it.each([
  [
    { width: 3000, height: 4000 },
    { originX: 0, originY: 500, width: 3000, height: 3000 },
  ],
  [
    { width: 4000, height: 3000 },
    { originX: 500, originY: 0, width: 3000, height: 3000 },
  ],
  [
    { width: 511, height: 511 },
    { originX: 0, originY: 0, width: 511, height: 511 },
  ],
])('centers portrait, landscape and small square sources', (size, rect) => {
  expect(cropRectangle(size, centerCrop(size))).toEqual(rect);
});
it('preserves the point underneath a pinch and translates in the direction of the dragged image', () => {
  const size = { width: 800, height: 1200 },
    initial = centerCrop(size),
    pivot = { x: 300, y: 250 },
    before = cropGeometry(size, initial, 400),
    zoomed = moveCrop(size, initial, 400, pivot, pivot, 2),
    after = cropGeometry(size, zoomed, 400);
  expect((pivot.x - before.left) / before.scale).toBeCloseTo((pivot.x - after.left) / after.scale);
  expect((pivot.y - before.top) / before.scale).toBeCloseTo((pivot.y - after.top) / after.scale);
  const dragged = moveCrop(size, zoomed, 400, { x: 200, y: 200 }, { x: 250, y: 180 });
  expect(dragged.x).toBe(zoomed.x - 50);
  expect(dragged.y).toBe(zoomed.y + 20);
});
it('clamps zoom and panning, never exposing empty corners or producing an out-of-bounds crop', () => {
  for (const size of [
    { width: 2048, height: 1535 },
    { width: 301, height: 2048 },
    { width: 1, height: 1 },
  ]) {
    for (const x of [-10000, 0, size.width / 2, 10000]) {
      for (const y of [-10000, 10000]) {
        for (const zoom of [0.01, 1, 1.777, 4, 100]) {
          const p = constrainCrop(size, { x, y, zoom }),
            g = cropGeometry(size, p, 320),
            rect = cropRectangle(size, p);
          expect(p.zoom).toBeGreaterThanOrEqual(1);
          expect(p.zoom).toBeLessThanOrEqual(4);
          expect(g.left).toBeLessThanOrEqual(0.000001);
          expect(g.top).toBeLessThanOrEqual(0.000001);
          expect(g.left + g.width).toBeGreaterThanOrEqual(319.999999);
          expect(g.top + g.height).toBeGreaterThanOrEqual(319.999999);
          expect(Object.values(rect).every(Number.isInteger)).toBe(true);
          expect(rect.width).toBe(rect.height);
          expect(rect.width).toBeGreaterThan(0);
          expect(rect.originX).toBeGreaterThanOrEqual(0);
          expect(rect.originY).toBeGreaterThanOrEqual(0);
          expect(rect.originX + rect.width).toBeLessThanOrEqual(size.width);
          expect(rect.originY + rect.height).toBeLessThanOrEqual(size.height);
        }
      }
    }
  }
});
it('keeps source coordinates unchanged when iPad size or orientation changes', () => {
  const size = { width: 1500, height: 2048 },
    p = { x: 800, y: 1300, zoom: 2.5 },
    rect = cropRectangle(size, p);
  for (const side of [180, 360, 560]) {
    const g = cropGeometry(size, p, side);
    expect(-g.left / g.scale).toBeCloseTo(rect.originX);
    expect(-g.top / g.scale).toBeCloseTo(rect.originY);
    expect(side / g.scale).toBeCloseTo(rect.width);
  }
});
