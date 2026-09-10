/* DOM and formatting helpers shared by every panel. Nothing here knows what a
   clip is — that keeps the panels free to be rewritten without touching this. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function toast(msg, kind = '', ms = 2600) {
  const host = $('#toast-host');
  if (!host) return;
  const node = el('div', { class: `toast ${kind}` }, msg);
  host.appendChild(node);
  // A queue of toasts covering the viewer is worse than missing one of them.
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => {
    node.style.transition = 'opacity .25s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 260);
  }, ms);
}

/** Non-blocking confirm. Resolves true/false; Esc counts as false. */
export function confirmDialog({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = $('#modal');
    $('.modal-body', dlg).innerHTML = `
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-ghost" data-x="no">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(confirmText)}</button>
      </div>`;
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; dlg.close(); resolve(v); };
    $('[data-x="no"]', dlg).onclick = () => done(false);
    $('[data-x="yes"]', dlg).onclick = () => done(true);
    dlg.onclose = () => done(false);
    dlg.showModal();
  });
}

/** Show arbitrary markup in the shared dialog. Returns the body element. */
export function modal(html) {
  const dlg = $('#modal');
  const body = $('.modal-body', dlg);
  body.innerHTML = html;
  dlg.showModal();
  return body;
}
export function closeModal() { $('#modal')?.close(); }

/* ---------- formatting ---------- */

/** Timecode as HH:MM:SS:FF. Editors count frames, not milliseconds. */
export function tc(seconds, fps = 30) {
  const s = Math.max(0, Number(seconds) || 0);
  const total = Math.round(s * fps);
  const f = total % fps;
  const secs = Math.floor(total / fps);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}:${pad(f)}`;
}

/** Short duration for chips and clip labels: 4.2s, 1:03, 12:04. */
export function dur(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export function bytes(b) {
  if (!Number.isFinite(b) || b < 0) return '--';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- form builders ---------- */
/* Panels are rebuilt wholesale on every change, so these return markup rather
   than live nodes; the panel wires up one delegated listener afterwards. */

export function slider({ key, label, value, min, max, step = 1, unit = '', fmt }) {
  const shown = fmt ? fmt(value) : `${Number(value).toFixed(step < 1 ? 2 : 0)}${unit}`;
  return `<div class="field">
    <label for="f-${esc(key)}">${esc(label)}<span class="val" data-val="${esc(key)}">${esc(shown)}</span></label>
    <input type="range" id="f-${esc(key)}" data-k="${esc(key)}" min="${min}" max="${max}"
           step="${step}" value="${value}">
  </div>`;
}

export function toggleRow({ key, label, on, hint }) {
  return `<div class="field">
    <label style="cursor:pointer">
      <span>${esc(label)}${hint ? `<br><span class="tiny muted">${esc(hint)}</span>` : ''}</span>
      <input type="checkbox" data-k="${esc(key)}" ${on ? 'checked' : ''}>
    </label>
  </div>`;
}

export function selectRow({ key, label, value, options }) {
  const opts = options.map(([v, t]) =>
    `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `<div class="field">
    <label for="s-${esc(key)}">${esc(label)}</label>
    <select class="input" id="s-${esc(key)}" data-k="${esc(key)}">${opts}</select>
  </div>`;
}

export function group(title, inner, open = true, attrs = '') {
  return `<details class="group" ${open ? 'open' : ''} ${attrs}>
    <summary>${esc(title)}</summary><div class="gbody">${inner}</div></details>`;
}

export function empty(icon, title, body) {
  return `<div class="empty"><div class="eico">${icon}</div>
    <h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
}

/** Drag helper: calls move(dx, dy, ev) until pointer-up, then end(). */
export function drag(startEv, { move, end }) {
  startEv.preventDefault();
  const x0 = startEv.clientX, y0 = startEv.clientY;
  const onMove = (e) => move(e.clientX - x0, e.clientY - y0, e);
  const onUp = (e) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    end?.(e);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
