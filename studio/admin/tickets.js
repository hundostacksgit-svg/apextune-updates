/*
 * Support tickets, on the owner's support device.
 *
 * This browser makes an ECDSA P-256 key pair once. The private half is
 * created non-extractable and kept in IndexedDB: page code can ask the
 * browser to sign with it, and nothing, this page included, can read it out.
 * The public half is registered with the server using the owner token. From
 * then on every request is signed, carries the time, and the server refuses
 * one that is not newer than the last, so the token alone reads no ticket
 * and a copied request cannot be replayed. A second browser gets a pairing
 * code that this one approves.
 */
import { TUNE } from '../assets/config.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const box = $('#sup-owner');

/* ---------------- the key, in IndexedDB ---------------- */
function idb() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open('omnidx-support', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('device');
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function kept(value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('device', value === undefined ? 'readonly' : 'readwrite');
    const st = tx.objectStore('device');
    const rq = value === undefined ? st.get('me') : (value === null ? st.delete('me') : st.put(value, 'me'));
    rq.onsuccess = () => resolve(value === undefined ? rq.result || null : value);
    rq.onerror = () => reject(rq.error);
  });
}

/* ---------------- the server ---------------- */
let apiBase = null;
async function api() {
  if (apiBase !== null) return apiBase;
  try { const cfg = await (await fetch(TUNE.configUrl, { cache: 'no-store' })).json(); apiBase = String(cfg.api || '').replace(/\/+$/, ''); } catch { apiBase = ''; }
  return apiBase;
}
async function post(path, body) {
  const base = await api();
  if (!base) return { status: 0, data: { error: 'The licence server is not switched on yet (tune/config.json has no api).' } };
  try {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({ error: `The server answered ${r.status} with no detail.` })) };
  } catch { return { status: 0, data: { error: 'Could not reach the licence server.' } }; }
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let lastTs = 0;
let chain = Promise.resolve();
/** One signed request at a time, so their times arrive in order. */
function signed(body) {
  const run = async () => {
    const me = await kept();
    if (!me) return { status: 0, data: { error: 'This browser has no support key.' } };
    for (let attempt = 0; ; attempt++) {
      lastTs = Math.max(Date.now(), lastTs + 1);
      const payload = JSON.stringify({ ts: lastTs, ...body });
      const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, me.privateKey, new TextEncoder().encode(payload)));
      const r = await post('/v1/support/owner', { device: me.id, payload, sig });
      // Another tab on this device signed in between: step past its time once.
      if (r.status === 409 && r.data.lastTs && attempt === 0) { lastTs = Math.max(lastTs, Number(r.data.lastTs)); continue; }
      return r;
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

function guessLabel() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'A device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  return `${os}, ${br}`;
}

/* ---------------- the states ---------------- */
function drawNone(note = '') {
  box.innerHTML = `
    ${note ? `<div class="note bad">${esc(note)}</div>` : ''}
    <p class="small" style="margin:0 0 12px">Tickets can be read only on a <b>support device</b>. Make this browser yours: it creates a key that never leaves it, and from then on the owner token alone opens no ticket. Do this on the device you will answer from; another one can be added later, only with this one's approval.</p>
    <div class="field"><label for="sup-label">A name for this device</label><input class="input" id="sup-label" maxlength="60" value="${esc(guessLabel())}"></div>
    <button class="btn btn-primary btn-sm" type="button" id="sup-make">Make this browser the support device</button>
    <p class="tiny muted" style="margin:10px 0 0">Uses the owner token above. Clearing this browser's site data deletes the key; approve a second device (a phone, say) so that never locks you out.</p>
    <div id="sup-make-out" aria-live="polite"></div>`;
  $('#sup-make').addEventListener('click', register);
}

