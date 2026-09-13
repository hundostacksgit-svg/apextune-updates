/*
 * Installing the editor as an app, from inside the editor.
 *
 * What this is for
 * ----------------
 * The browser build is the whole editor, and installed it is an app: its own
 * window, its own icon in the dock or on the home screen, offline, opening
 * footage and project files from the file manager, receiving a video from a
 * phone's share sheet. None of that is visible from inside a browser tab, and
 * the browser's own hint — a small icon in the address bar, a banner it shows
 * once and never again — is how nearly everyone misses it. So the editor asks
 * itself, in the places an editor already looks: the File menu, the top bar,
 * the phone's More sheet, and once, after the first export, when somebody
 * has just seen what it does.
 *
 * How it works
 * ------------
 * Chromium browsers fire `beforeinstallprompt` when the page qualifies; the
 * event is kept and replayed from a real press, which is the only way the
 * prompt is allowed to open. Every other browser has a menu route and no
 * API, so `install()` falls back to the steps for that platform and browser
 * — the actual menu items, not "see your browser's help". Nothing here is a
 * picture of a feature: where a browser cannot install at all (Firefox on a
 * desktop), it says so and says what does.
 */

import { $, el, modal, closeModal, toast, esc } from './ui.js';
import * as store from './store.js';

let deferred = null;                       // the captured beforeinstallprompt
let installed = false;
const watchers = new Set();
const NUDGE_KEY = 'installNudge';          // 'done' once shown or once installed

/* ------------------------------------------------------------------ */
/* where we are                                                        */
/* ------------------------------------------------------------------ */

export function platform() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  if (/iPhone|iPod/.test(ua) || (/iPad/.test(ua)) || (/Mac OS X/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac OS X/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  if (/CrOS/.test(ua)) return 'chromeos';
  if (/Linux/.test(ua)) return 'linux';
  return 'other';
}

export function browser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox\/|FxiOS/.test(ua)) return 'firefox';
  if (/CriOS/.test(ua)) return 'chrome';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

function standalone() {
  try {
    return matchMedia('(display-mode: standalone)').matches
      || matchMedia('(display-mode: window-controls-overlay)').matches
      || navigator.standalone === true
      || Boolean(window.omnidxDesktop);
  } catch { return false; }
}

export function isInstalled() { return installed; }
export function canPrompt() { return Boolean(deferred); }

/** True where a browser can install at all — so a button is offered, not a dead end. */
export function canInstallHere() {
  const p = platform(), b = browser();
  if (p === 'ios') return b === 'safari' || b === 'chrome' || b === 'edge' || b === 'firefox';  // iOS 16.4+: any browser via Share
  if (p === 'android') return b !== 'other';
  if (b === 'firefox') return false;              // no install on desktop Firefox
  if (b === 'safari') return p === 'mac';         // Safari 17: File → Add to Dock
  return true;                                    // Chromium of every flavour
}

/* ------------------------------------------------------------------ */
/* the steps, per browser                                              */
/* ------------------------------------------------------------------ */

/**
 * The actual menu items. Returns { title, steps[], note } for where we are;
 * every string is checked against the real browsers, not paraphrased.
 */
export function howTo() {
  const p = platform(), b = browser();
  if (p === 'ios') {
    return {
      title: 'Put it on your home screen',
      steps: [
        b === 'safari' ? 'Press <b>Share</b> at the bottom of Safari (the square with the arrow).' : `Press <b>Share</b> in ${b === 'chrome' ? 'Chrome' : b === 'edge' ? 'Edge' : b === 'firefox' ? 'Firefox' : 'your browser'} — or open this page in Safari.`,
        'Scroll the sheet and choose <b>Add to Home Screen</b>.',
        'Press <b>Add</b>. The icon lands with your other apps and opens full screen.',
      ],
      note: 'It keeps working with no signal, and your projects stay on the phone.',
    };
  }
  if (p === 'android') {
    if (b === 'samsung') return { title: 'Install the app', steps: ['Open the <b>≡</b> menu in Samsung Internet.', 'Choose <b>Add page to</b> → <b>Home screen</b>.', 'Confirm. It opens in its own window from then on.'], note: '' };
    if (b === 'firefox') return { title: 'Install the app', steps: ['Open the <b>⋮</b> menu in Firefox.', 'Choose <b>Install</b>.', 'Confirm. It lands in your app drawer.'], note: '' };
    return { title: 'Install the app', steps: ['Open the <b>⋮</b> menu in Chrome.', 'Choose <b>Install app</b> (older versions say <b>Add to Home screen</b>).', 'Confirm. It lands in your app drawer and opens full screen.'], note: '' };
  }
  if (b === 'safari') {
    return {
      title: 'Add it to the Dock',
      steps: ['In Safari\'s menu bar choose <b>File</b> → <b>Add to Dock…</b>', 'Press <b>Add</b>. It opens in its own window, with its own icon.'],
      note: 'Needs Safari 17 or newer (macOS Sonoma). On an older Mac, use Chrome or Edge for the same thing.',
    };
  }
  if (b === 'firefox') {
    return {
      title: 'Firefox runs it, but cannot install it',
      steps: ['Everything works in this tab, including offline, and this tab can be pinned.', 'For a dock icon and its own window, open <b>omnidx.net/studio/app</b> once in <b>Chrome</b>, <b>Edge</b> or <b>Safari</b> and press Install there.'],
      note: 'Firefox removed app install from the desktop version; it is not something a site can turn back on.',
    };
  }
  if (b === 'edge') {
    return { title: 'Install the app', steps: ['Open the <b>⋯</b> menu in Edge.', 'Choose <b>Apps</b> → <b>Install OmniDx Studio</b>.', 'Press <b>Install</b>. It gets its own window and a Start menu or Dock entry.'], note: 'Or press the install icon at the right end of the address bar.' };
  }
  return {
    title: 'Install the app',
    steps: ['Press the <b>install icon</b> at the right end of the address bar (a monitor with an arrow).', 'Or open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app…</b>', 'Press <b>Install</b>. It gets its own window and a Dock or Start menu entry.'],
    note: `${p === 'windows' ? 'Double-clicking a project or a video then opens it here.' : 'Opening a project or a video from Finder then lands here.'}`,
  };
}

