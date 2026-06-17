'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { LatLngBounds, divIcon } from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import type { TripPoint } from './types';
import { countryCodeToFlag, countryColor } from './country';

interface TripMapCanvasProps {
  points: TripPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// 主題感應底圖：淺色用 CartoDB Positron、深色用 Dark Matter。
const BASEMAPS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

/** 初次載入時把視野框到所有點；點數變動時重框。 */
function FitBounds({ points }: { points: TripPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 6);
      return;
    }
    const bounds = new LatLngBounds(points.map((p) => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [48, 48] });
  }, [map, points]);
  return null;
}

/** 選取的旅程改變時，平滑飛向該點。 */
function FlyToSelected({ points, selectedId }: { points: TripPoint[]; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const target = points.find((p) => p.id === selectedId);
    if (target) {
      map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 7), { duration: 0.8 });
    }
  }, [map, points, selectedId]);
  return null;
}

/** 帶編號的圓形圖釘（DivIcon，免外部圖檔），顏色依國家。 */
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

export default function TripMapCanvas({ points, selectedId, onSelect }: TripMapCanvasProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // 依時間順序串成路線（points 已由呼叫端排序）。
  const path = points.map((p) => [p.lat, p.lon] as [number, number]);

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
      <FitBounds points={points} />
      <FlyToSelected points={points} selectedId={selectedId} />

      {path.length >= 2 && (
        <Polyline
          positions={path}
          pathOptions={{
            color: isDark ? '#93c5fd' : '#2563eb',
            weight: 2,
            opacity: 0.6,
            dashArray: '6 6',
          }}
        />
      )}

      {points.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          icon={numberedIcon(i + 1, countryColor(p.countryCode), p.id === selectedId)}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -16]}>
            {countryCodeToFlag(p.countryCode)} {p.name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
