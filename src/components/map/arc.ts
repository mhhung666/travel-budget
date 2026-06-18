/**
 * 把兩點之間畫成拋物線狀的弧（航線感），而非直線。
 *
 * 做法：取弦的中點往「垂直於弦」的方向偏移一個控制點，用二次貝茲曲線插值出
 * 一串座標丟給 Leaflet 的 Polyline。緯/經度在小範圍內當平面座標處理，視覺上
 * 足夠；偏移方向固定（同一側），讓所有航線彎曲方向一致、不互相打架。
 */
export function arcPositions(
  from: [number, number],
  to: [number, number],
  bend = 0.18,
  segments = 64
): [number, number][] {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;
  // 弦向量 (Δlat, Δlon)；其垂直向量取 (-Δlon, Δlat)，控制點沿此偏移，弧高與弦長成比例。
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const ctrlLat = midLat - dLon * bend;
  const ctrlLon = midLon + dLat * bend;

  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const lat = mt * mt * lat1 + 2 * mt * t * ctrlLat + t * t * lat2;
    const lon = mt * mt * lon1 + 2 * mt * t * ctrlLon + t * t * lon2;
    pts.push([lat, lon]);
  }
  return pts;
}

/**
 * 弧線中段的座標與螢幕旋轉角（度），給方向箭頭用。
 * 螢幕座標：x=經度（東為正），y=緯度（北為正、但螢幕向下），故 y 取負。
 */
export function arcArrow(positions: [number, number][]): {
  position: [number, number];
  angle: number;
} {
  const mid = Math.floor(positions.length / 2);
  const a = positions[Math.max(0, mid - 1)];
  const b = positions[Math.min(positions.length - 1, mid + 1)];
  const angle = (Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * 180) / Math.PI;
  return { position: positions[mid], angle };
}
