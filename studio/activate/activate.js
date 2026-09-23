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
 * With the Worker deployed (tune/config.json has an `api`), the keys are
 * minted and recorded on the server after it confirms the order with Square,
 * and this page only shows what the server issued. Without it the key desk
 * is shut: the buy buttons close and this page mints nothing. Nothing here
 * can make a key; docs/TUNE.md says how the Worker is deployed.
 */

import { TUNE, PAY } from '../assets/config.js';
import { parseKey } from '../assets/tunekey.js';

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
 * Get the key for an order: from the licence server, which confirms the
 * payment with Square before minting, and from nowhere else. This page never
 * makes a key itself, so a URL, an order number or this file's source is not
 * a key. No server, or a server that cannot be reached, is a plain message.
 */
async function issue(product, order, email = '') {
  const base = await api();
  if (!base) throw new Refused('The key desk is not open yet: keys are issued by the licence server after Square confirms the payment, and it is not switched on. If you paid, email support with your receipt.', 503);
  let r;
  try {
    r = await fetch(`${base}/v1/tune/issue`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ product, order, email: email || undefined }),
    });
  } catch {
    throw new Refused('Could not reach the licence server. Try again in a minute; if it keeps failing, email support with your receipt.', 0);
  }
  const data = await r.json().catch(() => ({}));
  if (r.ok && data.key) return { ...data, keys: Array.isArray(data.keys) && data.keys.length ? data.keys : [data.key], order, email: email || '', source: 'server' };
  throw new Refused(data.error || 'The licence server refused this order.', r.status);
}

