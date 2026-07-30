'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import {
  LatLngBounds,
  divIcon,
  type Marker as LeafletMarker,
  type LeafletMouseEvent,
} from 'leaflet';
import { useTheme } from 'next-themes';
import 'leaflet/dist/leaflet.css';
import type { TripDestinationPoint, HeatPoint, FlightSegment } from './types';
import { mergePhotoPins, type PhotoPin } from './photos';
import { countryCodeToFlag, countryColor } from './country';
import { greatCirclePositions } from './arc';
import HeatLayer from './HeatLayer';
import CountriesLayer from './CountriesLayer';

export type MapMode = 'flights' | 'heat' | 'countries' | 'photos';

interface TripMapCanvasProps {
  mode?: MapMode;
  /** 旅行主要目的地；國家模式顯示點位，不畫交通線。 */
  destinations?: TripDestinationPoint[];
  /** 飛行航段（mode === 'flights' 時使用；登入限定、不進公開分享）。 */
  flightSegments?: FlightSegment[];
  /** 目前由地圖或左側清單選取的航線。 */
  selectedFlightKey?: string | null;
  /** 點擊航線時同步選取狀態。 */
  onFlightSelect?: (key: string | null) => void;
  /** 熱點資料（mode === 'heat' 時使用）。 */
  heatPoints?: HeatPoint[];
  /** 已造訪國家 alpha-2 集合（mode === 'countries' 時上色用）。 */
  visitedCountries?: Set<string>;
  /** 相片釘點（mode === 'photos' 時使用）。 */
  photoPins?: PhotoPin[];
  /** 點擊相片釘點（開啟該點的相片 gallery）。 */
  onPhotoPinSelect?: (pin: PhotoPin) => void;
}

// 主題感應底圖：淺色用 CartoDB Positron、深色用 Dark Matter。
const BASEMAPS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

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