async function register() {
  const out = $('#sup-make-out');
  const token = $('#own-token').value.trim();
  if (!token) { out.innerHTML = '<div class="note bad">Type the owner token above first.</div>'; return; }
  if (!window.crypto?.subtle || !window.indexedDB) { out.innerHTML = '<div class="note bad">This browser cannot keep a private key. Use a current Chrome, Edge, Safari or Firefox, not a private window.</div>'; return; }
  const b = $('#sup-make'); b.disabled = true;
  try {
    let me = await kept();
    if (!me) {
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      me = { privateKey: pair.privateKey, publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey), id: null, label: $('#sup-label').value.trim() };
    }
    const r = await post('/v1/support/device', { token, publicKey: me.publicJwk, label: $('#sup-label')?.value.trim() || me.label });
    if (r.status !== 200) { out.innerHTML = `<div class="note bad">${esc(r.data.error)}</div>`; b.disabled = false; return; }
    me.id = r.data.device;
    await kept(me);
    try { await navigator.storage?.persist?.(); } catch { /* the browser decides */ }
    start();
  } catch (err) {
    out.innerHTML = `<div class="note bad">Could not make the key: ${esc(err.message || err)}</div>`;
    b.disabled = false;
  }
}

function drawPending(code) {
  box.innerHTML = `
    <div class="note info">This browser is waiting to become a support device. On your support device, open this page, and under <b>Devices</b> approve the code:</div>
    <p class="mono" style="font-size:30px;letter-spacing:.2em;text-align:center;margin:10px 0 14px">${esc(code || '')}</p>
    <p class="tiny muted" style="margin:0 0 12px">The code lasts half an hour. It was also emailed to the support address.</p>
    <button class="btn btn-sm" type="button" id="sup-check">Check again</button>`;
  $('#sup-check').addEventListener('click', start);
}

let view = { filter: 'open', open: null };
async function drawList() {
  const r = await signed({ action: 'list' });
  if (r.status !== 200) return trouble(r);
  if (r.data.status === 'pending') return drawPending(r.data.code);
  const all = r.data.tickets;
  const shown = view.filter === 'open' ? all.filter((t) => t.status !== 'closed') : all;
  $('#sup-count').textContent = r.data.unread ? `${r.data.unread} new` : '';
  box.innerHTML = `
    <div class="own-actions" style="margin:0 0 10px">
      <button class="btn btn-sm ${view.filter === 'open' ? 'btn-primary' : ''}" type="button" data-filter="open">Open (${esc(r.data.open)})</button>
      <button class="btn btn-sm ${view.filter === 'all' ? 'btn-primary' : ''}" type="button" data-filter="all">All (${esc(all.length)})</button>
      <button class="btn btn-sm btn-ghost" type="button" data-reload>Refresh</button>
    </div>
    ${shown.length ? shown.map((t) => `
      <button class="own-ticket${t.unread ? ' unread' : ''}" type="button" data-ticket="${esc(t.id)}">
        <span class="own-ticket-top"><b class="mono">${esc(t.id)}</b> <span>${esc(t.topicLabel)}</span> <span class="own-st ${esc(t.status)}">${t.unread ? 'new' : esc(t.status)}</span></span>
        <span class="own-ticket-last">${t.lastFrom === 'owner' ? 'You: ' : ''}${esc(t.last)}</span>
        <span class="tiny muted">${esc(when(t.updatedAt))} · ${esc(t.messages)} message${t.messages === 1 ? '' : 's'}${t.email ? ` · ${esc(t.email)}` : ' · no email'}</span>
      </button>`).join('') : `<p class="small muted">${view.filter === 'open' ? 'No open tickets.' : 'No tickets yet.'}</p>`}
    <details class="own-devices" style="margin-top:18px"><summary class="small" style="cursor:pointer"><b>Devices</b> that can read tickets</summary><div id="sup-devices"><p class="small muted">Loading…</p></div></details>`;
  box.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { view.filter = b.dataset.filter; drawList(); }));
  box.querySelector('[data-reload]').addEventListener('click', drawList);
  box.querySelectorAll('[data-ticket]').forEach((b) => b.addEventListener('click', () => openTicket(b.dataset.ticket)));
  box.querySelector('.own-devices').addEventListener('toggle', (e) => { if (e.target.open) drawDevices(); });
}

