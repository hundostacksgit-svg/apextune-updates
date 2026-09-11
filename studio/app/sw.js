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

const VERSION = 'omnidx-studio-v1.3.0';
/*
 * Every module the editor loads, listed exhaustively and generated from the
 * directory rather than remembered.
 *
 * JavaScript is network-first, so a module missing from here still works
 * online — which is exactly why the omissions went unnoticed. What it breaks
 * is the first offline launch: audio repair, the codec exporter, project
 * bundles and proxies were all absent until this list was rebuilt, so a person
 * who installed the app and then lost signal found those features missing with
 * no explanation. If you add an engine module, add it here.
 */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/ai/apply.js',
  './js/ai/planner.js',
  './js/ai/remote.js',
  './js/desktop.js',
  './js/engine/audio-fx.js',
  './js/engine/audio-render.js',
  './js/engine/audio-repair.js',
  './js/engine/audio.js',
  './js/engine/bundle.js',
  './js/engine/effects.js',
  './js/engine/exporter-wc.js',
  './js/engine/exporter.js',
  './js/engine/filters.js',
  './js/engine/looks-library.js',
  './js/engine/history.js',
  './js/engine/media.js',
  './js/engine/muxer.js',
  './js/engine/playback.js',
  './js/engine/project.js',
  './js/engine/proxy.js',
  './js/engine/reference.js',
  './js/engine/share.js',
  './js/engine/render.js',
  './js/engine/stickers.js',
  './js/engine/templates.js',
  './js/engine/titles.js',
  './js/engine/tracking.js',
  './js/engine/transitions.js',
  './js/engine/transitions-library.js',
  './js/levels.js',
  './js/licence.js',
  './js/main.js',
  './js/mobile.js',
  './js/palette.js',
  './js/panels/ai.js',
  './js/panels/audio.js',
  './js/panels/captions.js',
  './js/panels/color.js',
  './js/panels/effects.js',
  './js/panels/export.js',
  './js/panels/help.js',
  './js/panels/index.js',
  './js/panels/inspector.js',
  './js/panels/transition-picker.js',
  './js/panels/media.js',
  './js/panels/settings.js',
  './js/panels/templates.js',
  './js/panels/text.js',
  './js/panels/tracking.js',
  './js/store.js',
  './js/timeline-ui.js',
  './js/tutorial.js',
  './js/ui.js',
  './js/updates.js',
  '../assets/icons/icon-192.png',
  '../assets/icons/icon-512.png',
  '../assets/icons/maskable-192.png',
  '../assets/icons/maskable-512.png',
  '../assets/icons/apple-touch-icon.png',
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
