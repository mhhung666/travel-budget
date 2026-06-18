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

/**
 * 兩座標點間的大圓距離（公里）。haversine 公式，地球半徑取 6371km。
 * 用於旅程數據儀表板的「總里程」累計。
 */
export function haversineKm(from: [number, number], to: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to[0] - from[0]);
  const dLon = toRad(to[1] - from[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 航線中段的座標與螢幕航向角（度），給飛機圖示用。
 * 螢幕座標：x=經度（東為正），y=緯度（北為正、但螢幕向下），故 y 取負。
 * 角度 0 = 朝右（東），與「機頭朝右」的圖示對齊。
 */
export function routeHeading(positions: [number, number][]): {
  position: [number, number];
  angle: number;
} {
  const mid = Math.floor(positions.length / 2);
  const a = positions[Math.max(0, mid - 1)];
  const b = positions[Math.min(positions.length - 1, mid + 1)];
  const angle = (Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * 180) / Math.PI;
  return { position: positions[mid], angle };
}