function remember(info) {
  try { localStorage.setItem(STORE, JSON.stringify({ ...info, at: Date.now() })); } catch { /* private mode */ }
}
function remembered() {
  try { const v = JSON.parse(localStorage.getItem(STORE) || 'null'); return v && parseKey(v.key) ? { ...v, keys: Array.isArray(v.keys) && v.keys.length ? v.keys : [v.key] } : null; } catch { return null; }
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

function keyFile(info) {
  const p = TUNE.products[info.product] || TUNE.products.tune;
  const keys = info.keys || [info.key];
  const many = keys.length > 1;
  return [
    many ? 'OmniDx Tune - your keys' : 'OmniDx Tune - your key', '',
    ...keys.map((k, i) => (many ? `Key ${i + 1}:    ${k}` : `Key:      ${k}`)),
    `Product:  ${p.name} (${many ? `${keys.length} keys, one PC each` : 'one PC'})`,
    info.order ? `Order:    ${info.order}` : null, '',
    'On the PC you want tuned, open PowerShell and paste' + (many ? ' (each person their own line)' : '') + ':',
    ...keys.map((k) => `  $env:OMNIDX_KEY='${k}'; ${TUNE.command}`), '',
    'Undo:   $env:OMNIDX_MODE=\'undo\'; ' + TUNE.command, '',
    'Extreme (caution - fewer conveniences, a few more frames; undo puts it all back):',
    `  $env:OMNIDX_MODE='extreme'; $env:OMNIDX_KEY='${keys[0]}'; ${TUNE.command}`,
    'Help:   https://omnidx.net/studio/download/', '',
    many ? 'Each key locks to the first PC that runs it. Keep this file.' : 'The key locks to the first PC that runs it. Keep this file.',
  ].filter((l) => l !== null).join('\r\n');
}

function renderKey(info, { again = false } = {}) {
  const p = TUNE.products[info.product] || TUNE.products.tune;
  const keys = info.keys || [info.key];
  const many = keys.length > 1;
  const oneLiner = `$env:OMNIDX_KEY='${keys[0]}'; ${TUNE.command}`;
  const file = keyFile(info);
  const mail = `mailto:?subject=${encodeURIComponent(many ? 'My OmniDx Tune keys' : 'My OmniDx Tune key')}&body=${encodeURIComponent(file.replace(/\r\n/g, '\n'))}`;
  const save = 'data:text/plain;charset=utf-8,' + encodeURIComponent(file);
  const boxes = keys.map((k, i) => `
    <div class="keybox"><small>${many ? (i === 0 ? `Key ${i + 1} — yours` : `Key ${i + 1} — give away`) : 'Your key'}</small>${esc(k)}</div>
    ${many ? `<div class="act-copy" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">${copyButton(k, 'Copy the key')}${copyButton(`$env:OMNIDX_KEY='${k}'; ${TUNE.command}`, 'Copy the whole line for this key')}</div>` : ''}`).join('');
  $('#card').innerHTML = `
    <div class="act-tick" aria-hidden="true">✓</div>
    <h1>${again ? (many ? 'Your keys, again' : 'Your key, again') : (many ? 'Here are your keys' : 'Here is your key')}</h1>
    <p class="act-sub">${esc(p.name)} — ${many ? `${keys.length} keys, one PC each` : 'one PC'}. Paid once. Nothing renews.</p>

    ${boxes}
    <div class="act-copy" style="gap:8px;flex-wrap:wrap">${many ? '' : copyButton(keys[0], 'Copy the key')}
      <a class="btn btn-sm btn-ghost" href="${mail}">${many ? 'Email them to myself' : 'Email it to myself'}</a>
      <a class="btn btn-sm btn-ghost" href="${save}" download="omnidx-tune-key.txt">Save as a file</a>
      <button class="btn btn-sm btn-ghost" type="button" onclick="print()">Print</button></div>
    <p class="tiny" id="act-mail" style="text-align:center;margin:8px 0 0;color:var(--ok,#35d07f)">${info.emailed ? 'Also sent to the email you gave at checkout. ' : ''}<button class="btn btn-sm btn-ghost" type="button" id="act-resend">${info.emailed ? 'Not there? Send it again' : (many ? 'Send them to my checkout email' : 'Send it to my checkout email')}</button></p>
    <p class="tiny" id="act-mail-out" style="text-align:center;margin:6px 0 0" hidden></p>
    <p class="tiny muted" style="text-align:center;margin:8px 0 0">Letters only look like this: no I, O, 0 or 1 in a key, and capitals do not matter.</p>
    <p class="tiny muted" id="act-seats" style="text-align:center;margin:6px 0 0" hidden></p>

    <div class="act-h">On the PC you want tuned</div>
    <ol class="steps-list">
      <li><b>Close Discord and Spotify</b><p>They are only tuned while they are closed. Everything else can stay open.</p></li>
      <li><b>Open PowerShell</b><p>Press the Windows key, type <b>powershell</b>, press Enter. It does not need to be run as administrator — it asks for that itself.</p></li>
      <li><b>Paste this and press Enter</b>
        <div class="cmd"><code data-text="${esc(oneLiner)}"><span class="ps">&gt;</span>${esc(oneLiner)}</code>${copyButton(oneLiner)}</div>
        <p class="cmd-note">${many ? 'Your first key is in the line. Each friend pastes the same line with their own key in it: the copy buttons above have each one ready, and "Save as a file" holds all three.' : 'Your key is in the line, so nothing has to be typed.'} It opens the app with the key filled in. Nothing is installed: the tune runs from memory and leaves its report, its undo and its backups in <span class="mono">C:\\OmniDx</span>.</p></li>
      <li><b>Tick what you want, press Run</b><p>The window shows your PC, every phase and every startup app as a tick box. Press Run: a restore point first, then the cut, with a live log. Three to five minutes; the debloat is most of it.</p></li>
      <li><b>Restart, then do the BIOS checklist</b><p>The report it opens at the end has the checklist for your exact board — the memory profile alone is worth more than half of the tune.</p></li>
    </ol>

    <div class="act-h" style="color:var(--warn,#ffc247)">Extreme — caution</div>
    <p class="small" style="margin:0 0 10px">Everything above, plus what the people who tune for a living set afterwards: every extra service, Game Bar entirely, animations and transparency off, the taskbar search box and notification toasts off, multi-plane overlay off, memory compression off, superfetch and Windows Search off, the dynamic tick off, the service hosts grouped the old way, the Xbox pieces gone unless you use Game Pass or Minecraft, and an advanced BIOS list in the report. A few more frames and steadier lows for fewer conveniences. It asks first, records every line, and undo puts all of it back. Run the standard tune first; use this when you want the last of it.</p>
    <div class="cmd"><code data-text="${esc(`$env:OMNIDX_MODE='extreme'; ${oneLiner}`)}"><span class="ps">&gt;</span>${esc(`$env:OMNIDX_MODE='extreme'; ${oneLiner}`)}</code>${copyButton(`$env:OMNIDX_MODE='extreme'; ${oneLiner}`)}</div>
    <p class="cmd-note">Same key, same PC, no extra charge. The app opens with Extreme ticked; untick it to run the standard tune instead.</p>

    <div class="act-h">Receipt</div>
    <div class="act-row"><span>Product</span><b>${esc(p.name)} — ${many ? `${keys.length} keys, one PC each` : '1 PC'}</b></div>
    <div class="act-row"><span>Paid</span><b>$${p.once.toFixed(2)} once</b></div>
    ${info.order ? `<div class="act-row"><span>Square order</span><b class="mono" style="font-size:12px">${esc(info.order)}</b></div>` : ''}
    <div class="act-row"><span>Payment</span><b>${info.verified ? 'Confirmed with Square' : 'From Square\u2019s redirect'}</b></div>
    <div class="act-row"><span>Renews</span><b>Never — there is no subscription</b></div>
    <div class="act-row"><span>Refunds</span><b><a href="../terms/#money">Fourteen days, no questions</a></b></div>

    <div class="act-actions">
      <a class="btn btn-ghost" href="../download/">Everything the command does, screen by screen</a>
    </div>

    <details class="act-move" style="margin-top:22px">
      <summary class="small" style="cursor:pointer;color:var(--text-2)"><b>New PC? Move ${many ? 'a key' : 'this key'}</b> — once every 30 days, by yourself</summary>
      <div class="field" style="margin-top:12px;text-align:left">
        ${many ? `<label for="act-move-key" class="small"><b>Which key</b></label>
        <select class="input" id="act-move-key">${keys.map((k, i) => `<option value="${esc(k)}">Key ${i + 1} — ${esc(k)}</option>`).join('')}</select>` : ''}
        <label for="act-move-order" class="small" ${many ? 'style="margin-top:10px;display:block"' : ''}><b>Order or receipt number</b></label>
        <input class="input" id="act-move-order" placeholder="From your Square receipt" autocomplete="off" spellcheck="false" value="${esc(info.order || '')}">
        <p class="tiny muted" style="margin:7px 0 0">The key is unbound from the PC it is on and locks to the next PC that runs it. The old PC keeps its settings and its undo.</p>
      </div>
      <button class="btn btn-sm" type="button" id="act-move">Move the key</button>
      <p class="tiny" id="act-move-out" style="margin:10px 0 0" hidden></p>
    </details>

    <p class="act-note">
      <b>${many ? 'Keep these keys.' : 'Keep this key.'}</b> ${many ? 'They are' : 'It is'} saved in this browser and this page will show ${many ? 'them' : 'it'} again, but take a screenshot too.
      ${many ? 'Each key locks to the first PC that runs it' : 'It locks to the first PC that runs it'}; running it again on the same PC after a Windows update is free and expected.
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
      <label for="act-order" class="small"><b>Receipt number</b></label>
      <input class="input" id="act-order" placeholder="From Square's email, e.g. #AB12" autocomplete="off" spellcheck="false">
      <p class="tiny muted" style="margin:7px 0 0">The short receipt number on Square's email, or the long order id from the page you landed on.</p>
    </div>
    <div class="field" style="text-align:left">
      <label for="act-email" class="small"><b>The email you paid with</b></label>
      <input class="input" id="act-email" type="email" placeholder="The address Square sent the receipt to" autocomplete="email" spellcheck="false">
      <p class="tiny muted" style="margin:7px 0 0">Needed with a receipt number, so a guessed number cannot fetch somebody else's key.</p>
    </div>

    <div class="field" style="margin-top:16px;text-align:left">
      <label class="small"><b>What did you buy?</b></label>
      <div class="act-actions" style="margin-top:8px">
        ${Object.values(TUNE.products).map((p) =>
          `<button class="btn btn-ghost" type="button" data-pick="${esc(p.id)}">
            ${esc(p.name)} — $${p.once.toFixed(2)} · ${p.keys > 1 ? `${p.keys} keys, one PC each` : 'one PC'}</button>`).join('')}
      </div>
    </div>

    <p class="act-note" id="act-err" hidden style="color:var(--bad)"></p>
    <p class="act-note">Not bought yet? <a href="../pricing/">It is $${TUNE.products.tune.once.toFixed(2)}, once.</a></p>
    ${supportBlock('OmniDx Tune — paid, no key')}`;

  $('#card').addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    const order = String($('#act-order')?.value || '').trim();
    const email = String($('#act-email')?.value || '').trim();
    const err = $('#act-err');
    if (order.replace(/^#/, '').length < 4) {
      if (err) { err.hidden = false; err.textContent = 'Put in the receipt number from Square\'s email first — it is what the key is issued against.'; }
      $('#act-order')?.focus();
      return;
    }
    if (order.replace(/^#/, '').length <= 8 && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      if (err) { err.hidden = false; err.textContent = 'With a receipt number, the email address you paid with is needed as well.'; }
      $('#act-email')?.focus();
      return;
    }
    go(pick.dataset.pick, order, email);
  });
}

/* With the licence server: how many PCs the key is on, and the move button. */
async function wireExtras(info) {
  const base = await api();
  const seats = $('#act-seats');
  const keys = info.keys || [info.key];
  if (base) {
    try {
      const bits = [];
      for (const [i, k] of keys.entries()) {
        const r = await fetch(`${base}/v1/tune/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: k }) });
        const d = await r.json();
        if (d.ok) bits.push(`${keys.length > 1 ? `Key ${i + 1}: ` : ''}on ${d.used} of ${d.seats} PC${d.seats === 1 ? '' : 's'}`);
      }
      if (bits.length && seats) { seats.hidden = false; seats.textContent = bits.join(' · ') + '.'; }
    } catch { /* the server is optional */ }
  }
  // The keys to the checkout address again: the server sends to the address on file and nowhere else.
  $('#act-resend')?.addEventListener('click', async () => {
    const out = $('#act-mail-out');
    out.hidden = false;
    if (!base) { out.textContent = 'Sending needs the licence server, which is not switched on yet. Save the keys from this page, or email support with your receipt.'; return; }
    if (!info.order) { out.textContent = 'Open this page from the link Square sent you to, or put in your receipt number, and press this again.'; return; }
    out.textContent = 'Sending…';
    try {
      const r = await fetch(`${base}/v1/tune/issue`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: info.product, order: info.order, email: info.email || undefined, resend: true }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { out.textContent = d.error || 'The server refused.'; return; }
      out.textContent = d.resent ? `Sent again to ${d.sentTo}. Check spam if it is not there in a minute.` : (d.reason || `Already sent to ${d.sentTo}.`);
    } catch { out.textContent = 'Could not reach the licence server. Try again in a minute, or email support.'; }
  });
  $('#act-move')?.addEventListener('click', async () => {
    const out = $('#act-move-out');
    const order = String($('#act-move-order')?.value || '').trim();
    const which = String($('#act-move-key')?.value || info.key);
    out.hidden = false;
    if (!base) { out.textContent = 'Moving a key by yourself needs the licence server, which is not switched on yet. Email support with your receipt and it moves the same day.'; return; }
    if (order.replace(/^#/, '').length < 4) { out.textContent = 'Put in the order number from your Square receipt first.'; return; }
    out.textContent = 'Moving…';
    try {
      const r = await fetch(`${base}/v1/tune/release`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: which, order }) });
      const d = await r.json().catch(() => ({}));
      out.textContent = r.ok ? `Done. The key is free again; run the command on the new PC and it locks there.` : (d.error || 'The server refused.');
      if (r.ok && seats && keys.length === 1) { seats.textContent = `On 0 of ${d.seats} PC${d.seats === 1 ? '' : 's'}.`; }
    } catch { out.textContent = 'Could not reach the licence server. Try again in a minute, or email support.'; }
  });
}

async function go(product, order, email = '') {
  $('#card').innerHTML = '<div class="act-spin" aria-hidden="true"></div><h1>Getting your key</h1><p class="act-sub">One moment.</p>';
  try {
    const info = await issue(product, order, email);
    remember(info);
    renderKey(info);
    wireExtras(info);
  } catch (err) {
    // A refusal is the expected answer on a wrong order or a closed desk; only a surprise is an error.
    if (err instanceof Refused) console.warn('activation', err.message); else console.error('activation', err);
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
