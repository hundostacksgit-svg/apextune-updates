/*
 * Contact support: pick what it is about, read the quick answer for that,
 * and open a ticket if it did not help. A ticket is a thread with OmniDx
 * support that only its private link opens (#t=<id>.<secret>); the link is
 * kept in this browser and, when an address is given, emailed. The server
 * keeps a hash of the secret, never the secret.
 */
import { TUNE, PAY } from '../assets/config.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE = 'omnidx.support';
const LINK = /^#t=(T-[A-HJ-NP-Z2-9]{6})\.([0-9a-f]{32})$/;

const cmd = (text) => `<div class="cmd"><code>${esc(text)}</code><button class="btn btn-sm" type="button" data-copy-text="${esc(text)}">Copy</button></div>`;

/* The options, each with the quick answer that settles most of them. */
const TOPICS = [
  {
    id: 'no-key', ico: '🔓', title: 'I paid but have no key', line: 'Get it with your receipt number',
    help: `<p><b>This one is usually instant.</b> Open <a href="../activate/">Your key</a> and type the receipt number from Square's email (the # number) or the order number: the key shows on the spot. The keys also went to the email you paid with; look in spam too.</p><p>Still nothing? Open a ticket with the receipt number and the email you paid with.</p>`,
    msg: 'What happened: when you paid, and what the key page said', ref: 'Receipt or order number, or the email you paid with', refPh: '#1234 or you@example.com',
  },
  {
    id: 'key', ico: '🔑', title: "My key won't work", line: 'Refused, already used, or not accepted',
    help: `<p><b>Copy the key from the email rather than typing it.</b> Keys never contain 0, O, 1 or I, so a typed one often has a wrong letter.</p><p>A key locks to the first PC that runs it, and a second PC on the same key is refused. The same PC after a fresh Windows install is still the same PC. New PC? That is the next option.</p>`,
    msg: 'What the window said, word for word if you can', ref: 'The key', refPh: 'TUNE-XXXX-XXXX-XXXX-XXXX',
  },
  {
    id: 'new-pc', ico: '🖥️', title: 'New PC or new parts', line: 'Move a key to another PC',
    help: `<p><b>You can move a key yourself.</b> On <a href="../activate/">Your key</a>, open "New PC? Move this key" and type your order or receipt number. That works once every 30 days, and the next PC to run the command takes the key.</p><p>Moved one in the last 30 days and need it again? Open a ticket.</p>`,
    msg: 'What changed: a new PC, a new motherboard, or something else', ref: 'Receipt or order number', refPh: '#1234',
  },
  {
    id: 'run', ico: '⚠️', title: 'Something went wrong during a run', line: 'An error, a stop, or something off after',
    help: `<p><b>Nothing it changed is stuck.</b> Undo puts every change back (next option), and a restore point was made before the first change.</p><p>For the ticket: paste the last lines the window showed. Each run also writes a report and a transcript to <span class="mono">C:\\OmniDx</span>; the newest <span class="mono">report-&lt;date&gt;.txt</span> says what was done, and pasting its end helps most.</p>`,
    msg: 'What you ran, what it said, and what you expected', ref: 'Your key, if you have one (optional)', refPh: 'TUNE-XXXX-XXXX-XXXX-XXXX',
  },
  {
    id: 'undo', ico: '↩️', title: 'Put something back', line: 'Undo everything, or one thing',
    help: `<p><b>Undo is one line</b> in PowerShell, and it puts back every change the tune recorded:</p>${cmd("$env:OMNIDX_MODE='undo'; irm omnidx.net/go.ps1 | iex")}<p>Only the newest run (say, you tried Extreme):</p>${cmd("$env:OMNIDX_MODE='undolast'; irm omnidx.net/go.ps1 | iex")}<p>No internet? In an administrator PowerShell:</p>${cmd('powershell -ExecutionPolicy Bypass -File C:\\OmniDx\\undo\\undo.ps1')}<p>Want one app or setting back and the rest left as it is? Say which in a ticket.</p>`,
    msg: 'Which app or setting you want back, if it is not everything', ref: '', refPh: '',
  },
  {
    id: 'before', ico: '💬', title: 'A question before buying', line: 'Will it suit my PC, anti-cheat, laptops',
    help: `<p><b>The free report answers most of these on your own PC.</b> It runs the same read and changes nothing: it says what the tune would do. See <a href="../download/#report">Free report mode</a>.</p><p>Anti-cheat, laptops, streaming and new PCs are in the <a href="../pricing/#faq">FAQ</a>, and <a href="../trust/">Is this safe?</a> has the straight answer on trust.</p>`,
    msg: 'Your question', ref: '', refPh: '',
  },
  {
    id: 'payment', ico: '💳', title: 'Payment', line: 'A receipt, an order, a charge',
    help: `<p><b>Every sale is final</b>, and <a href="../terms/">the terms</a> say why: the free report shows what it would do on your PC before you pay.</p><p>For a receipt you need, an order you cannot find, or a charge you do not recognise, open a ticket with the receipt number and the email you paid with.</p>`,
    msg: 'What it is about', ref: 'Receipt or order number', refPh: '#1234',
  },
  {
    id: 'other', ico: '✉️', title: 'Something else', line: 'Anything not above',
    help: `<p>Say what it is and support answers here.</p>`,
    msg: 'Your message', ref: '', refPh: '',
  },
];
const topicOf = (id) => TOPICS.find((t) => t.id === id);

