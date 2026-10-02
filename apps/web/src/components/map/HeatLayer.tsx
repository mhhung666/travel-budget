'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface HeatLayerProps {
  /** [緯度, 經度, 強度]，強度建議為原始權重，搭配 max 做正規化。 */
  points: L.HeatLatLngTuple[];
  /** 對應 100% 熱度的權重；通常傳入所有點的最大權重。 */
  max?: number;
}

/**
 * 以 leaflet.heat 畫熱力圖。leaflet.heat 是原生 Leaflet plugin（非 react-leaflet
 * 元件），所以透過 useMap 取得地圖實例後手動掛載／卸載，與 react-leaflet 5 並用。
 */
export default function HeatLayer({ points, max }: HeatLayerProps) {
  const map = useMap();

  useEffect(() => {
    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 20,
      max: max && max > 0 ? max : 1,
      minOpacity: 0.25,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, max]);

  return null;
}
