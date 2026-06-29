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
 *
 * This same SW also hosts **Web Push** (ROADMAP #9 Phase 3): a `push` handler
 * shows a notification from the server-built payload, and `notificationclick`
 * focuses an existing tab or opens the deep link. The payload is built +
 * localized server-side (see src/lib/webpush.ts) — the SW only renders it.
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

// --- Web Push (ROADMAP #9 Phase 3) -----------------------------------------
// Payload shape produced by src/lib/webpush.ts `buildPushPayload`.
interface PushPayload {
  title: string;
  body: string;
  url: string;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload | undefined;
  try {
    payload = event.data?.json() as PushPayload | undefined;
  } catch {
    // Non-JSON / empty push — fall back to a generic notification below.
  }

  const title = payload?.title || 'Travel Budget';
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: payload?.body ?? '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // Carried to `notificationclick` for deep-linking.
        data: { url: payload?.url || '/' },
      });
      // Nudge any open tab to refresh the in-app bell badge immediately,
      // instead of waiting for the 60s poll (ROADMAP #9 Phase 3).
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: 'notification-received' });
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Reuse an already-open tab when possible, otherwise open a new window.
      for (const client of clientList) {
        await client.focus();
        try {
          await client.navigate(url);
        } catch {
          // Cross-origin / unsupported navigate — focusing the tab is enough.
        }
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
