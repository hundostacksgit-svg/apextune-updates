/* Small DOM + rendering helpers shared by every module. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape untrusted text before it goes into innerHTML. */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function toast(msg, kind = '') {
  const host = $('#toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 2400);
}

export function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}

/** Non-blocking confirm built on <dialog>; resolves true/false. */
export function confirmDialog({ title, body, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dlg = $('#modal');
    $('.modal-body', dlg).innerHTML = `
      <h3>${esc(title)}</h3>
      <p class="small">${esc(body)}</p>
      <div class="btn-row" style="margin-bottom:0">
        <button class="btn" data-x="no">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(confirmText)}</button>
      </div>`;
    const done = (v) => { dlg.close(); resolve(v); };
    $('[data-x="no"]',  dlg).onclick = () => done(false);
    $('[data-x="yes"]', dlg).onclick = () => done(true);
    dlg.onclose = () => resolve(false);
    dlg.showModal();
  });
}

export const fmt = {
  num(v, dp = 0) {
    if (v === null || v === undefined || Number.isNaN(v)) return '--';
    return Number(v).toFixed(dp);
  },
  bytes(b) {
    if (!Number.isFinite(b) || b < 0) return '--';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
  },
  dur(s) {
    if (!Number.isFinite(s)) return '--';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
    return h ? `${h}h ${m}m` : m ? `${m}m ${x}s` : `${x}s`;
  },
  when(ts) {
    const d = new Date(ts);
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  },
};

/* ---------- markup builders ---------- */

export function stat(label, value, unit = '', tone = '') {
  return `<div class="stat ${tone}">
    <div class="k">${esc(label)}</div>
    <div class="v">${esc(value)}${unit ? `<span class="u">${esc(unit)}</span>` : ''}</div>
  </div>`;
}

export function rows(pairs) {
  const body = pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<div class="row"><span class="rk">${esc(k)}</span><span class="rv">${esc(v)}</span></div>`)
    .join('');
  return `<div class="rows">${body || '<div class="row"><span class="rk muted">No data</span></div>'}</div>`;
}

/** Sweep gauge, 240° arc. `pct` is 0..1 of the sweep. */
export function gauge({ label, value, unit = '', pct = 0, tone = '' }) {
  const R = 42, C = 50, START = 150, SWEEP = 240;
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  const arc = (from, to) => {
    const pt = (deg) => {
      const r = (deg * Math.PI) / 180;
      return [(C + R * Math.cos(r)).toFixed(2), (C + R * Math.sin(r)).toFixed(2)];
    };
    const [x1, y1] = pt(from), [x2, y2] = pt(to);
    return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'url(#gg)';
  return `<div class="gauge">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff9e2b"/><stop offset="1" stop-color="#ff4a3a"/>
      </linearGradient></defs>
      <path d="${arc(START, START + SWEEP)}" fill="none" stroke="var(--line)" stroke-width="8" stroke-linecap="round"/>
      ${p > 0.005 ? `<path d="${arc(START, START + SWEEP * p)}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>` : ''}
    </svg>
    <div class="gv">${esc(value)}</div>
    <div class="gu">${esc(unit)}</div>
    <div class="gl">${esc(label)}</div>
  </div>`;
}

/**
 * Big score ring, 0-100. `extra` is trusted markup appended under the subtitle
 * (used for the check-engine badge); everything else is escaped.
 */
export function scoreRing(score, title, subtitle, extra = '') {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const R = 40, CIRC = 2 * Math.PI * R;
  const tone = s >= 75 ? 'var(--ok)' : s >= 55 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="score">
    <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
      <circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--line)" stroke-width="9"/>
      <circle cx="50" cy="50" r="${R}" fill="none" stroke="${tone}" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${(CIRC * (1 - s / 100)).toFixed(1)}"
        transform="rotate(-90 50 50)"/>
      <text x="50" y="57" text-anchor="middle" font-size="27" font-weight="700"
        fill="${tone}" font-family="ui-monospace,monospace">${s}</text>
    </svg>
    <div>
      <h3>${esc(title)}</h3>
      <div class="st">${esc(subtitle)}</div>
      ${extra}
    </div>
  </div>`;
}

export function testItem(t) {
  const glyph = { ok: '✓', bad: '✕', warn: '!', run: '●', idle: '·' }[t.state] || '·';
  return `<li data-test="${esc(t.id)}">
    <span class="mark ${t.state === 'idle' ? '' : t.state}">${glyph}</span>
    <span class="tt"><span class="tn">${esc(t.name)}</span>
    <span class="td">${esc(t.detail || '')}</span></span>
  </li>`;
}

export function empty(icon, title, body) {
  return `<div class="empty"><div class="eico">${icon}</div>
    <h3>${esc(title)}</h3><p class="small">${esc(body)}</p></div>`;
}
