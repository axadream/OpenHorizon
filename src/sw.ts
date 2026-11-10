/// <reference lib="webworker" />
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { syncAll } from '@/features/sync/syncAll';
import { FEED_SYNC_ONCE_TAG, FEED_SYNC_TAG, type PageToSw, type SwToPage } from '@/features/sync/protocol';
import { setXmlEnv } from '@/lib/xml/dom';
import { createXmldomEnv } from '@/lib/xml/xmldomEnv';

declare let self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const FEEDS_CACHE = 'oh-feeds';
const IMAGES_CACHE = 'oh-images';
const DAY_S = 24 * 3600;

// Workers have no DOMParser: xmldom is the XML environment for everything the SW parses.
// Statically imported so it stays inside the SW bundle (never in the page chunks).
setXmlEnv(createXmldomEnv());

/** Keeps only responses with the listed statuses in a cache (workbox-cacheable-response is not installed). */
const cacheStatuses = (statuses: number[]) => ({
  cacheWillUpdate: async ({ response }: { response: Response }) => (statuses.includes(response.status) ? response : null),
});

async function postToAllClients(message: SwToPage): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}

/**
 * Background sync entry point. A visible page gets SYNC_REQUEST (it has fresher failure
 * memory and shows progress); otherwise the SW syncs by itself and notifies.
 */
async function swSync(): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = clients.find((c) => c.visibilityState === 'visible');
  if (visible) {
    visible.postMessage({ type: 'SYNC_REQUEST' } satisfies SwToPage);
    return;
  }

  await postToAllClients({ type: 'SYNC_STARTED', origin: 'sw' });
  // syncAll also shows the notifications for new articles in favorite feeds (origin 'sw').
  const result = await syncAll({ origin: 'sw' });
  await postToAllClients({
    type: 'SYNC_COMPLETE',
    origin: 'sw',
    newCount: result.newArticles.length,
    errorCount: result.errorCount,
  });
}

// ---- lifecycle ----
self.addEventListener('message', (event) => {
  const msg = event.data as PageToSw | undefined;
  if (!msg) return;
  switch (msg.type) {
    case 'SKIP_WAITING':
      void self.skipWaiting();
      break;
    case 'GET_VERSION':
      (event.source as Client | null)?.postMessage({ type: 'VERSION', version: __APP_VERSION__ } satisfies SwToPage);
      break;
    case 'SYNC_NOW':
      (event as ExtendableMessageEvent).waitUntil(swSync());
      break;
    default:
      break;
  }
});

clientsClaim();
cleanupOutdatedCaches();

// ---- app shell: precache (cache-first) + SPA navigations ----
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

// ---- favicons and other images: stale-while-revalidate ----
registerRoute(
  ({ url, request }) =>
    request.destination === 'image' ||
    (url.hostname === 'www.google.com' && url.pathname.startsWith('/s2/favicons')) ||
    url.hostname === 'icons.duckduckgo.com',
  new StaleWhileRevalidate({
    cacheName: IMAGES_CACHE,
    plugins: [
      cacheStatuses([0, 200]),
      new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * DAY_S, purgeOnQuotaError: true }),
    ],
  }),
);

// ---- feeds and proxy responses (cross-origin fetch): network first, 24 h offline fallback ----
registerRoute(
  ({ url, request }) => request.method === 'GET' && request.destination === '' && url.origin !== self.location.origin,
  new NetworkFirst({
    cacheName: FEEDS_CACHE,
    networkTimeoutSeconds: 15,
    plugins: [
      cacheStatuses([200]),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: DAY_S, purgeOnQuotaError: true }),
    ],
  }),
);

// ---- background sync ----
self.addEventListener('periodicsync', (event) => {
  const e = event as ExtendableEvent & { tag?: string };
  if (e.tag === FEED_SYNC_TAG) e.waitUntil(swSync());
});

self.addEventListener('sync', (event) => {
  const e = event as ExtendableEvent & { tag?: string };
  if (e.tag === FEED_SYNC_ONCE_TAG) e.waitUntil(swSync());
});

// ---- notification clicks ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string; articleId?: string };
  const url = data.url ?? import.meta.env.BASE_URL;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = clients[0];
      if (!client) {
        await self.clients.openWindow(url);
        return;
      }
      await client.focus();
      if (data.articleId) {
        client.postMessage({ type: 'OPEN_ARTICLE', articleId: data.articleId } satisfies SwToPage);
      } else {
        await client.navigate(url);
      }
    })(),
  );
});
