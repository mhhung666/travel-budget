'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TripPoint } from './types';

interface TripMapCanvasProps {
  points: TripPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

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

export default function TripMapCanvas({ points, selectedId, onSelect }: TripMapCanvasProps) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      <FlyToSelected points={points} selectedId={selectedId} />
      {points.map((p) => {
        const active = p.id === selectedId;
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={active ? 11 : 8}
            pathOptions={{
              color: active ? '#2563eb' : '#3b82f6',
              fillColor: active ? '#2563eb' : '#60a5fa',
              fillOpacity: active ? 0.95 : 0.7,
              weight: active ? 3 : 2,
            }}
            eventHandlers={{ click: () => onSelect(p.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {p.name}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
