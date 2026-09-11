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

const VERSION = 'omnidx-studio-v1.4.0';

/*
 * Fonts live in their own cache, outside the versioned one.
 *
 * The shell cache is wiped on every release, which is right for code and
 * wrong for typefaces: a font file at a versioned URL never changes, and
 * re-downloading two hundred families on every app update would be a lot of
 * somebody's data for no benefit.
 */
const FONT_CACHE = 'omnidx-fonts-v1';
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
  './js/ai/direct.js',
  './js/desktop.js',
  './js/engine/audio-fx.js',
  './js/engine/audio-render.js',
  './js/engine/audio-repair.js',
  './js/engine/audio.js',
  './js/engine/broll.js',
  './js/engine/bundle.js',
  './js/engine/effects.js',
  './js/engine/effects-library.js',
  './js/engine/fx-utils.js',
  './js/engine/fonts-library.js',
  './js/engine/preview.js',
  './js/engine/lut.js',
  './js/engine/multiframe.js',
  './js/engine/matte.js',
  './js/engine/scopes.js',
  './js/engine/meters.js',
  './js/engine/tags.js',
  './js/engine/brand.js',
  './js/panels/curves.js',
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
  './js/engine/templates-library.js',
  './js/engine/titles.js',
  './js/engine/tracking.js',
  './js/engine/transitions.js',
  './js/engine/transitions-library.js',
  './js/levels.js',
  './js/licence.js',
  './js/main.js',
  './js/mobile.js',
  './js/menubar.js',
  './js/history-ui.js',
  './js/tips.js',
  './js/more-sheet.js',
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
  './js/keyframes-ui.js',
  './js/context-menu.js',
  './js/menus.js',
  './js/timeline-ui.js',
  './js/tutorial.js',
  './js/guide.js',
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
    // The font cache survives a release on purpose — see FONT_CACHE above.
    // Sweeping it with the rest would re-download every typeface in use on
    // every update, and leave a freshly-updated app with no fonts offline.
    await Promise.all(keys
      .filter((k) => k !== VERSION && k !== FONT_CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  /*
   * Typefaces are the one thing worth caching from somewhere else.
   *
   * A title in a web font is part of the project, and an editor that loses its
   * fonts the moment the signal drops is an editor that renders a different
   * video offline than online. Cache-first and kept forever: a released font
   * file at a versioned URL never changes, so there is nothing to go stale.
   *
   * Only the two Google Fonts hosts, and only GET — nothing else from another
   * origin goes anywhere near this cache.
   */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const fresh = await fetch(request);
        // Opaque responses are cached too: a font served without CORS still
        // renders, and refusing to keep it means it is fetched again every
        // launch and missing entirely offline.
        if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

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