/** 目的地圖釘：代表旅行主要目的地，不暗示交通方式。 */
function destinationIcon(color: string, flag: string) {
  const size = 22;
  return divIcon({
    className: 'trip-map-pin',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      font-size:12px;line-height:1;
    ">${flag}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 飛行航線圖的機場點：實心小圓（用主線色），tooltip 顯示 IATA + 城市。 */
function airportIcon(color: string) {
  const size = 10;
  return divIcon({
    className: 'trip-map-pin',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 1px 3px rgba(0,0,0,.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 相片卡片的尺寸（含底部尖角），tooltip offset 與 iconAnchor 共用。 */
const PHOTO_CARD = 56;
const PHOTO_TAIL = 8;

/**
 * 相片釘點：iPhone 相簿風格的縮圖卡片——白框圓角縮圖 + 左下相片數 + 底部尖角。
 * 單一釘點與 cluster 聚合共用同一款，縮放合併／散開時視覺連續。
 * 縮圖（登入限定的 presigned `_t.webp`）載入失敗時自我移除，露出底下的相機圖示墊底。
 */
function photoCardIcon(thumbUrl: string, count: number) {
  const size = PHOTO_CARD;
  const tail = PHOTO_TAIL;
  const safeUrl = thumbUrl.replace(/"/g, '&quot;');
  return divIcon({
    className: 'trip-map-photo-pin',
    html: `<div style="width:${size}px;height:${size + tail}px;filter:drop-shadow(0 2px 5px rgba(0,0,0,.45));">
      <div style="
        position:relative;
        width:${size}px;height:${size}px;
        background:#64748b;
        border:2.5px solid #fff;
        border-radius:12px;
        overflow:hidden;
        display:flex;align-items:center;justify-content:center;
      ">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
        ${
          safeUrl
            ? `<img src="${safeUrl}" alt="" loading="lazy" draggable="false" onerror="this.remove()"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>`
            : ''
        }
        ${
          count > 1
            ? `<span style="
          position:absolute;left:5px;bottom:4px;
          color:#fff;font-size:12px;font-weight:700;line-height:1;
          text-shadow:0 1px 3px rgba(0,0,0,.9);">${count}</span>`
            : ''
        }
      </div>
      <div style="
        margin:-1px auto 0;width:0;height:0;
        border-left:${tail}px solid transparent;
        border-right:${tail}px solid transparent;
        border-top:${tail}px solid #fff;"></div>
    </div>`,
    iconSize: [size, size + tail],
    // 尖角尖端對準座標。
    iconAnchor: [size / 2, size + tail],
  });
}

/**
 * 掛在相片 Marker options 上的自訂欄位（react-leaflet 會把多餘 props spread 進
 * `L.Marker` 建構 options），讓 cluster 的 iconCreateFunction 與點擊處理直接從
 * child markers 彙總，不依賴會過期的外部 closure。
 */
interface PhotoMarkerData {
  photoPin: PhotoPin;
}

/**
 * 相片聚合圖示：取群內相片數最多的釘點縮圖當代表，數字顯示相片總數。
 * 與單點卡片同款（iPhone 相簿行為：拉遠合併成一張卡、拉近散開）。
 * cluster 型別來自 leaflet.markercluster（無型別套件），此處以結構型別最小宣告。
 */
function photoClusterIcon(cluster: { getAllChildMarkers(): LeafletMarker[] }) {
  let total = 0;
  let bestCount = -1;
  let thumb = '';
  for (const m of cluster.getAllChildMarkers()) {
    const pin = (m.options as Partial<PhotoMarkerData>).photoPin;
    if (!pin) continue;
    total += pin.photos.length;
    const t = pin.photos[0]?.thumb_url;
    if (t && pin.photos.length > bestCount) {
      bestCount = pin.photos.length;
      thumb = t;
    }
  }
  return photoCardIcon(thumb, total);
}

/**
 * 相片模式圖層：縮圖卡片釘點 + 近點聚合（50m 內的合併已在資料層 groupPhotoPins 做掉，
 * 這裡的 cluster 只處理更遠釘點在低縮放時的視覺重疊）。
 * cluster 點擊：還能放大時交給預設 zoomToBounds 繼續拉近；已在最大縮放時（過去會
 * spiderfy 散開成一堆單張卡片）改為把群內所有釘點合併成臨時釘點、直接開整組相片的
 * gallery——iPhone 相簿的行為。獨立成元件是為了 useMap 拿縮放狀態。
 */
function PhotoPinsLayer({
  pins,
  onSelect,
}: {
  pins: PhotoPin[];
  onSelect?: (pin: PhotoPin) => void;
}) {
  const map = useMap();
  const onClusterClick = (e: LeafletMouseEvent) => {
    if (map.getZoom() < map.getMaxZoom()) return; // 還能放大：交給預設 zoomToBounds
    const cluster = e.propagatedFrom as { getAllChildMarkers(): LeafletMarker[] };
    const memberPins = cluster
      .getAllChildMarkers()
      .map((m) => (m.options as Partial<PhotoMarkerData>).photoPin)
      .filter((p): p is PhotoPin => p !== undefined);
    if (memberPins.length > 0) onSelect?.(mergePhotoPins(memberPins));
  };
  return (
    <MarkerClusterGroup
      chunkedLoading
      showCoverageOnHover={false}
      maxClusterRadius={72}
      iconCreateFunction={photoClusterIcon}
      spiderfyOnMaxZoom={false}
      onClick={onClusterClick}
    >
      {pins.map((pin) => {
        const thumb = pin.photos[0]?.thumb_url ?? '';
        // key 含首張相片與張數：年份篩選改變群內容時強制重建 marker，
        // 讓掛在 options 上的 PhotoMarkerData 不會過期（react-leaflet 更新時不重寫 options）。
        return (
          <Marker
            key={`photo-${pin.id}-${pin.photos[0]?.id ?? ''}-${pin.photos.length}`}
            position={[pin.lat, pin.lon]}
            icon={photoCardIcon(thumb, pin.photos.length)}
            eventHandlers={{ click: () => onSelect?.(pin) }}
            {...({ photoPin: pin } satisfies PhotoMarkerData)}
          >
            <Tooltip direction="top" offset={[0, -(PHOTO_CARD + PHOTO_TAIL + 2)]}>
              {countryCodeToFlag(pin.countryCode)} {pin.name}
            </Tooltip>
          </Marker>
        );
      })}
    </MarkerClusterGroup>
  );
}

/** 目的地聚合的數量氣泡（markercluster 預設 CSS 未載入，樣式自己畫）。 */
function destinationClusterIcon(cluster: { getChildCount(): number }) {
  const size = 34;
  return divIcon({
    className: 'trip-map-pin',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:#2563eb;
      border:2px solid #fff;
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:13px;font-weight:600;">${cluster.getChildCount()}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function TripMapCanvas({
  mode = 'flights',
  destinations = [],
  flightSegments = [],
  selectedFlightKey = null,
  onFlightSelect,
  heatPoints = [],
  visitedCountries,
  photoPins = [],
  onPhotoPinSelect,
}: TripMapCanvasProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const lineColor = isDark ? '#93c5fd' : '#2563eb';
  const selectedLineColor = isDark ? '#fb923c' : '#ea580c';

  const isHeat = mode === 'heat';
  const isCountries = mode === 'countries';
  const isPhotos = mode === 'photos';
  const isFlights = mode === 'flights';
  // 飛行模式的機場點（去重；tooltip / fit 視野用）。
  const flightAirports = (() => {
    if (!isFlights) return [];
    const map = new Map<string, FlightSegment['from']>();
    for (const s of flightSegments) {
      map.set(s.from.iata, s.from);
      map.set(s.to.iata, s.to);
    }
    return [...map.values()];
  })();
  const fitCoords: [number, number][] = isHeat
    ? heatPoints.map((p) => [p.lat, p.lon])
    : isPhotos
      ? photoPins.map((p) => [p.lat, p.lon])
      : isFlights
        ? flightAirports.map((a) => [a.lat, a.lon])
        : destinations.map((destination) => [destination.lat, destination.lon]);
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

      {/* 相片釘點：縮圖卡片，近點聚合成同款卡片（radius 涵蓋卡片寬避免重疊），點擊開啟 gallery。 */}
      {isPhotos && <PhotoPinsLayer pins={photoPins} onSelect={onPhotoPinSelect} />}

      {/* 飛行航線：預設保持低干擾，滑過或選取時才強調；往返已合併為單一路線。 */}
      {isFlights &&
        flightSegments.map((s) => {
          const positions = greatCirclePositions([s.from.lat, s.from.lon], [s.to.lat, s.to.lon]);
          const selected = selectedFlightKey === s.key;
          const baseWeight = Math.min(1.25 + Math.log2(s.count + 1) * 0.55, 3);
          const baseStyle = {
            color: selected ? selectedLineColor : lineColor,
            weight: selected ? Math.max(baseWeight + 1.25, 3) : baseWeight,
            opacity: selected ? 0.9 : 0.38,
          };
          return (
            <Polyline
              key={`flight-${s.key}`}
              positions={positions}
              pathOptions={baseStyle}
              eventHandlers={{
                mouseover: (event) => {
                  event.target.setStyle({
                    weight: Math.max(baseWeight + 1.25, 3),
                    opacity: 0.9,
                  });
                  event.target.bringToFront();
                },
                mouseout: (event) => event.target.setStyle(baseStyle),
                click: () => onFlightSelect?.(selected ? null : s.key),
              }}
            >
              <Tooltip sticky>
                <span className="font-mono">
                  {s.from.iata} ⇄ {s.to.iata}
                </span>
                <br />
                <span className="text-xs">
                  {s.from.name} ⇄ {s.to.name} · ×{s.count}
                </span>
              </Tooltip>
            </Polyline>
          );
        })}
      {isFlights &&
        flightAirports.map((a) => (
          <Marker key={`airport-${a.iata}`} position={[a.lat, a.lon]} icon={airportIcon(lineColor)}>
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="font-mono">{a.iata}</span> · {a.name}
            </Tooltip>
          </Marker>
        ))}

      {/* 國家模式同時顯示旅行主要目的地，但不以弧線暗示實際交通方式。 */}
      {isCountries && (
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          maxClusterRadius={40}
          iconCreateFunction={destinationClusterIcon}
        >
          {destinations.map((destination) => {
            const color = countryColor(destination.countryCode);
            return (
              <Marker
                key={`dest-${destination.id}`}
                position={[destination.lat, destination.lon]}
                icon={destinationIcon(color, countryCodeToFlag(destination.countryCode))}
              >
                <Tooltip direction="top" offset={[0, -14]}>
                  {destination.tripName ? `${destination.tripName} — ` : ''}
                  {countryCodeToFlag(destination.countryCode)} {destination.name}
                </Tooltip>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      )}
    </MapContainer>
  );
}
