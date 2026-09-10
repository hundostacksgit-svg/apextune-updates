/*
 * Offline support.
 *
 * The rule is: the app shell is cached so it opens with no signal, but a
 * running app is never served a stale module. So HTML and JavaScript are
 * network-first with a cache fallback, and everything else is cache-first.
 *
 * Media never touches this cache. Video files live in IndexedDB where the app
 * put them; duplicating gigabytes into a service-worker cache would blow the
 * origin's storage quota for no benefit.
 */

const VERSION = 'omnidx-studio-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/ui.js',
  './js/store.js',
  './js/licence.js',
  './js/levels.js',
  './js/palette.js',
  './js/tutorial.js',
  './js/timeline-ui.js',
  './js/engine/project.js',
  './js/engine/history.js',
  './js/engine/media.js',
  './js/engine/filters.js',
  './js/engine/transitions.js',
  './js/engine/titles.js',
  './js/engine/render.js',
  './js/engine/audio.js',
  './js/engine/playback.js',
  './js/engine/exporter.js',
  './js/ai/planner.js',
  './js/ai/apply.js',
  './js/ai/remote.js',
  './js/panels/index.js',
  './js/panels/media.js',
  './js/panels/ai.js',
  './js/panels/effects.js',
  './js/panels/color.js',
  './js/panels/text.js',
  './js/panels/audio.js',
  './js/panels/captions.js',
  './js/panels/settings.js',
  './js/panels/help.js',
  './js/panels/inspector.js',
  './js/panels/export.js',
  './js/panels/inspector.js',
  './js/panels/templates.js',
  './js/panels/tracking.js',
  './js/updates.js',
  './js/desktop.js',
  './js/engine/effects.js',
  './js/engine/stickers.js',
  './js/engine/templates.js',
  './js/engine/tracking.js',
  '../assets/config.js',
  '../assets/auth.js',
  '../assets/mark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll fails the whole install if one file 404s; add them individually so
    // a single renamed file cannot leave the app with no offline support at all.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

/* The app asks for this when someone presses Reload on the update bar, so the
   new shell takes over on that reload rather than the one after. */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // never cache other origins

  const isCode = request.mode === 'navigate'
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.html');

  if (isCode) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(VERSION);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(request);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      const cache = await caches.open(VERSION);
      cache.put(request, fresh.clone());
      return fresh;
    } catch {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
