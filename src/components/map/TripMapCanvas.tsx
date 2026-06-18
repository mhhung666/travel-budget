'use client';

import { Fragment, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { LatLngBounds, divIcon } from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import type { TripRoute } from './types';
import { countryCodeToFlag, countryColor } from './country';

interface TripMapCanvasProps {
  routes: TripRoute[];
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

/** 初次載入時把視野框到所有點；點數變動時重框。 */
function FitBounds({ routes }: { routes: TripRoute[] }) {
  const map = useMap();
  useEffect(() => {
    const coords = allCoords(routes);
    if (coords.length === 0) return;
    if (coords.length === 1) {
      map.setView(coords[0], 6);
      return;
    }
    map.fitBounds(new LatLngBounds(coords), { padding: [48, 48] });
  }, [map, routes]);
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

/** 帶編號的圓形圖釘（目的地，DivIcon 免外部圖檔），顏色依國家。 */
function numberedIcon(num: number, color: string, active: boolean) {
  const size = active ? 34 : 28;
  return divIcon({
    className: 'trip-map-pin',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,.4);
      color:#fff;font-weight:600;font-size:13px;
      display:flex;align-items:center;justify-content:center;
      ${active ? 'outline:3px solid rgba(37,99,235,.5);' : ''}
    ">${num}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 出發地用的小型空心圓點。 */
function departureIcon(color: string) {
  const size = 14;
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

export default function TripMapCanvas({ routes, selectedId, onSelect }: TripMapCanvasProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const lineColor = isDark ? '#93c5fd' : '#2563eb';

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
      <FitBounds routes={routes} />
      <FlyToSelected routes={routes} selectedId={selectedId} />

      {routes.map((r, i) => {
        if (!r.destination) return null;
        const active = r.id === selectedId;
        const color = countryColor(r.destination.countryCode);
        return (
          <Fragment key={r.id}>
            {/* 出發地 → 目的地 連線 */}
            {r.departure && (
              <Polyline
                positions={[
                  [r.departure.lat, r.departure.lon],
                  [r.destination.lat, r.destination.lon],
                ]}
                pathOptions={{
                  color: lineColor,
                  weight: active ? 3 : 2,
                  opacity: active ? 0.9 : 0.6,
                  dashArray: '6 6',
                }}
                eventHandlers={{ click: () => onSelect(r.id) }}
              />
            )}

            {/* 出發地圖釘 */}
            {r.departure && (
              <Marker
                position={[r.departure.lat, r.departure.lon]}
                icon={departureIcon(color)}
                eventHandlers={{ click: () => onSelect(r.id) }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {countryCodeToFlag(r.departure.countryCode)} {r.departure.name}
                </Tooltip>
              </Marker>
            )}

            {/* 目的地圖釘（帶編號） */}
            <Marker
              position={[r.destination.lat, r.destination.lon]}
              icon={numberedIcon(i + 1, color, active)}
              eventHandlers={{ click: () => onSelect(r.id) }}
            >
              <Tooltip direction="top" offset={[0, -16]}>
                {countryCodeToFlag(r.destination.countryCode)} {r.destination.name}
              </Tooltip>
            </Marker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