export function openHowTo() {
  const h = howTo();
  const body = modal(`
    <div class="inst">
      <h3 style="margin:0 0 4px">${esc(h.title)}</h3>
      <p class="tiny muted" style="margin:0 0 12px">Same editor, its own window and icon, works with no connection, opens your files.</p>
      <ol class="inst-steps">${h.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${h.note ? `<p class="tiny muted" style="margin:10px 0 0">${esc(h.note)}</p>` : ''}
      <div class="btn-row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn btn-sm btn-primary" type="button" data-x="ok">Got it</button>
      </div>
    </div>`);
  $('[data-x="ok"]', body).addEventListener('click', closeModal);
}

/* ------------------------------------------------------------------ */
/* the one call                                                        */
/* ------------------------------------------------------------------ */

/**
 * Install, from a press. Prompts where the browser allows, shows the steps
 * where it does not. Resolves 'installed' | 'accepted' | 'dismissed' | 'howto'.
 */
export async function install() {
  if (installed) { toast('Already installed on this device', 'ok'); return 'installed'; }
  if (deferred) {
    const ev = deferred;
    deferred = null;
    try {
      ev.prompt();
      const { outcome } = await ev.userChoice;
      notify();
      if (outcome === 'accepted') { markNudged(); return 'accepted'; }
      return 'dismissed';
    } catch {
      // The event can be stale after a navigation; fall through to the steps.
    }
  }
  openHowTo();
  return 'howto';
}

/* ------------------------------------------------------------------ */
/* the nudge                                                           */
/* ------------------------------------------------------------------ */

let nudged = null;   // resolved from the store at init

async function markNudged() {
  nudged = 'done';
  try { await store.pref(NUDGE_KEY, 'done'); } catch { /* fine */ }
}

/**
 * Once, after real work — the first export is the moment. A bar under the
 * top bar, one line, two buttons; never again after it is answered either
 * way, and never in a browser that cannot install.
 */
export function maybeNudge(reason = '') {
  if (installed || nudged === 'done' || nudged === null) return false;
  if (!canInstallHere()) return false;
  if ($('#install-nudge')) return false;
  const bar = el('div', { class: 'install-nudge', id: 'install-nudge', role: 'status' });
  bar.innerHTML = `
    <span>${reason === 'export' ? 'That export came out of a browser tab. ' : ''}Put OmniDx Studio on this ${platform() === 'ios' || platform() === 'android' ? 'phone' : 'computer'} — its own window and icon, works offline, opens your files.</span>
    <button class="btn btn-sm btn-primary" type="button" data-x="go">Install</button>
    <button class="btn btn-sm btn-ghost" type="button" data-x="no" title="Never ask again">Not now</button>`;
  $('[data-x="go"]', bar).addEventListener('click', async () => { bar.remove(); await install(); markNudged(); });
  $('[data-x="no"]', bar).addEventListener('click', () => { bar.remove(); markNudged(); });
  ($('#topbar') || document.body).insertAdjacentElement('afterend', bar);
  return true;
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

function notify() { for (const fn of watchers) { try { fn({ installed, canPrompt: Boolean(deferred) }); } catch { /* one bad watcher must not stop the rest */ } } }

/** Watch the state; called at once with the current one. */
export function onChange(fn) { watchers.add(fn); fn({ installed, canPrompt: Boolean(deferred) }); return () => watchers.delete(fn); }

export async function initInstall() {
  installed = standalone();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    markNudged();
    $('#install-nudge')?.remove();
    toast('Installed — open it from its own icon from now on', 'ok', 4200);
    notify();
  });
  try { matchMedia('(display-mode: standalone)').addEventListener('change', (e) => { installed = e.matches || standalone(); notify(); }); } catch { /* fine */ }
  try { nudged = (await store.pref(NUDGE_KEY)) || ''; } catch { nudged = ''; }

  // The top-bar button: only where a press can do something.
  const btn = $('#btn-install');
  if (btn) {
    btn.addEventListener('click', () => install());
    onChange(({ installed: on }) => { btn.hidden = on || !canInstallHere(); btn.title = deferred ? 'Install OmniDx Studio as an app' : 'Install as an app — how'; });
  }
  notify();
}

/** For the settings panel: one line saying what this copy is. */
export function statusLine() {
  if (window.omnidxDesktop) return 'The desktop build';
  if (installed) return `Installed as an app on this ${platform() === 'ios' || platform() === 'android' ? 'phone' : 'computer'}`;
  return canInstallHere() ? 'Running in a browser tab — it can be installed' : 'Running in a browser tab';
}