/* ---------------- the tickets this browser knows ---------------- */
function mine() { try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function remember(t) {
  const list = mine().filter((x) => x.id !== t.id);
  list.unshift({ id: t.id, secret: t.secret, topic: t.topic || '', at: t.at || Date.now() });
  try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 30))); } catch { /* private mode: the link still works */ }
}
function forget(id) { try { localStorage.setItem(STORE, JSON.stringify(mine().filter((x) => x.id !== id))); } catch { /* nothing kept */ } }
const linkOf = (t) => `${location.origin}${location.pathname}#t=${t.id}.${t.secret}`;

/* ---------------- the server ---------------- */
let apiBase = null;
async function api() {
  if (apiBase !== null) return apiBase;
  try { const cfg = await (await fetch(TUNE.configUrl, { cache: 'no-store' })).json(); apiBase = String(cfg.api || '').replace(/\/+$/, ''); } catch { apiBase = ''; }
  return apiBase;
}
async function post(path, body) {
  const base = await api();
  if (!base) return { status: 0, data: { error: 'Tickets are not switched on yet.' } };
  try {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => ({ error: `The server answered ${r.status} with no detail.` })) };
  } catch { return { status: 0, data: { error: 'Could not reach support. Check your connection and try again.' } }; }
}

const when = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const STATUS = { open: ['open', 'Waiting for support'], answered: ['answered', 'Support answered'], closed: ['closed', 'Solved'] };
const chip = (s) => { const [c, label] = STATUS[s] || ['', s]; return `<span class="chip ${c}">${esc(label)}</span>`; };

/* ---------------- one ticket ---------------- */
let current = null; // { id, secret }
async function openThread(t, { fresh = null, scroll = true } = {}) {
  current = { id: t.id, secret: t.secret };
  const box = $('#sup-thread');
  box.hidden = false;
  if (!fresh) box.innerHTML = '<p class="small muted">Opening the ticket…</p>';
  if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const r = fresh ? { status: 200, data: { ticket: fresh.ticket } } : await post('/v1/support/view', { id: t.id, secret: t.secret });
  if (r.status !== 200) {
    box.innerHTML = `<div class="note bad">${esc(r.data.error || 'That ticket could not be opened.')}</div>
      <div class="sup-actions"><button class="btn btn-sm" type="button" data-close-thread>Back</button>${r.status === 404 ? '<button class="btn btn-sm btn-ghost" type="button" data-forget>Forget it on this browser</button>' : ''}</div>`;
    bindThread(t);
    return;
  }
  remember({ id: t.id, secret: t.secret, topic: r.data.ticket.topic });
  states[t.id] = r.data.ticket.status;
  drawThread(r.data.ticket, t, fresh);
  drawMine();
}

