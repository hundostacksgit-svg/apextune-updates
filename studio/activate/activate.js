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

function renderKey(info, { again = false } = {}) {
  const p = TUNE.products[info.product] || TUNE.products.tune;
  const oneLiner = `$env:OMNIDX_KEY='${info.key}'; ${TUNE.command}`;
  $('#card').innerHTML = `
    <div class="act-tick" aria-hidden="true">✓</div>
    <h1>${again ? 'Your key, again' : 'Here is your key'}</h1>
    <p class="act-sub">${esc(p.name)} — ${p.seats === 1 ? 'one PC' : `${p.seats} PCs`}. Paid once. Nothing renews.</p>

    <div class="keybox"><small>Your key</small>${esc(info.key)}</div>
    <div class="act-copy">${copyButton(info.key, 'Copy the key')}</div>

    <div class="act-h">On the PC you want tuned</div>
    <ol class="steps-list">
      <li><b>Close Discord and Spotify</b><p>They are only tuned while they are closed. Everything else can stay open.</p></li>
      <li><b>Open PowerShell</b><p>Press the Windows key, type <b>powershell</b>, press Enter. It does not need to be run as administrator — it asks for that itself.</p></li>
      <li><b>Paste this and press Enter</b>
        <div class="cmd"><code data-text="${esc(oneLiner)}"><span class="ps">&gt;</span>${esc(oneLiner)}</code>${copyButton(oneLiner)}</div>
        <p class="cmd-note">Your key is in the line, so nothing has to be typed. Nothing is installed: the tune runs from memory and leaves its report, its undo and its backups in <span class="mono">C:\\OmniDx</span>.</p></li>
      <li><b>Say yes to the restore point, then watch it go</b><p>It reads your PC, shows what it found, and asks once before it changes anything. About two minutes.</p></li>
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

async function go(product, order) {
  $('#card').innerHTML = '<div class="act-spin" aria-hidden="true"></div><h1>Getting your key</h1><p class="act-sub">One moment.</p>';
  try {
    const info = await issue(product, order);
    remember(info);
    renderKey(info);
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
else if (saved) renderKey(saved, { again: true });
else if (product) renderUnknown();
else renderUnknown();