async function openTicket(id, prefetched) {
  view.open = id;
  const r = prefetched || await signed({ action: 'view', id });
  if (r.status !== 200) return trouble(r);
  const k = r.data.ticket;
  box.innerHTML = `
    <div class="own-actions" style="margin:0 0 12px"><button class="btn btn-sm" type="button" data-back>← All tickets</button></div>
    <div class="own-row"><span>Ticket</span><b class="mono">${esc(k.id)}</b></div>
    <div class="own-row"><span>About</span><b>${esc(k.topicLabel)}</b></div>
    <div class="own-row"><span>Status</span><b>${esc(k.status)}</b></div>
    <div class="own-row"><span>Email</span><b>${esc(k.email || 'none given')}</b></div>
    ${k.ref ? `<div class="own-row"><span>Receipt, order or key</span><b class="mono" style="font-size:12.5px">${esc(k.ref)}</b></div>` : ''}
    <div class="own-row"><span>Opened</span><b>${esc(when(k.createdAt))}</b></div>
    <div class="own-msgs">${k.messages.map((m) => `
      <div class="own-msg ${m.from === 'owner' ? 'me' : ''}"><div class="tiny muted">${m.from === 'owner' ? 'You' : 'Customer'} · ${esc(when(m.at))}</div><div class="own-msg-body">${esc(m.text)}</div></div>`).join('')}
    </div>
    ${r.data.emailed === true ? '<div class="note ok">Sent. The customer was emailed a link to the ticket.</div>' : r.data.emailed === false ? '<div class="note ok">Sent. The customer already has an unread notice, so no second email.</div>' : ''}
    <div class="field"><label for="sup-answer">Answer</label><textarea class="input" id="sup-answer" maxlength="5000" style="min-height:120px;font:inherit;line-height:1.5"></textarea></div>
    <div id="sup-answer-out" aria-live="polite"></div>
    <div class="own-actions">
      <button class="btn btn-primary btn-sm" type="button" data-send>Send the answer</button>
      ${k.status === 'closed' ? '<button class="btn btn-sm" type="button" data-do="reopen">Reopen</button>' : '<button class="btn btn-sm" type="button" data-do="close">Close it</button>'}
      <button class="btn btn-sm btn-ghost" type="button" data-do="delete">Delete the ticket</button>
    </div>
    <p class="tiny muted" style="margin:10px 0 0">${k.email ? 'Your answer is not put in the email; the customer gets a private link to the ticket.' : 'No email on this ticket: the customer sees the answer when they open the ticket again.'}</p>`;
  box.querySelector('[data-back]').addEventListener('click', () => { view.open = null; drawList(); });
  box.querySelector('[data-send]').addEventListener('click', async (e) => {
    const text = $('#sup-answer').value.trim();
    if (!text) { $('#sup-answer-out').innerHTML = '<div class="note bad">Write the answer first.</div>'; return; }
    e.currentTarget.disabled = true;
    const a = await signed({ action: 'reply', id, message: text });
    if (a.status !== 200) { e.currentTarget.disabled = false; $('#sup-answer-out').innerHTML = `<div class="note bad">${esc(a.data.error)}</div>`; return; }
    openTicket(id, a);
  });
  box.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.do === 'delete' && b.dataset.armed !== '1') {
      b.dataset.armed = '1'; b.textContent = 'Press again to delete it for good';
      setTimeout(() => { if (b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = 'Delete the ticket'; } }, 5000);
      return;
    }
    const a = await signed({ action: b.dataset.do, id });
    if (a.status !== 200) { $('#sup-answer-out').innerHTML = `<div class="note bad">${esc(a.data.error)}</div>`; return; }
    if (b.dataset.do === 'delete') { view.open = null; drawList(); } else openTicket(id, a);
  }));
}