function drawThread(k, t, fresh) {
  const box = $('#sup-thread');
  const lastMine = k.messages.map((m) => m.from).lastIndexOf('customer');
  const msgs = k.messages.map((m, i) => `
    <div class="msg ${m.from === 'customer' ? 'me' : ''}">
      <div class="who"><span>${m.from === 'customer' ? 'You' : 'OmniDx support'}</span><time datetime="${new Date(m.at).toISOString()}">${esc(when(m.at))}</time></div>
      <div class="body">${esc(m.text)}</div>
    </div>${i === lastMine && k.seen ? '<div class="seen">Read by support</div>' : ''}`).join('');
  const opened = fresh ? `
    <div class="note ok"><b>Ticket ${esc(k.id)} is open.</b> ${fresh.emailed ? `The link to it is on its way to ${esc(k.email)}.` : 'Keep the link below: it is the way back to this ticket from any device.'} It is also saved in this browser.</div>` : '';
  box.innerHTML = `${opened}
    <div class="thread-top">
      <div><h2>Ticket <span class="mono">${esc(k.id)}</span></h2><div class="sub">${esc(k.topicLabel)} · opened ${esc(when(k.createdAt))}${k.email ? ` · replies announced to ${esc(k.email)}` : ''}</div></div>
      ${chip(k.status)}
    </div>
    <div class="msgs">${msgs}</div>
    <form id="sup-reply" novalidate>
      <div class="field"><label for="sup-reply-msg">${k.status === 'closed' ? 'Write again (this opens the ticket again)' : 'Write to support'}</label>
        <textarea class="input" id="sup-reply-msg" maxlength="5000" style="min-height:110px"></textarea></div>
      <div id="sup-reply-out" aria-live="polite"></div>
      <div class="sup-actions">
        <button class="btn btn-primary" type="submit">Send</button>
        <button class="btn btn-ghost" type="button" data-refresh>Check for an answer</button>
        ${k.status !== 'closed' ? '<button class="btn btn-ghost" type="button" data-solved>It is solved</button>' : ''}
        <button class="btn btn-ghost" type="button" data-close-thread>Close</button>
      </div>
    </form>
    <p class="sup-h" style="margin:22px 0 4px">The private link to this ticket</p>
    <div class="linkbox"><input class="input" id="sup-link" readonly value="${esc(linkOf(t))}" aria-label="The private link to this ticket"><button class="btn btn-sm" type="button" data-copy-text="${esc(linkOf(t))}">Copy</button></div>
    <p class="tiny muted" style="margin:6px 0 0">Anyone with this link can read the ticket. Support will never ask you for it. <button class="btn btn-sm btn-ghost" type="button" data-forget style="margin-left:6px">Forget it on this browser</button></p>`;
  bindThread(t);
}

function bindThread(t) {
  const box = $('#sup-thread');
  box.querySelector('[data-close-thread]')?.addEventListener('click', () => { box.hidden = true; current = null; $('#sup-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  box.querySelector('[data-refresh]')?.addEventListener('click', () => openThread(t, { scroll: false }));
  box.querySelector('[data-forget]')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Press again: without the link, this browser cannot open it'; return; }
    forget(t.id); box.hidden = true; current = null; drawMine();
  });
  box.querySelector('[data-solved]')?.addEventListener('click', async () => {
    const r = await post('/v1/support/close', { id: t.id, secret: t.secret });
    if (r.status === 200) { states[t.id] = r.data.ticket.status; drawThread(r.data.ticket, t); drawMine(); } else $('#sup-reply-out').innerHTML = `<div class="note bad">${esc(r.data.error)}</div>`;
  });
  box.querySelector('#sup-reply')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#sup-reply-msg').value.trim();
    const out = $('#sup-reply-out');
    if (!text) { out.innerHTML = '<div class="note bad">Write a message first.</div>'; return; }
    const btn = e.currentTarget.querySelector('[type="submit"]');
    btn.disabled = true;
    const r = await post('/v1/support/reply', { id: t.id, secret: t.secret, message: text });
    btn.disabled = false;
    if (r.status === 200) { states[t.id] = r.data.ticket.status; drawThread(r.data.ticket, t); drawMine(); } else out.innerHTML = `<div class="note bad">${esc(r.data.error)}</div>`;
  });
  bindCopy(box);
}

/* ---------------- the list of this browser's tickets ---------------- */
const states = {}; // id -> status, as last seen
async function checkMine() {
  // Where each of the newest few stands, so "Support answered" shows without opening them one by one.
  await Promise.all(mine().slice(0, 8).map(async (t) => {
    const r = await post('/v1/support/view', { id: t.id, secret: t.secret });
    if (r.status === 200) states[t.id] = r.data.ticket.status;
  }));
  drawMine();
}
function drawMine() {
  const list = mine();
  const card = $('#sup-mine');
  card.hidden = !list.length;
  if (!list.length) return;
  $('#sup-mine-list').innerHTML = list.map((t) => `
    <button class="sup-row" type="button" data-open="${esc(t.id)}">
      <span><span class="mono">${esc(t.id)}</span> · ${esc(topicOf(t.topic)?.title || 'Ticket')}<br><small>opened ${esc(when(t.at))}</small></span>
      <span>${states[t.id] ? chip(states[t.id]) : ''}</span>
    </button>`).join('');
  $('#sup-mine-list').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
    const t = mine().find((x) => x.id === b.dataset.open);
    if (t) openThread(t);
  }));
}

