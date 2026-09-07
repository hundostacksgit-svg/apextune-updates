/* Bootstrap: router, service-worker registration, install prompt. */
import { $, $$, toast, haptic } from './ui.js';

const ROUTES = {
  home:    () => import('./modules/home.js'),
  car:     () => import('./modules/car.js'),
  phone:   () => import('./modules/phone.js'),
  system:  () => import('./modules/system.js'),
  reports: () => import('./modules/reports.js'),
  gear:    () => import('./modules/gear.js'),
  codes:   () => import('./modules/codes.js'),
  garage:  () => import('./modules/garage.js'),
  pro:     () => import('./modules/pro.js'),
  controller: () => import('./modules/controller.js'),
  display: () => import('./modules/display.js'),
};

let current = null;

function parseHash() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [name, ...rest] = raw.split('/');
  return { name: ROUTES[name] ? name : 'home', arg: rest.join('/') || null };
}

async function render() {
  const { name, arg } = parseHash();
  const host = $('#view');

  // Let the outgoing view stop timers, disconnect polling, release the camera, etc.
  try { current?.destroy?.(); } catch (e) { console.warn('teardown failed', e); }
  current = null;

  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));

  try {
    const mod = await ROUTES[name]();
    host.innerHTML = '';
    current = await mod.mount(host, arg);
  } catch (err) {
    console.error(err);
    host.innerHTML = `<div class="note bad"><strong>Could not open this screen.</strong><br>${
      String(err && err.message ? err.message : err)}</div>
      <button class="btn" onclick="location.reload()">Reload app</button>`;
  }
  window.scrollTo(0, 0);
}

/* ---------- network indicator ---------- */
function paintNet() {
  const dot = $('#net-dot');
  if (!dot) return;
  const on = navigator.onLine;
  dot.classList.toggle('off', !on);
  dot.title = on ? 'Online' : 'Offline — cached data only';
}

/* ---------- install to home screen ---------- */
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('#btn-install');
  if (btn) btn.hidden = false;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const btn = $('#btn-install');
  if (btn) btn.hidden = true;
  toast('Installed — check your home screen', 'ok');
});

export function canInstall() { return !!deferredPrompt; }

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export async function promptInstall() {
  if (!deferredPrompt) {
    toast('Use your browser menu → Add to Home Screen');
    return false;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  const btn = $('#btn-install');
  if (btn) btn.hidden = true;
  return outcome === 'accepted';
}

/* ---------- desktop launcher liaison ---------- */
/* The desktop launcher opens the app with ?app=desktop and shuts its local
   server down once this window stops checking in, so closing the app never
   strands a background process. A hosted copy never sets the flag, so none of
   this runs there. The flag lives in sessionStorage to survive reloads and the
   hash routing, and is scoped to this window only. */
const DESKTOP_FLAG = 'omnidx.desktop';
const HEARTBEAT_MS = 30000;

function isDesktopSession() {
  try {
    if (new URLSearchParams(location.search).get('app') === 'desktop') {
      sessionStorage.setItem(DESKTOP_FLAG, '1');
    }
    return sessionStorage.getItem(DESKTOP_FLAG) === '1';
  } catch {
    return false; // storage blocked — the launcher falls back to its idle timeout
  }
}

function startDesktopHeartbeat() {
  // Absolute paths: the app is served under /app/, but the launcher's control
  // endpoints live at the server root. sendBeacon survives page teardown,
  // which a fetch() on pagehide does not.
  const ping = (path) => { try { navigator.sendBeacon(path, ''); } catch { /* launcher gone */ } };
  ping('/__alive');
  setInterval(() => ping('/__alive'), HEARTBEAT_MS);
  // Fires on close and on reload alike; the launcher waits a few seconds so a
  // reload's fresh heartbeat cancels the shutdown.
  window.addEventListener('pagehide', () => ping('/__quit'));
}

/* ---------- start ---------- */
window.addEventListener('hashchange', render);
window.addEventListener('online', paintNet);
window.addEventListener('offline', paintNet);

document.addEventListener('click', (e) => {
  if (e.target.closest('.tabbar a, .btn, .chip, .card.tap')) haptic(10);
});

$('#btn-install')?.addEventListener('click', promptInstall);

(async function boot() {
  paintNet();
  if (isDesktopSession()) startDesktopHeartbeat();
  if (!location.hash) location.hash = '#/home';
  await render();
  setTimeout(() => $('#splash')?.classList.add('gone'), 220);

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Update ready — reopen the app to apply');
          }
        });
      });
    } catch (e) {
      console.warn('Service worker registration failed:', e);
    }
  }
})();
