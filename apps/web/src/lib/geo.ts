/**
 * 純地理計算工具（無依賴、可單測）。
 *
 * 從 [components/map/arc.ts] 抽出，讓 lib 層（如 [yearInReview.ts]）能在不反向依賴
 * 元件層的情況下計算里程；arc.ts 仍 re-export `haversineKm` 供地圖元件沿用。
 */

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