async function drawDevices(prefetched) {
  const host = $('#sup-devices');
  const r = prefetched || await signed({ action: 'devices' });
  if (r.status !== 200) { host.innerHTML = `<div class="note bad">${esc(r.data.error)}</div>`; return; }
  host.innerHTML = r.data.devices.map((d) => `
    <div class="own-key"><span><b>${esc(d.label)}</b>${d.me ? ' <span class="on">(this browser)</span>' : ''}<br><span class="tiny muted">${d.status === 'active' ? `added ${esc(when(d.approvedAt || d.createdAt))} · last used ${esc(when(d.lastSeen))}` : 'waiting for approval'}</span></span>
      <button class="btn btn-sm btn-ghost" type="button" data-remove="${esc(d.id)}">Remove</button></div>`).join('') + `
    <div class="field" style="margin-top:14px"><label for="sup-code">Add a device: the code it shows</label><input class="input mono" id="sup-code" maxlength="6" autocomplete="off" spellcheck="false" placeholder="ABC234"></div>
    <button class="btn btn-sm" type="button" id="sup-approve">Approve</button>
    <div id="sup-dev-out" aria-live="polite"></div>
    <p class="tiny muted" style="margin:10px 0 0">To add one: on the other device, open this page, type the owner token and press "Make this browser the support device". It shows a code; type it here. Remove any device you do not recognise. The last one cannot be removed.</p>`;
  host.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Press again'; setTimeout(() => { if (b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = 'Remove'; } }, 5000); return; }
    const a = await signed({ action: 'remove', id: b.dataset.remove });
    if (a.status !== 200) { $('#sup-dev-out').innerHTML = `<div class="note bad">${esc(a.data.error)}</div>`; return; }
    drawDevices(a);
  }));
  $('#sup-approve').addEventListener('click', async () => {
    const a = await signed({ action: 'approve', code: $('#sup-code').value });
    if (a.status !== 200) { $('#sup-dev-out').innerHTML = `<div class="note bad">${esc(a.data.error)}</div>`; return; }
    drawDevices(a);
  });
}

async function trouble(r) {
  if (r.status === 403) {
    // Removed, or the database was cleared: the key is still here, and can be registered again with the token.
    drawNone('The server no longer knows this browser as a support device. Register it again (the owner token is needed, and if another device is active it will have to approve).');
    return;
  }
  box.innerHTML = `<div class="note bad">${esc(r.data.error || 'Something went wrong.')}</div><button class="btn btn-sm" type="button" id="sup-retry">Try again</button>`;
  $('#sup-retry').addEventListener('click', start);
}

async function start() {
  if (!box) return;
  if (!(await api())) { box.innerHTML = '<p class="small muted">Tickets start working once the licence server is switched on.</p>'; return; }
  let me = null;
  try { me = await kept(); } catch { /* no IndexedDB here */ }
  if (!me || !me.id) {
    // Registering needs the owner token on the server; say so before the button fails.
    let h = null;
    try { h = await (await fetch(`${await api()}/v1/health`, { cache: 'no-store' })).json(); } catch { /* the button will say */ }
    return drawNone(h && h.owner === false ? 'The server has no owner token yet, so no browser can become the support device. Add the TUNE_ADMIN_TOKEN repository secret (any long password), run "Deploy the Worker" in GitHub Actions, then come back and press the button with that password.' : '');
  }
  const r = await signed({ action: 'status' });
  if (r.status !== 200) return trouble(r);
  if (r.data.status === 'pending') return drawPending(r.data.code);
  return view.open ? openTicket(view.open) : drawList();
}

start();
// A quiet look for new tickets every two minutes while the list is on screen.
setInterval(() => { if (document.visibilityState === 'visible' && !view.open && box?.querySelector('[data-reload]') && !box.querySelector('.own-devices[open]')) drawList(); }, 120_000);
