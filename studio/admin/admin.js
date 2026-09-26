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
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* What is wired up, from the server's own health line: the quickest check of the setup steps. */
(async () => {
  const el = $('#own-health');
  const base = await api();
  if (!base) { el.innerHTML = '<span class="off">Licence server: not switched on</span> (tune/config.json has no api; the deploy writes it).'; return; }
  try {
    const h = await (await fetch(`${base}/v1/health`, { cache: 'no-store' })).json();
    const bit = (on, name) => `<span class="${on ? 'on' : 'off'}">${esc(name)}: ${on ? 'on' : 'off'}</span>`;
    // Refunds reach the keys by Square's webhook when one is set up; otherwise the server asks Square on the hour, which is fine.
    const refunds = h.refunds === 'webhook' ? bit(true, 'Refunds by webhook') : (h.refunds === 'hourly' ? bit(true, 'Refunds checked hourly') : bit(false, 'Refunds'));
    const mail = h.mail ? bit(true, h.mailer === 'gmail' ? 'Mail through Gmail' : 'Mail') : bit(false, 'Mail');
    el.innerHTML = [bit(true, 'Licence server'), bit(h.square, 'Square'), refunds, mail, bit(h.owner, 'Owner token')].join(' · ')
      + (h.build ? ` <span class="muted">· build ${esc(h.build)}${h.deployed ? `, deployed ${esc(h.deployed.replace('T', ' ').replace('Z', ' UTC'))}` : ''}</span>` : '');
  } catch { el.innerHTML = `<span class="off">Licence server: not answering</span> at ${esc(base)}.`; }
})();