/* ---------------- a new ticket ---------------- */
function drawTopics() {
  $('#sup-topics').insertAdjacentHTML('beforeend', TOPICS.map((t) => `
    <label class="sup-topic"><input type="radio" name="topic" value="${t.id}"><span class="ico" aria-hidden="true">${t.ico}</span>
      <span><b>${esc(t.title)}</b><span class="t">${esc(t.line)}</span></span></label>`).join(''));
  $('#sup-topics').addEventListener('change', (e) => { if (e.target.name === 'topic') pickTopic(e.target.value, true); });
}

function pickTopic(id, fromClick) {
  const t = topicOf(id);
  if (!t) return;
  const radio = document.querySelector(`input[name="topic"][value="${id}"]`);
  if (radio) radio.checked = true;
  $('#sup-step2').hidden = false;
  $('#sup-help').innerHTML = t.help;
  bindCopy($('#sup-help'));
  $('#sup-msg-label').textContent = t.msg;
  $('#sup-ref-field').hidden = !t.ref;
  $('#sup-ref-label').textContent = t.ref;
  $('#sup-ref').placeholder = t.refPh;
  $('#sup-out').innerHTML = '';
  if (fromClick) $('#sup-help').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function bindCopy(root) {
  root.querySelectorAll('[data-copy-text]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copyText); const was = b.textContent; b.textContent = 'Copied'; setTimeout(() => { b.textContent = was; }, 1500); }
      catch { const i = b.parentElement.querySelector('input'); if (i) { i.focus(); i.select(); } }
    });
  });
}

async function send(e) {
  e.preventDefault();
  const out = $('#sup-out');
  const topic = document.querySelector('input[name="topic"]:checked')?.value;
  const message = $('#sup-msg').value.trim();
  const email = $('#sup-email').value.trim();
  if (!topic) { out.innerHTML = '<div class="note bad">Pick what the ticket is about.</div>'; return; }
  if (message.length < 10) { out.innerHTML = '<div class="note bad">Say a little more: what happened, and what you expected.</div>'; $('#sup-msg').focus(); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { out.innerHTML = '<div class="note bad">That email address does not look right.</div>'; $('#sup-email').focus(); return; }
  const btn = $('#sup-send');
  btn.disabled = true; btn.textContent = 'Opening…';
  const r = await post('/v1/support/open', { topic, message, email: email || undefined, ref: $('#sup-ref-field').hidden ? undefined : $('#sup-ref').value.trim() || undefined, website: $('#sup-website').value });
  btn.disabled = false; btn.textContent = 'Open the ticket';
  if (r.status !== 200) { out.innerHTML = `<div class="note bad">${esc(r.data.error || 'That did not go through.')}${r.status === 0 && PAY.supportEmail ? ` You can also email <a href="mailto:${esc(PAY.supportEmail)}">${esc(PAY.supportEmail)}</a>.` : ''}</div>`; return; }
  const t = { id: r.data.id, secret: r.data.secret, topic, at: Date.now() };
  remember(t);
  $('#sup-form').reset();
  $('#sup-step2').hidden = true;
  $('#sup-count').textContent = '0 / 5000';
  await openThread(t, { fresh: r.data });
}

/* ---------------- start ---------------- */
async function start() {
  drawTopics();
  $('#sup-form').addEventListener('submit', send);
  $('#sup-msg').addEventListener('input', () => { $('#sup-count').textContent = `${$('#sup-msg').value.length} / 5000`; });
  drawMine();

  if (!(await api())) {
    const off = $('#sup-off');
    off.hidden = false;
    off.innerHTML = `Tickets are not switched on yet.${PAY.supportEmail ? ` Until they are, email <a href="mailto:${esc(PAY.supportEmail)}?subject=OmniDx%20Tune%20support">${esc(PAY.supportEmail)}</a>.` : ''}`;
    $('#sup-send').disabled = true;
  } else if (mine().length) checkMine();

  // ?topic=<id> preselects an option, for links from elsewhere on the site.
  const pre = new URLSearchParams(location.search).get('topic');
  if (pre && topicOf(pre)) pickTopic(pre, false);
  // A ticket's link, on arrival or pasted into this tab later.
  await fromHash();
  addEventListener('hashchange', fromHash);
}

/** Remember a ticket's link, open it, and take the secret out of the address bar and the history. */
async function fromHash() {
  const m = LINK.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  await openThread({ id: m[1], secret: m[2] });
}

start();
