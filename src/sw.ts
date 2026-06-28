/// <reference lib="webworker" />
/**
 * Serwist service worker (ROADMAP #5 Phase 1 — offline-first PWA).
 *
 * Strategy split:
 * - App shell + static assets (`_next/static`, fonts, images): handled by
 *   Serwist's `defaultCache` (CacheFirst / StaleWhileRevalidate presets).
 * - Document navigations: NetworkFirst, falling back to the precached
 *   `/offline.html` when both network and cache miss.
 * - Leaflet map tiles: CacheFirst so the basemap renders offline.
 * - R2 images (public avatars + presigned receipt GETs): CacheFirst.
 *
 * Reads/writes go through Next.js server actions (POST RPC) which we
 * deliberately do NOT cache here — offline reads are served from the
 * persisted TanStack Query cache (see src/lib/queryPersister.ts), and offline
 * writes are out of scope for Phase 1.
 */
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  // Leaflet/OpenStreetMap raster tiles — keep the basemap available offline.
  {
    matcher: ({ url }) => /\.tile\.openstreetmap\.org$/.test(url.hostname),
    handler: new CacheFirst({
      cacheName: 'map-tiles',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 256,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
  // R2 blob images: public avatars (stable URL) + presigned receipt/ticket GETs.
  {
    matcher: ({ request, url }) =>
      request.destination === 'image' &&
      (/\.r2\.cloudflarestorage\.com$/.test(url.hostname) || /\.r2\.dev$/.test(url.hostname)),
    handler: new CacheFirst({
      cacheName: 'r2-images',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 128,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: '/offline.html',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
