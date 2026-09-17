/**
 * 地圖底圖來源（docs/UX_IMPROVEMENTS.md 第 2 項）。
 *
 * 原本用 CARTO 的免金鑰 basemap（light_all / dark_all），但 CARTO 現在會在所有未帶
 * API key 的圖磚上壓「API KEY REQUIRED」浮水印（2026-09-17 直接抓圖磚確認，兩種主題皆是），
 * 使用者在地圖上看到的就是那張圖，不是網域或流量的問題。
 *
 * 改用同樣免金鑰、色調同樣淡的 Esri Gray Canvas。它把底圖和地名標註拆成兩層，
 * 兩層都疊上去才有地名。前端不放任何金鑰（CLAUDE.md：唯一的 NEXT_PUBLIC_ 是 VAPID 公鑰），
 * 所以不選 MapTiler／Stadia 這類要金鑰或要註冊網域的服務。
 */

export interface BasemapSource {
  /** 底圖圖磚（道路、水域、行政區塊）。 */
  base: string;
  /** 地名標註層；疊在底圖之上。沒有就只有底圖。 */
  reference?: string;
  attribution: string;
  /** 深色主題但來源只有亮色圖磚時，用 CSS 把圖磚調暗。 */
  invert?: boolean;
}

const ESRI_CANVAS = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas';
const OSM_LINK = '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI_ATTRIBUTION = `Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, &copy; ${OSM_LINK} contributors`;
const OSM_ATTRIBUTION = `&copy; ${OSM_LINK} contributors`;

const BASEMAPS: Record<'light' | 'dark', BasemapSource> = {
  light: {
    base: `${ESRI_CANVAS}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    reference: `${ESRI_CANVAS}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
  },
  dark: {
    base: `${ESRI_CANVAS}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    reference: `${ESRI_CANVAS}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
  },
};

/**
 * 主要來源連不上時的備援：OSM 標準圖磚（單層、含地名、免金鑰）。
 * 深色主題沒有對應的來源，改用 CSS 反相調暗，總比整片白或破圖好。
 */
const FALLBACK_BASEMAPS: Record<'light' | 'dark', BasemapSource> = {
  light: { base: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: OSM_ATTRIBUTION },
  dark: {
    base: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    invert: true,
  },
};

/** 累積這麼多張圖磚載入失敗才換備援：單張失敗通常只是網路抖動或超出範圍。 */
export const TILE_ERROR_THRESHOLD = 6;

/** 載入失敗的圖磚用透明 1×1 蓋掉，露出地圖的中性底色，不顯示破圖。 */
export const TRANSPARENT_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** 取得目前該用的底圖：`fallback` 為 true 時回備援來源。 */
export function basemapFor(isDark: boolean, fallback = false): BasemapSource {
  const sources = fallback ? FALLBACK_BASEMAPS : BASEMAPS;
  return isDark ? sources.dark : sources.light;
}
