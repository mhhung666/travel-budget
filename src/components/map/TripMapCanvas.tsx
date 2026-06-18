'use client';

import { Fragment, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { LatLngBounds, divIcon } from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import type { TripRoute, HeatPoint } from './types';
import { countryCodeToFlag, countryColor } from './country';
import { greatCirclePositions, routeHeading } from './arc';
import HeatLayer from './HeatLayer';
import CountriesLayer from './CountriesLayer';

export type MapMode = 'routes' | 'heat' | 'countries';

interface TripMapCanvasProps {
  mode?: MapMode;
  routes: TripRoute[];
  /** 熱點資料（mode === 'heat' 時使用）。 */
  heatPoints?: HeatPoint[];
  /** 已造訪國家 alpha-2 集合（mode === 'countries' 時上色用）。 */
  visitedCountries?: Set<string>;
  /**
   * 時間軸回放：只顯示前 N 條路線（依時間排序）。undefined = 顯示全部。
   * 播放時逐條揭露，營造足跡展開的動畫。
   */
  revealCount?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// 主題感應底圖：淺色用 CartoDB Positron、深色用 Dark Matter。
const BASEMAPS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

/** 收集所有路線涉及的座標（出發地 + 目的地）。 */
function allCoords(routes: TripRoute[]): [number, number][] {
  const coords: [number, number][] = [];
  for (const r of routes) {
    if (r.departure) coords.push([r.departure.lat, r.departure.lon]);
    if (r.destination) coords.push([r.destination.lat, r.destination.lon]);
  }
  return coords;
}

/** 初次載入時把視野框到所有點；座標變動時重框。 */
function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  // 以座標字串為依賴，避免每次 render 都重框。
  const key = coords.map((c) => c.join(',')).join('|');
  useEffect(() => {
    if (coords.length === 0) return;
    if (coords.length === 1) {
      map.setView(coords[0], 6);
      return;
    }
    map.fitBounds(new LatLngBounds(coords), { padding: [48, 48] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** 選取的旅程改變時，平滑飛向其目的地。 */
function FlyToSelected({ routes, selectedId }: { routes: TripRoute[]; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const target = routes.find((r) => r.id === selectedId)?.destination;
    if (target) {
      map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 7), { duration: 0.8 });
    }
  }, [map, routes, selectedId]);
  return null;
}

/** 目的地圖釘：依國家上色的圓點 + 國旗，不帶數字（順序交給時間軸與箭頭）。 */
function destinationIcon(color: string, flag: string, active: boolean) {
  const size = active ? 30 : 22;
  return divIcon({
    className: 'trip-map-pin',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      font-size:${active ? 15 : 12}px;line-height:1;
      ${active ? 'outline:3px solid rgba(37,99,235,.5);' : ''}
    ">${flag}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 出發地用的小型空心圓點。 */
function departureIcon(color: string) {
  const size = 12;
  return divIcon({
    className: 'trip-map-pin',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:#fff;
      border:3px solid ${color};
      border-radius:50%;
      box-shadow:0 1px 3px rgba(0,0,0,.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 航線中段的小飛機（機頭朝右的圖示，依航向角旋轉）。 */
function planeIcon(color: string, angle: number) {
  return divIcon({
    className: 'trip-map-plane',
    html: `<div style="transform:rotate(${angle}deg);width:18px;height:18px;">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="${color}" stroke="#fff" stroke-width="1" stroke-linejoin="round"
          d="M2 5 L22 12 L2 19 L6 12 Z" />
      </svg>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function TripMapCanvas({
  mode = 'routes',
  routes,
  heatPoints = [],
  visitedCountries,
  revealCount,
  selectedId,
  onSelect,
}: TripMapCanvasProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const lineColor = isDark ? '#93c5fd' : '#2563eb';

  const isHeat = mode === 'heat';
  const isCountries = mode === 'countries';
  // 回放時只畫前 N 條；其餘模式畫全部。
  const visibleRoutes = revealCount === undefined ? routes : routes.slice(0, revealCount);
  const isRoutes = !isHeat && !isCountries;
  const fitCoords: [number, number][] = isHeat
    ? heatPoints.map((p) => [p.lat, p.lon])
    : allCoords(routes);
  const maxWeight = heatPoints.reduce((m, p) => Math.max(m, p.weight), 0);
  const heatTuples = heatPoints.map((p) => [p.lat, p.lon, p.weight] as [number, number, number]);

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
      worldCopyJump
    >
      <TileLayer
        key={isDark ? 'dark' : 'light'}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={isDark ? BASEMAPS.dark : BASEMAPS.light}
      />
      <FitBounds coords={fitCoords} />

      {isHeat && <HeatLayer points={heatTuples} max={maxWeight} />}

      {isCountries && <CountriesLayer visited={visitedCountries ?? new Set()} isDark={isDark} />}

      {isRoutes && <FlyToSelected routes={visibleRoutes} selectedId={selectedId} />}

      {/* 弧線、箭頭與出發地點（不進群聚，屬輔助圖層） */}
      {isRoutes &&
        visibleRoutes.map((r) => {
          if (!r.destination || !r.departure) return null;
          const active = r.id === selectedId;
          const color = countryColor(r.destination.countryCode);
          const positions = greatCirclePositions(
            [r.departure.lat, r.departure.lon],
            [r.destination.lat, r.destination.lon]
          );
          const heading = routeHeading(positions);
          return (
            <Fragment key={`arc-${r.id}`}>
              <Polyline
                positions={positions}
                pathOptions={{
                  color: lineColor,
                  weight: active ? 3 : 2,
                  opacity: active ? 0.9 : 0.55,
                }}
                eventHandlers={{ click: () => onSelect(r.id) }}
              />
              <Marker
                position={heading.position}
                icon={planeIcon(lineColor, heading.angle)}
                interactive={false}
              />
              <Marker
                position={[r.departure.lat, r.departure.lon]}
                icon={departureIcon(color)}
                eventHandlers={{ click: () => onSelect(r.id) }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {countryCodeToFlag(r.departure.countryCode)} {r.departure.name}
                </Tooltip>
              </Marker>
            </Fragment>
          );
        })}

      {/* 目的地圖釘：群聚以避免重疊看不見，縮小時聚合成數量氣泡、放大或點擊展開 */}
      {isRoutes && (
        <MarkerClusterGroup chunkedLoading showCoverageOnHover={false} maxClusterRadius={40}>
          {visibleRoutes.map((r) => {
            if (!r.destination) return null;
            const active = r.id === selectedId;
            const color = countryColor(r.destination.countryCode);
            return (
              <Marker
                key={`dest-${r.id}`}
                position={[r.destination.lat, r.destination.lon]}
                icon={destinationIcon(color, countryCodeToFlag(r.destination.countryCode), active)}
                eventHandlers={{ click: () => onSelect(r.id) }}
              >
                <Tooltip direction="top" offset={[0, -14]}>
                  {/* 去識別化分享情境沒有旅行名稱，只顯示地點。 */}
                  {r.name ? `${r.name} — ` : ''}
                  {countryCodeToFlag(r.destination.countryCode)} {r.destination.name}
                </Tooltip>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      )}
    </MapContainer>
  );
}
