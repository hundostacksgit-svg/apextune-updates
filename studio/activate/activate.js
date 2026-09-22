/*
 * The page Square sends people to after they pay.
 *
 * Payment lands here, a key appears, and the next thing the buyer does is
 * paste one line into PowerShell on the PC they want tuned. No email to wait
 * for, nobody to chase.
 *
 * Which product was bought comes from the URL: each Square link is set to come
 * back here with its own `?e=` on the end (the old edition names still work,
 * so nothing in the Square dashboard had to change). Square appends its own
 * order id to whatever we set, and that id is what the key is issued against —
 * one key per order, so a refresh never mints a second one.
 *
 * With the Worker deployed (tune/config.json has an `api`), the key is minted
 * and recorded on the server, which can also confirm the order with Square.
 * Without it, the key is derived here from the order reference and the
 * script locks it to the first PC that runs it. Honest about what that
 * proves: it believes the redirect. Deploying the Worker is what turns the
 * lock into a real one, and docs/TUNE.md says how.
 */

import { TUNE, PAY } from '../assets/config.js';
import { keyForOrder, parseKey, pretty } from '../assets/tunekey.js';

const STORE = 'omnidx.tune.key';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- what the URL says ---------------- */

function productFromUrl(params) {
  const named = String(params.get('e') || params.get('edition') || params.get('p') || '').toLowerCase();
  if (TUNE.fromRedirect[named]) return TUNE.fromRedirect[named];

  // A link edited by hand in the Square dashboard and missing its query
  // string: the amount paid still says what was bought.
  const paid = Number(params.get('amount') || params.get('total') || 0);
  if (paid > 0) {
    const dollars = paid > 500 ? paid / 100 : paid;
    return dollars + 0.01 >= TUNE.products.squad.once ? 'squad' : 'tune';
  }
  return null;
}

/** Square's own identifiers, under whichever name this link happens to use. */
function orderFromUrl(params) {
  for (const k of ['orderId', 'order_id', 'transactionId', 'transaction_id', 'order', 'checkoutId', 'paymentId']) {
    const v = params.get(k);
    if (v) return v;
  }
  return '';
}

/* ---------------- the licence server, if there is one ---------------- */

let apiBase = null;
async function api() {
  if (apiBase !== null) return apiBase;
  try {
    const r = await fetch(TUNE.configUrl, { cache: 'no-store' });
    const cfg = await r.json();
    apiBase = String(cfg.api || '').replace(/\/+$/, '');
  } catch { apiBase = ''; }
  return apiBase;
}

class Refused extends Error { constructor(message, status) { super(message); this.status = status; } }

/**
 * Get the key for an order. Server first; if there is no server or it cannot
 * be reached, derive it here. A server that positively refuses (no completed
 * payment, refunded) is not worked around.
 */
async function issue(product, order) {
  const base = await api();
  if (base) {
    try {
      const r = await fetch(`${base}/v1/tune/issue`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product, order }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.key) return { ...data, order, source: 'server' };
      if (r.status === 402 || r.status === 410 || r.status === 400) throw new Refused(data.error || 'The licence server refused this order.', r.status);
    } catch (err) {
      if (err instanceof Refused) throw err;
      // Down, slow or blocked: fall through. The key still has to appear.
    }
  }
  const key = await keyForOrder(product, order);
  return { key: pretty(key), product, seats: TUNE.products[product].seats, verified: false, order, source: 'local' };
}

function remember(info) {
  try { localStorage.setItem(STORE, JSON.stringify({ ...info, at: Date.now() })); } catch { /* private mode */ }
}
function remembered() {
  try { const v = JSON.parse(localStorage.getItem(STORE) || 'null'); return v && parseKey(v.key) ? v : null; } catch { return null; }
}

/* ---------------- rendering ---------------- */

function supportBlock(subject) {
  const addr = (PAY.supportEmail || '').trim();
  if (!addr) return '';
  return `<p class="act-note">Something not right?
    <a href="mailto:${esc(addr)}?subject=${encodeURIComponent(subject)}">${esc(addr)}</a>
    — include your Square receipt and it gets sorted.</p>`;
}

function copyButton(text, label = 'Copy') {
  return `<button class="btn btn-sm" type="button" data-copy-text="${esc(text)}">${esc(label)}</button>`;
}

function keyFile(info, oneLiner) {
  const p = TUNE.products[info.product] || TUNE.products.tune;
  return [
    'OmniDx Tune - your key', '',
    `Key:      ${info.key}`,
    `Product:  ${p.name} (${p.seats === 1 ? 'one PC' : `${p.seats} PCs`})`,
    info.order ? `Order:    ${info.order}` : null, '',
    'On the PC you want tuned, open PowerShell and paste:', `  ${oneLiner}`, '',
    'Undo:   $env:OMNIDX_MODE=\'undo\'; ' + TUNE.command,
    'Help:   https://omnidx.net/studio/download/', '',
    'The key locks to the first PC that runs it. Keep this file.',
  ].filter((l) => l !== null).join('\r\n');
}

