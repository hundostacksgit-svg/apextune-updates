/*
 * Rate us.
 *
 * One card, five stars, an optional line of text. It is asked for in three
 * places — the Help menu, the Learn panel, and once after somebody's third
 * successful export — and it is never asked twice: a rating given is
 * remembered on the device, and so is a dismissal. Somebody who has said no
 * once has answered.
 *
 * The rating goes to the Worker when there is one, and waits in local
 * storage when there is not (offline, or the backend not yet switched on),
 * to be sent the next time the app starts with a connection. Nothing about
 * the person travels with it beyond the edition, the version and a device
 * id that already exists for licensing — no email, no project, no footage.
 */

import { $, esc, toast, modal, closeModal } from './ui.js';
import { API, SITE } from '../../assets/config.js';
import * as auth from '../../assets/auth.js';

const KEY = 'omnidx.studio.rating.v1';        // { stars, note, at, sent }
const ASKED = 'omnidx.studio.rating.asked.v1'; // when the export prompt was shown
const EXPORTS = 'omnidx.studio.exports.v1';    // how many exports have finished on this device

function read(key, fallback = null) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

/** The rating this device gave, if any. */
export function given() { return read(KEY); }

/** Post a rating to the backend. Resolves true when it landed, false when it must wait. */
async function send(rec) {
  if (!API.base) return false;
  try {
    const res = await fetch(`${API.base}/v1/rate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stars: rec.stars, note: rec.note || '', where: rec.where || 'app',
        edition: auth.edition(), device: auth.deviceId(), version: SITE?.version || '',
      }),
    });
    return res.ok;
  } catch { return false; }
}

/** Send anything that was rated offline. Called once at start-up. */
export async function flush() {
  const rec = given();
  if (!rec || rec.sent) return;
  if (await send(rec)) write(KEY, { ...rec, sent: true });
}

/**
 * Count a finished export and, on the third, ask once. The card sits in the
 * corner like a toast rather than blocking the export the person just made:
 * they can carry on, and it goes away on its own.
 */
export function exported() {
  const n = (read(EXPORTS, 0) || 0) + 1;
  write(EXPORTS, n);
  if (n < 3 || given() || read(ASKED)) return;
  write(ASKED, Date.now());
  setTimeout(() => openRating({ trigger: 'export', quiet: true }), 1600);
}

const STAR_WORDS = ['', 'Not for me', 'Needs work', 'Decent', 'Really good', 'The best I have used'];

/**
 * The card. `quiet` renders it as a corner card with a close button; the
 * menu and panel open it as a modal, which is what a person who went looking
 * for it expects.
 */
export function openRating({ trigger = 'menu', quiet = false } = {}) {
  const prior = given();
  const stars = (n) => Array.from({ length: 5 }, (_, i) => `
    <button class="rate-star${i < n ? ' on' : ''}" data-star="${i + 1}" aria-label="${i + 1} star${i ? 's' : ''}" title="${esc(STAR_WORDS[i + 1])}">★</button>`).join('');
  const inner = `
    <div class="rate-card" data-trigger="${esc(trigger)}">
      <h3 style="margin:0 0 4px">${prior ? 'Thanks — change your rating?' : 'How is OmniDx Studio?'}</h3>
      <p class="tiny muted" style="margin:0 0 10px">${prior
        ? `You gave it ${prior.stars} star${prior.stars === 1 ? '' : 's'}.`
        : 'One tap. It goes a long way, and nothing about your project is sent.'}</p>
      <div class="rate-stars" role="radiogroup" aria-label="Rating">${stars(prior?.stars || 0)}</div>
      <div class="rate-word tiny muted" style="min-height:16px;margin:6px 0 8px">${esc(STAR_WORDS[prior?.stars || 0])}</div>
      <textarea class="input rate-note" rows="2" maxlength="500" placeholder="Anything you want us to know (optional)">${esc(prior?.note || '')}</textarea>
      <div class="btn-row" style="justify-content:flex-end;margin-top:10px">
        <button class="btn btn-ghost btn-sm" data-rate="later">${quiet ? 'Not now' : 'Cancel'}</button>
        <button class="btn btn-primary btn-sm" data-rate="send" ${prior ? '' : 'disabled'}>Send</button>
      </div>
    </div>`;

  let host;
  if (quiet) {
    $('#rate-corner')?.remove();
    host = document.createElement('div');
    host.id = 'rate-corner';
    host.className = 'rate-corner';
    host.innerHTML = inner;
    document.body.appendChild(host);
  } else {
    modal(inner);
    host = $('#modal');
  }
  let chosen = prior?.stars || 0;
  const paint = () => {
    host.querySelectorAll('.rate-star').forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= chosen));
    const word = host.querySelector('.rate-word');
    if (word) word.textContent = STAR_WORDS[chosen];
    const send = host.querySelector('[data-rate="send"]');
    if (send) send.disabled = !chosen;
  };
  host.querySelectorAll('.rate-star').forEach((b) => {
    b.addEventListener('click', () => { chosen = Number(b.dataset.star); paint(); });
    b.addEventListener('mouseenter', () => { host.querySelectorAll('.rate-star').forEach((x) => x.classList.toggle('hover', Number(x.dataset.star) <= Number(b.dataset.star))); });
    b.addEventListener('mouseleave', () => { host.querySelectorAll('.rate-star').forEach((x) => x.classList.remove('hover')); });
  });
  const close = () => { if (quiet) host.remove(); else closeModal(); };
  host.querySelector('[data-rate="later"]')?.addEventListener('click', close);
  host.querySelector('[data-rate="send"]')?.addEventListener('click', async () => {
    if (!chosen) return;
    const rec = { stars: chosen, note: host.querySelector('.rate-note')?.value.trim().slice(0, 500) || '', at: Date.now(), where: trigger === 'export' ? 'app' : 'app', sent: false };
    write(KEY, rec);
    close();
    const landed = await send(rec);
    if (landed) write(KEY, { ...rec, sent: true });
    toast(chosen >= 4 ? 'Thank you — that means a lot.' : 'Thank you. It is read, and it changes what gets built next.', 'ok', 4200);
  });
  if (quiet) {
    // Out of the way on its own after a while, without being counted as a "no".
    setTimeout(() => { if (host.isConnected) host.remove(); }, 45000);
  }
  paint();
}