function render(d, note) {
  const out = $('#own-out');
  out.hidden = false;
  if (d.error) { out.innerHTML = `<div class="note bad">${esc(d.error)}</div>`; return; }
  if (d.sentTo && !Array.isArray(d.keys)) { out.innerHTML = `<div class="note ok">${esc(note || `Sent to ${d.sentTo}.`)}</div>`; return; }
  if (Array.isArray(d.sent) && Array.isArray(d.failed)) {
    const line = (x) => `<div class="own-key"><span class="mono" style="font-size:12px">${esc(x.order)}</span><span>${esc(x.email)}</span></div>`;
    out.innerHTML = `<div class="note ${d.failed.length ? 'bad' : 'ok'}">${d.orders ? `${esc(d.sent.length)} of ${esc(d.orders)} unsent order${d.orders === 1 ? '' : 's'} sent${d.failed.length ? `; ${esc(d.failed.length)} refused by Resend (press "Send a test email" for its reason)` : ''}.` : 'Every order has had its keys emailed; nothing to send.'}</div>${d.sent.map(line).join('')}${d.failed.length ? `<p class="small muted" style="margin:10px 0 4px">Not sent</p>${d.failed.map(line).join('')}` : ''}`;
    return;
  }
  if (d.orders) {
    const t = d.totals;
    out.innerHTML = (t ? `<div class="own-row"><span>Since the first sale</span><b>${esc(t.orders)} order${t.orders === 1 ? '' : 's'} · ${esc(money(t.paidCents))} kept${t.refundedOrders ? ` · ${esc(t.refundedOrders)} refunded (${esc(money(t.refundedCents))})` : ''}</b></div>` : '')
      + `<p class="small muted" style="margin:8px 0 6px">The last ${d.orders.length} orders, newest first. Paste an order or a key above to act on one.</p>` + (d.orders.length ? d.orders.map((o) => `
      <div class="own-key"><span><b>${esc(o.product === 'squad' ? 'Squad' : 'Tune')}</b> · ${o.paidCents ? `$${(o.paidCents / 100).toFixed(2)}` : '?'} · ${esc(when(o.createdAt))}<br><span class="muted tiny">${esc(o.email || 'no email')} · order ${esc(o.order)}${o.receipt ? ` · receipt #${esc(o.receipt)}` : ''}</span></span>
        <span>${o.off ? `<b class="off">${esc(o.off)} of ${esc(o.keys)} off</b>` : `<b class="on">${esc(o.keys)} on</b>`}${o.emailedAt ? '' : ' · <span class="off">not emailed</span>'}</span></div>`).join('') : '<p class="muted">Nothing sold yet.</p>');
    return;
  }
  const keys = (Array.isArray(d.keys) ? d.keys : []).map((k, i) => `
    <div class="own-key"><span class="mono">${esc(k.key)}</span>
      <span>${k.revoked ? '<b class="off">off</b>' : '<b class="on">on</b>'} · on ${esc(k.pcs)} PC${k.pcs === 1 ? '' : 's'}${k.movedAt ? ` · moved ${esc(when(k.movedAt))}` : ''}</span></div>`).join('');
  out.innerHTML = `
    ${note ? `<div class="note ok" style="margin-bottom:12px">${esc(note)}</div>` : ''}
    <div class="own-row"><span>Order</span><b class="mono" style="font-size:12px">${esc(d.order)}</b></div>
    <div class="own-row"><span>Receipt number</span><b>${d.receipt ? '#' + esc(d.receipt) : 'none on file'}</b></div>
    <div class="own-row"><span>Email on file</span><b>${esc(d.email || 'none')}</b></div>
    <div class="own-row"><span>Paid</span><b>${d.paidCents ? `$${(d.paidCents / 100).toFixed(2)}` : 'unknown'}</b></div>
    <div class="own-row"><span>Bought</span><b>${esc(when(d.createdAt))}</b></div>
    <div class="own-row"><span>Keys emailed</span><b>${esc(when(d.emailedAt))}</b></div>
    <div style="margin-top:10px">${keys}</div>`;
}

// Switching keys off or freeing them from a PC takes two presses within five seconds: a phone is where this runs, and a thumb slips.
const RISKY = ['revoke', 'revoke-key', 'release'];
function armed(b) {
  if (!RISKY.includes(b.dataset.act)) return true;
  if (b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = b.dataset.label; return true; }
  b.dataset.label = b.dataset.label || b.textContent;
  b.dataset.armed = '1'; b.textContent = 'Press again to confirm';
  setTimeout(() => { if (b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = b.dataset.label; } }, 5000);
  return false;
}

document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
  if (!armed(b)) return;
  const token = $('#own-token').value.trim();
  const ref = $('#own-ref').value.trim();
  const email = $('#own-email').value.trim();
  const out = $('#own-out');
  try { localStorage.setItem(STORE, token); } catch { /* private mode */ }
  if (!token) { render({ error: 'The owner token is needed.' }); return; }
  if (!ref && !['recent', 'mail-test', 'resend-unsent', 'summary'].includes(b.dataset.act)) { render({ error: 'An order reference or a key is needed.' }); return; }
  const base = await api();
  if (!base) { render({ error: 'The licence server is not switched on yet (tune/config.json has no api).' }); return; }
  out.hidden = false; out.innerHTML = '<p class="small muted">Asking the server…</p>';
  try {
    const r = await fetch(`${base}/v1/tune/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, action: b.dataset.act, ref, email: email || undefined }) });
    const d = await r.json().catch(() => ({ error: `The server answered ${r.status} with no detail.` }));
    const notes = { resend: d.ok ? `Sent to ${d.sentTo}.` : 'Not sent.', revoke: 'The order is switched off.', 'revoke-key': d.revokedKey ? `${d.revokedKey} is switched off; the order's other keys stay on.` : '', restore: 'The order is back on.', release: d.released ? `${d.released} is free; the next PC that runs it locks it.` : '', 'mail-test': d.sentTo ? `A test email went to ${d.sentTo} from ${d.from}. Check that inbox, and spam.` : '', summary: d.week ? `Sent to ${d.sentTo}. Last seven days: ${plural(d.week.orders, 'order')}, ${money(d.week.paidCents)} kept, ${d.week.refundedOrders} refunded. Since the first sale: ${plural(d.all.orders, 'order')}, ${money(d.all.paidCents)} kept, ${plural(d.keys, 'key')} on ${plural(d.pcs, 'PC')}.` : '' };
    render(d, r.ok ? notes[b.dataset.act] || '' : '');
  } catch { render({ error: 'Could not reach the licence server.' }); }
}));