function renderKey(info, { again = false } = {}) {
  const p = TUNE.products[info.product] || TUNE.products.tune;
  const oneLiner = `$env:OMNIDX_KEY='${info.key}'; ${TUNE.command}`;
  const file = keyFile(info, oneLiner);
  const mail = `mailto:?subject=${encodeURIComponent('My OmniDx Tune key')}&body=${encodeURIComponent(file.replace(/\r\n/g, '\n'))}`;
  const save = 'data:text/plain;charset=utf-8,' + encodeURIComponent(file);
  $('#card').innerHTML = `
    <div class="act-tick" aria-hidden="true">✓</div>
    <h1>${again ? 'Your key, again' : 'Here is your key'}</h1>
    <p class="act-sub">${esc(p.name)} — ${p.seats === 1 ? 'one PC' : `${p.seats} PCs`}. Paid once. Nothing renews.</p>

    <div class="keybox"><small>Your key</small>${esc(info.key)}</div>
    <div class="act-copy" style="gap:8px;flex-wrap:wrap">${copyButton(info.key, 'Copy the key')}
      <a class="btn btn-sm btn-ghost" href="${mail}">Email it to myself</a>
      <a class="btn btn-sm btn-ghost" href="${save}" download="omnidx-tune-key.txt">Save as a file</a>
      <button class="btn btn-sm btn-ghost" type="button" onclick="print()">Print</button></div>
    <p class="tiny muted" style="text-align:center;margin:8px 0 0">Letters only look like this: no I, O, 0 or 1 in a key, and capitals do not matter.</p>
    <p class="tiny muted" id="act-seats" style="text-align:center;margin:6px 0 0" hidden></p>

    <div class="act-h">On the PC you want tuned</div>
    <ol class="steps-list">
      <li><b>Close Discord and Spotify</b><p>They are only tuned while they are closed. Everything else can stay open.</p></li>
      <li><b>Open PowerShell</b><p>Press the Windows key, type <b>powershell</b>, press Enter. It does not need to be run as administrator — it asks for that itself.</p></li>
      <li><b>Paste this and press Enter</b>
        <div class="cmd"><code data-text="${esc(oneLiner)}"><span class="ps">&gt;</span>${esc(oneLiner)}</code>${copyButton(oneLiner)}</div>
        <p class="cmd-note">Your key is in the line, so nothing has to be typed. It opens the app with the key filled in. Nothing is installed: the tune runs from memory and leaves its report, its undo and its backups in <span class="mono">C:\\OmniDx</span>.</p></li>
      <li><b>Tick what you want, press Run</b><p>The window shows your PC, every phase and every startup app as a tick box. Press Run: a restore point first, then the cut, with a live log. Three to five minutes; the debloat is most of it.</p></li>
      <li><b>Restart, then do the BIOS checklist</b><p>The report it opens at the end has the checklist for your exact board — the memory profile alone is worth more than half of the tune.</p></li>
    </ol>

    <div class="act-h">Receipt</div>
    <div class="act-row"><span>Product</span><b>${esc(p.name)} — ${p.seats === 1 ? '1 PC' : `${p.seats} PCs`}</b></div>
    <div class="act-row"><span>Paid</span><b>$${p.once.toFixed(2)} once</b></div>
    ${info.order ? `<div class="act-row"><span>Square order</span><b class="mono" style="font-size:12px">${esc(info.order)}</b></div>` : ''}
    <div class="act-row"><span>Payment</span><b>${info.verified ? 'Confirmed with Square' : 'From Square\u2019s redirect'}</b></div>
    <div class="act-row"><span>Renews</span><b>Never — there is no subscription</b></div>

    <div class="act-actions">
      <a class="btn btn-ghost" href="../download/">Everything the command does, screen by screen</a>
    </div>

    <details class="act-move" style="margin-top:22px">
      <summary class="small" style="cursor:pointer;color:var(--text-2)"><b>New PC? Move this key</b> — once every 30 days, by yourself</summary>
      <div class="field" style="margin-top:12px;text-align:left">
        <label for="act-move-order" class="small"><b>Order or receipt number</b></label>
        <input class="input" id="act-move-order" placeholder="From your Square receipt" autocomplete="off" spellcheck="false" value="${esc(info.order || '')}">
        <p class="tiny muted" style="margin:7px 0 0">The key is unbound from the PC it is on and locks to the next PC that runs it. The old PC keeps its settings and its undo.</p>
      </div>
      <button class="btn btn-sm" type="button" id="act-move">Move the key</button>
      <p class="tiny" id="act-move-out" style="margin:10px 0 0" hidden></p>
    </details>

    <p class="act-note">
      <b>Keep this key.</b> It is saved in this browser and this page will show it again, but take a screenshot too.
      It locks to the first PC that runs it${p.seats > 1 ? ` (the first ${p.seats})` : ''}; running it again on the same PC after a Windows update is free and expected.
      Replaced your PC? Email with the receipt and it moves.
    </p>
    ${supportBlock(`OmniDx Tune — key ${info.key}`)}`;
}

