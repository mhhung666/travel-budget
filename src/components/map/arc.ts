/**
 * 把兩點之間畫成「大圓航線」（great-circle）——地球表面的最短路徑，
 * 也就是飛機實際飛的路線。在 Web Mercator 地圖上會自然往極地方向凸出彎曲，
 * 視覺上就是常見的航線弧。
 *
 * 用球面線性插值（slerp）沿大圓取點，再丟給 Leaflet 的 Polyline。
 * 跨換日線（±180° 經線）時對經度做 unwrap，讓線走最短側、不會橫跨整張地圖。
 */
export function greatCirclePositions(
  from: [number, number],
  to: [number, number],
  segments = 72
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const lat1 = toRad(from[0]);
  const lon1 = toRad(from[1]);
  const lat2 = toRad(to[0]);
  const lon2 = toRad(to[1]);

  // 兩點間的角距離（haversine）。
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    );

  if (d === 0 || Number.isNaN(d)) return [from, to];

  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    pts.push([toDeg(lat), toDeg(lon)]);
  }

  // 經度 unwrap：相鄰點若跳超過 180°，補 ±360° 使線連續（跨換日線走最短側）。
  for (let i = 1; i < pts.length; i++) {
    let delta = pts[i][1] - pts[i - 1][1];
    while (delta > 180) {
      pts[i][1] -= 360;
      delta = pts[i][1] - pts[i - 1][1];
    }
    while (delta < -180) {
      pts[i][1] += 360;
      delta = pts[i][1] - pts[i - 1][1];
    }
  }

  return pts;
}

// `haversineKm` 已抽到 lib 層（[lib/geo.ts]，讓非元件程式碼也能用）；此處 re-export
// 維持既有 import 路徑（components/map/stats.ts 等）不變。
export { haversineKm } from '@/lib/geo';
