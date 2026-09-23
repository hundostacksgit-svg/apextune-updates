/*
 * The owner's page. Everything goes through one endpoint on the licence
 * server, POST /v1/tune/admin, with the owner token; the server decides what
 * the token may do. The page only draws the answer.
 */
import { TUNE } from '../assets/config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE = 'omnidx.tune.owner';

try { $('#own-token').value = localStorage.getItem(STORE) || ''; } catch { /* private mode */ }

let apiBase = null;
async function api() {
  if (apiBase !== null) return apiBase;
  try { const cfg = await (await fetch(TUNE.configUrl, { cache: 'no-store' })).json(); apiBase = String(cfg.api || '').replace(/\/+$/, ''); }
  catch { apiBase = ''; }
  return apiBase;
}

const when = (ms) => (ms ? new Date(ms).toLocaleString() : 'never');

function render(d, note) {
  const out = $('#own-out');
  out.hidden = false;
  if (d.error) { out.innerHTML = `<div class="note bad">${esc(d.error)}</div>`; return; }
  const keys = (d.keys || []).map((k, i) => `
    <div class="own-key"><span class="mono">${esc(k.key)}</span>
      <span>${k.revoked ? '<b class="off">off</b>' : '<b class="on">on</b>'} · on ${esc(k.pcs)} PC${k.pcs === 1 ? '' : 's'}${k.movedAt ? ` · moved ${esc(when(k.movedAt))}` : ''}</span></div>`).join('');
  out.innerHTML = `
    ${note ? `<div class="note ok" style="margin-bottom:12px">${esc(note)}</div>` : ''}
    <div class="own-row"><span>Order</span><b class="mono" style="font-size:12px">${esc(d.order)}</b></div>
    <div class="own-row"><span>Email on file</span><b>${esc(d.email || 'none')}</b></div>
    <div class="own-row"><span>Paid</span><b>${d.paidCents ? `$${(d.paidCents / 100).toFixed(2)}` : 'unknown'}</b></div>
    <div class="own-row"><span>Bought</span><b>${esc(when(d.createdAt))}</b></div>
    <div class="own-row"><span>Keys emailed</span><b>${esc(when(d.emailedAt))}</b></div>
    <div style="margin-top:10px">${keys}</div>`;
}

document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
  const token = $('#own-token').value.trim();
  const ref = $('#own-ref').value.trim();
  const email = $('#own-email').value.trim();
  const out = $('#own-out');
  try { localStorage.setItem(STORE, token); } catch { /* private mode */ }
  if (!token || !ref) { render({ error: 'The token and an order reference or key are both needed.' }); return; }
  const base = await api();
  if (!base) { render({ error: 'The licence server is not switched on yet (tune/config.json has no api).' }); return; }
  out.hidden = false; out.innerHTML = '<p class="small muted">Asking the server…</p>';
  try {
    const r = await fetch(`${base}/v1/tune/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, action: b.dataset.act, ref, email: email || undefined }) });
    const d = await r.json().catch(() => ({ error: `The server answered ${r.status} with no detail.` }));
    const notes = { resend: d.ok ? `Sent to ${d.sentTo}.` : 'Not sent.', revoke: 'The order is switched off.', restore: 'The order is back on.', release: d.released ? `${d.released} is free; the next PC that runs it locks it.` : '' };
    render(d, r.ok ? notes[b.dataset.act] || '' : '');
  } catch { render({ error: 'Could not reach the licence server.' }); }
}));