/*
 * Arriving with no order reference.
 *
 * Without an order from Square's redirect the receipt number has to be typed
 * in — so the URL on its own is not a free key, and every key issued has a
 * receipt behind it that can be checked in the Square dashboard.
 */
function renderUnknown(message = '') {
  $('#card').innerHTML = `
    <h1>Get your key</h1>
    <p class="act-sub">Paying normally brings you here with it. If it did not, your Square receipt number will.</p>

    ${message ? `<div class="note bad" style="margin:0 0 18px">${esc(message)}</div>` : ''}

    <div class="field" style="text-align:left">
      <label for="act-order" class="small"><b>Order or receipt number</b></label>
      <input class="input" id="act-order" placeholder="From your Square receipt email" autocomplete="off" spellcheck="false">
      <p class="tiny muted" style="margin:7px 0 0">It is on the confirmation email from Square, near the top.</p>
    </div>

    <div class="field" style="margin-top:16px;text-align:left">
      <label class="small"><b>What did you buy?</b></label>
      <div class="act-actions" style="margin-top:8px">
        ${Object.values(TUNE.products).map((p) =>
          `<button class="btn btn-ghost" type="button" data-pick="${esc(p.id)}">
            ${esc(p.name)} — $${p.once.toFixed(2)} · ${p.seats === 1 ? 'one PC' : `${p.seats} PCs`}</button>`).join('')}
      </div>
    </div>

    <p class="act-note" id="act-err" hidden style="color:var(--bad)"></p>
    <p class="act-note">Not bought yet? <a href="../pricing/">It is $${TUNE.products.tune.once.toFixed(2)}, once.</a></p>
    ${supportBlock('OmniDx Tune — paid, no key')}`;

  $('#card').addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    const order = String($('#act-order')?.value || '').trim();
    const err = $('#act-err');
    if (order.length < 6) {
      if (err) { err.hidden = false; err.textContent = 'Put in the order number from your Square receipt first — it is what the key is issued against.'; }
      $('#act-order')?.focus();
      return;
    }
    go(pick.dataset.pick, order);
  });
}

/* With the licence server: how many PCs the key is on, and the move button. */
async function wireExtras(info) {
  const base = await api();
  const seats = $('#act-seats');
  if (base) {
    try {
      const r = await fetch(`${base}/v1/tune/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: info.key }) });
      const d = await r.json();
      if (d.ok && seats) { seats.hidden = false; seats.textContent = `On ${d.used} of ${d.seats} PC${d.seats === 1 ? '' : 's'}.`; }
    } catch { /* the server is optional */ }
  }
  $('#act-move')?.addEventListener('click', async () => {
    const out = $('#act-move-out');
    const order = String($('#act-move-order')?.value || '').trim();
    out.hidden = false;
    if (!base) { out.textContent = 'Moving a key by yourself needs the licence server, which is not switched on yet. Email support with your receipt and it moves the same day.'; return; }
    if (order.length < 6) { out.textContent = 'Put in the order number from your Square receipt first.'; return; }
    out.textContent = 'Moving…';
    try {
      const r = await fetch(`${base}/v1/tune/release`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: info.key, order }) });
      const d = await r.json().catch(() => ({}));
      out.textContent = r.ok ? `Done. The key is free again; run the command on the new PC and it locks there.` : (d.error || 'The server refused.');
      if (r.ok && seats) { seats.textContent = `On 0 of ${d.seats} PC${d.seats === 1 ? '' : 's'}.`; }
    } catch { out.textContent = 'Could not reach the licence server. Try again in a minute, or email support.'; }
  });
}

async function go(product, order) {
  $('#card').innerHTML = '<div class="act-spin" aria-hidden="true"></div><h1>Getting your key</h1><p class="act-sub">One moment.</p>';
  try {
    const info = await issue(product, order);
    remember(info);
    renderKey(info);
    wireExtras(info);
  } catch (err) {
    console.error('activation', err);
    renderUnknown(err instanceof Refused ? err.message : 'Could not issue a key just now. Try again, or email with your receipt.');
  }
}

/* copy buttons, for both screens */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy-text]');
  if (!b) return;
  try {
    await navigator.clipboard.writeText(b.dataset.copyText);
    const was = b.textContent; b.textContent = 'Copied'; b.closest('.cmd')?.classList.add('ok');
    setTimeout(() => { b.textContent = was; b.closest('.cmd')?.classList.remove('ok'); }, 1600);
  } catch { b.textContent = 'Select and press Ctrl+C'; }
});

/* ---------------- start ---------------- */

const params = new URLSearchParams(location.search);
const product = productFromUrl(params);
const order = orderFromUrl(params);
const saved = remembered();

if (product && order) go(product, order);
else if (saved) { renderKey(saved, { again: true }); wireExtras(saved); }
else if (product) renderUnknown();
else renderUnknown();
