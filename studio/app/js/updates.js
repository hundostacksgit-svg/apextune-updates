/*
 * Updates.
 *
 * The app is static files behind a service worker, which makes shipping an
 * update a push — but only if the running copy notices. This is the bit that
 * makes it notice, and makes applying it a decision rather than a surprise.
 *
 * How it works:
 *   1. version.json at the site root carries the current version and what
 *      changed. It is fetched with cache: 'no-store' so a stale copy can't hide
 *      a release.
 *   2. On boot and every half hour, the running app compares it to its own
 *      build. A newer one shows a bar with the notes and a Reload button.
 *   3. The service worker is network-first for HTML and JavaScript, so the
 *      reload genuinely gets the new code rather than the cached old code.
 *
 * The one rule: never reload by itself. Someone mid-export losing their render
 * to a background update would be unforgivable, so the button is always
 * theirs to press.
 */

import { $, esc, toast } from './ui.js';

export const BUILD = '1.2.0';           // bumped by tools/release.py
const CHECK_EVERY = 30 * 60 * 1000;
const SEEN_KEY = 'omnidx.studio.seenVersion';

let latest = null;

function versionUrl() {
  // Relative to the app, so it works on a subpath, a custom domain, a desktop
  // build and a phone home-screen install without configuration.
  return new URL('../../version.json', location.href).href;
}

export function compare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export async function check({ quiet = true } = {}) {
  try {
    const res = await fetch(versionUrl(), { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    latest = data;
    if (compare(data.version, BUILD) > 0) {
      showBanner(data);
      return data;
    }
    if (!quiet) toast(`You are on the latest version (${BUILD})`, 'ok');
    return null;
  } catch {
    // Offline, or the file isn't published yet. Neither is worth interrupting
    // anyone about — the app works exactly the same either way.
    if (!quiet) toast('Could not reach the update server. You are offline, or it is not published yet.');
    return null;
  }
}

function showBanner(data) {
  if (document.getElementById('update-bar')) return;
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch { seen = null; }
  if (seen === data.version) return;      // dismissed this one already

  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.className = 'update-bar';
  bar.innerHTML = `
    <span class="ub-dot"></span>
    <span class="ub-text">
      <b>Version ${esc(data.version)} is ready</b>
      ${data.headline ? `<span>${esc(data.headline)}</span>` : ''}
    </span>
    <button class="btn btn-sm" id="ub-notes">What's new</button>
    <button class="btn btn-sm btn-primary" id="ub-go">Reload</button>
    <button class="btn btn-sm btn-ghost" id="ub-later" title="Dismiss until the next version">Later</button>`;
  document.body.appendChild(bar);

  $('#ub-go').addEventListener('click', () => applyUpdate());
  $('#ub-later').addEventListener('click', () => {
    try { localStorage.setItem(SEEN_KEY, data.version); } catch { /* private mode */ }
    bar.remove();
  });
  $('#ub-notes').addEventListener('click', () => showNotes(data));
}

async function showNotes(data) {
  const { modal, closeModal } = await import('./ui.js');
  modal(`
    <h3>Version ${esc(data.version)}</h3>
    ${data.date ? `<p class="tiny muted">${esc(data.date)}</p>` : ''}
    ${data.headline ? `<p>${esc(data.headline)}</p>` : ''}
    ${Array.isArray(data.notes) && data.notes.length ? `<ul style="padding-left:20px;color:var(--text-2);font-size:13.5px">
      ${data.notes.map((n) => `<li style="margin-bottom:6px">${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="note tiny">Your projects and media are untouched by an update — they live in this
      browser's storage, not in the app files.</div>
    <div class="btn-row" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-x="close">Close</button>
      <button class="btn btn-primary" data-x="go">Reload now</button>
    </div>`);
  document.querySelector('[data-x="close"]')?.addEventListener('click', closeModal);
  document.querySelector('[data-x="go"]')?.addEventListener('click', () => { closeModal(); applyUpdate(); });
}

/**
 * Apply it: save first, tell the service worker to stop serving the old shell,
 * then reload. Saving first is not optional — an update that costs someone
 * their last edit is worse than no update.
 */
export async function applyUpdate() {
  try {
    const { actions } = await import('./main.js');
    await actions.saveNow();
  } catch { /* nothing open to save */ }

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      await reg.update();
    }
  } catch { /* no service worker — a plain reload gets the new files */ }

  try { localStorage.removeItem(SEEN_KEY); } catch { /* private mode */ }
  location.reload();
}

export function latestKnown() { return latest; }

/** Start checking. Called once from boot. */
export function startUpdateChecks() {
  // A moment after load, so it never competes with the first paint.
  setTimeout(() => check({ quiet: true }), 4000);
  setInterval(() => check({ quiet: true }), CHECK_EVERY);

  // A service worker that finds new files mid-session is the same news from a
  // different direction.
  navigator.serviceWorker?.addEventListener?.('controllerchange', () => {
    if (!document.getElementById('update-bar')) {
      check({ quiet: true });
    }
  });
}
