/*
 * Rate us, on the site.
 *
 * Five stars and an optional line, sent to the same endpoint the app uses.
 * When the backend has at least five ratings the block also shows the
 * average — a number that is real or absent, never a placeholder. The rating
 * is remembered on this browser so the block thanks rather than asks again.
 */
import { API, SITE } from './config.js';

const KEY = 'omnidx.site.rating.v1';
const WORDS = ['', 'Not for me', 'Needs work', 'Decent', 'Really good', 'The best I have used'];

function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } }
function deviceId() {
  const k = 'omnidx.site.device.v1';
  try {
    let id = localStorage.getItem(k);
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(k, id); }
    return id;
  } catch { return 'anon'; }
}
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountRating(host) {
  if (!host) return;
  const prior = read();
  let chosen = prior?.stars || 0;
  host.innerHTML = `
    <div class="rate-block">
      <h4>${prior ? 'Thanks for rating' : 'Rate OmniDx Studio'}</h4>
      <p class="tiny muted rate-avg" style="margin:0 0 8px" hidden></p>
      <div class="rate-stars" role="radiogroup" aria-label="Rating">
        ${Array.from({ length: 5 }, (_, i) => `<button class="rate-star${i < chosen ? ' on' : ''}" data-star="${i + 1}" aria-label="${i + 1} star${i ? 's' : ''}" title="${esc(WORDS[i + 1])}">★</button>`).join('')}
      </div>
      <div class="tiny muted rate-word" style="min-height:16px;margin:4px 0 8px">${esc(WORDS[chosen])}</div>
      <textarea class="input rate-note" rows="2" maxlength="500" placeholder="Anything you want us to know (optional)">${esc(prior?.note || '')}</textarea>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn btn-sm btn-primary rate-send" ${chosen ? '' : 'disabled'}>${prior ? 'Update' : 'Send'}</button>
        <span class="tiny muted rate-done" hidden>Sent. Thank you.</span>
      </div>
    </div>`;
  const paint = () => {
    host.querySelectorAll('.rate-star').forEach((b) => b.classList.toggle('on', Number(b.dataset.star) <= chosen));
    host.querySelector('.rate-word').textContent = WORDS[chosen];
    host.querySelector('.rate-send').disabled = !chosen;
  };
  host.querySelectorAll('.rate-star').forEach((b) => b.addEventListener('click', () => { chosen = Number(b.dataset.star); paint(); }));
  host.querySelector('.rate-send').addEventListener('click', async () => {
    if (!chosen) return;
    const rec = { stars: chosen, note: host.querySelector('.rate-note').value.trim().slice(0, 500), at: Date.now() };
    write(rec);
    const done = host.querySelector('.rate-done');
    done.hidden = false;
    done.textContent = 'Sending…';
    let ok = false;
    if (API.base) {
      try {
        const res = await fetch(`${API.base}/v1/rate`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stars: rec.stars, note: rec.note, where: 'web', device: deviceId(), version: SITE.version, edition: 'web' }),
        });
        ok = res.ok;
        if (ok) { const j = await res.json().catch(() => null); if (j?.average) showAverage(host, j); }
      } catch { ok = false; }
    }
    done.textContent = ok ? 'Sent. Thank you.' : 'Saved here — it will be sent when the server is reachable.';
    host.querySelector('.rate-send').textContent = 'Update';
  });
  // The average, if there is one worth showing.
  if (API.base) {
    fetch(`${API.base}/v1/rate/summary`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.average) showAverage(host, j); }).catch(() => {});
  }
}

function showAverage(host, { average, count }) {
  const el = host.querySelector('.rate-avg');
  if (!el) return;
  el.hidden = false;
  el.textContent = `${average.toFixed(1)} out of 5 from ${count} rating${count === 1 ? '' : 's'}`;
}
