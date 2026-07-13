'use client';

import { useQuery } from '@tanstack/react-query';
import { collectionKeys } from './keys';

/**
 * 航空公司 / 機場目錄（旅行成就的固定參考資料）。
 * 兩份 JSON 是 scripts/generate-catalogs.mjs 的生成資產（public/data/），體積不小
 * （機場 ~450KB），故不進 bundle、改在用到時 fetch 並以 staleTime Infinity 快取
 * （內容只隨部署改變）。
 */

export interface AirlineEntry {
  /** IATA 二碼（如 BR / 9C）。 */
  iata: string;
  name: string;
  /** 繁中常用名（人工 overlay，僅常用航空有）。 */
  nameZh?: string;
  country: string | null;
  alliance?: 'star' | 'oneworld' | 'skyteam';
  /** 已停業（終身紀錄仍可選——你可能搭過復興航空）。 */
  defunct?: boolean;
}

export interface AirportEntry {
  /** IATA 三碼（如 TPE）。 */
  iata: string;
  name: string;
  city: string | null;
  /** ISO 3166-1 alpha-2。 */
  country: string | null;
  lat: number;
  lon: number;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export function useAirlines(enabled = true) {
  return useQuery({
    queryKey: collectionKeys.airlines,
    queryFn: () => fetchJson<AirlineEntry[]>('/data/airlines.json'),
    staleTime: Infinity,
    enabled,
  });
}

export function useAirports(enabled = true) {
  return useQuery({
    queryKey: collectionKeys.airports,
    queryFn: () => fetchJson<AirportEntry[]>('/data/airports.json'),
    staleTime: Infinity,
    enabled,
  });
}

/** 依語系取航空公司顯示名：中文介面優先繁中常用名。 */
export function getAirlineName(entry: AirlineEntry, locale: string): string {
  return locale.startsWith('zh') && entry.nameZh ? entry.nameZh : entry.name;
}
