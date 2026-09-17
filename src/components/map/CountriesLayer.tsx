'use client';

import { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import { useLocale } from 'next-intl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { countryCodeToFlag, countryColor } from './country';

/** 國界 feature 的精簡屬性（見 public/geo/countries.geojson 的產生步驟）。 */
interface CountryProps {
  iso_a2: string;
  name: string;
  name_zh?: string;
  name_zhCN?: string;
  name_ja?: string;
}

interface CountriesLayerProps {
  /** 已造訪國家的 alpha-2 國碼集合（大寫）。 */
  visited: Set<string>;
  /** 只出現在計畫中旅程的國碼：淡色虛線，不算點亮。 */
  planned?: Set<string>;
  /** 計畫中國家 tooltip 後綴（已翻譯）。 */
  plannedLabel?: string;
  isDark: boolean;
}

const EMPTY_SET = new Set<string>();

let cache: FeatureCollection<Geometry, CountryProps> | null = null;

/** 依語系挑國名。 */
function pickName(p: CountryProps, locale: string): string {
  if (locale === 'zh') return p.name_zh || p.name;
  if (locale === 'zh-CN') return p.name_zhCN || p.name;
  if (locale === 'jp') return p.name_ja || p.name;
  return p.name;
}

/**
 * 「國家點亮地圖」：把去過的國家整片填色（依國碼配色），沒去過的維持極淡輪廓。
 * 國界資料是靜態資產（public/geo/countries.geojson，Natural Earth 110m 瘦身版），
 * 只在切到此模式時才抓，並以模組層級快取避免重複下載。
 */
export default function CountriesLayer({
  visited,
  planned = EMPTY_SET,
  plannedLabel,
  isDark,
}: CountriesLayerProps) {
  const locale = useLocale();
  const [data, setData] = useState<FeatureCollection<Geometry, CountryProps> | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/geo/countries.geojson');
        if (!res.ok) return;
        const json = (await res.json()) as FeatureCollection<Geometry, CountryProps>;
        cache = json;
        if (!cancelled) setData(json);
      } catch {
        /* 抓不到就不畫，靜默處理 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const style = (feature?: Feature<Geometry, CountryProps>): PathOptions => {
    const iso = feature?.properties.iso_a2?.toUpperCase();
    const isVisited = !!iso && visited.has(iso);
    if (isVisited) {
      return {
        fillColor: countryColor(iso),
        fillOpacity: 0.55,
        color: '#fff',
        weight: 1,
        opacity: 0.8,
      };
    }
    if (iso && planned.has(iso)) {
      return {
        fillColor: countryColor(iso),
        fillOpacity: 0.15,
        color: countryColor(iso),
        weight: 1,
        opacity: 0.7,
        dashArray: '4 3',
      };
    }
    return {
      fillColor: isDark ? '#94a3b8' : '#cbd5e1',
      fillOpacity: 0.06,
      color: isDark ? '#475569' : '#cbd5e1',
      weight: 0.5,
      opacity: 0.4,
    };
  };

  const onEachFeature = (feature: Feature<Geometry, CountryProps>, layer: Layer) => {
    const iso = feature.properties.iso_a2?.toUpperCase();
    if (!iso) return;
    const label = `${countryCodeToFlag(iso)} ${pickName(feature.properties, locale)}`;
    if (visited.has(iso)) {
      layer.bindTooltip(label, { direction: 'top', sticky: true });
    } else if (planned.has(iso)) {
      const text = plannedLabel ? `${label} · ${plannedLabel}` : label;
      layer.bindTooltip(text, { direction: 'top', sticky: true });
    }
  };

  // visited / planned / 主題 / 語系變動時用 key 強制重建圖層套用新樣式與 tooltip。
  const key = `${[...visited].sort().join(',')}|${[...planned].sort().join(',')}|${
    isDark ? 'd' : 'l'
  }|${locale}`;

  return <GeoJSON key={key} data={data} style={style} onEachFeature={onEachFeature} />;
}
