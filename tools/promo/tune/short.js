/*
 * One TikTok cut. seek(t) sets the tutorial's desktop (in the iframe) to the
 * moment the spec asks for, frames it with this cut's camera, and draws the
 * editor's layer on top: hook, captions, rings, keycaps, cards, chips.
 */
import { SHORTS } from './shorts.js';

const id = new URLSearchParams(location.search).get('id') || SHORTS[0].id;
const S = SHORTS.find((s) => s.id === id);
if (!S) throw new Error(`no short called ${id}`);

const $ = (s, r = document) => r.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u, sy = (u) => ((ay * u + by) * u + cy) * u, dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let u = x; for (let i = 0; i < 8; i++) { const d = sx(u) - x; if (Math.abs(d) < 1e-6) break; const dd = dx(u); if (Math.abs(dd) < 1e-6) break; u -= d / dd; } return sy(clamp(u)); };
}
const E = {
  lin: (p) => p, out: (p) => 1 - Math.pow(1 - p, 3), in: (p) => p * p * p,
  io: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  expo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)), inExpo: (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
  back: (p) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  cam: bezier(0.72, 0, 0.18, 1),
};
const env = (t, a, b, fi = 0.2, fo = 0.2) => (t < a || t > b ? 0 : Math.min(E.out(prog(t, a, a + fi)), 1 - E.in(prog(t, b - fo, b))));
const show = (el, on) => el.classList.toggle('hide', !on);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// "*these words*" in a spec are coloured; "|" breaks a hook line. Every word is its own span so it can pop in.
function words(text) {
  const out = []; let hi = false;
  for (const part of text.split('*')) { for (const w of part.split(/(?<= )/)) if (w) out.push({ w, hi }); hi = !hi; }
  return out;
}
const wordHtml = (list) => list.map((x) => `<span class="w${x.hi ? ' h' : ''}">${esc(x.w)}</span>`).join('');

let W = null;
let CAM = [];

function resolve(to) {
  if (to.cx != null) return { cx: to.cx, cy: to.cy, s: to.s };
  const [k, i] = to.key.split('.');
  const r0 = W.worldRect(k), r = i != null ? r0[+i] : r0;
  return { cx: r.cx + (to.dx || 0), cy: r.cy + (to.dy || 0), s: to.s };
}
function camAt(t) {
  let st = { cx: 960, cy: 540, s: 1 }, setAt = -1;
  for (const k of CAM) {
    if (k.t !== undefined) { if (t >= k.t) { st = { ...k.to }; setAt = k.t; } continue; }
    if (t < k.a) continue;
    const p = (E[k.e] || E.cam)(prog(t, k.a, k.b));
    st = { cx: lerp(st.cx, k.to.cx, p), cy: lerp(st.cy, k.to.cy, p), s: lerp(st.s, k.to.s, p) };
  }
  return { ...st, setAt };
}
function whipAt(t) {
  let x = 0, y = 0;
  for (const w of S.whips || []) {
    const D = w.axis === 'y' ? 2600 : 2000; let o = 0;
    if (t >= w.t - 0.18 && t < w.t) o = w.dir * D * E.inExpo(prog(t, w.t - 0.18, w.t));
    else if (t >= w.t && t < w.t + 0.32) o = -w.dir * D * (1 - E.expo(prog(t, w.t, w.t + 0.32)));
    if (w.axis === 'y') y += o; else x += o;
  }
  return { x, y };
}
const punchAt = (t) => { let k = 1; for (const p of S.punches || []) if (t >= p && t < p + 0.4) k += 0.055 * (1 - E.out(prog(t, p, p + 0.4))); return k; };
const shotAt = (t) => S.shots.find((s) => t >= s.a && t < s.b) || S.shots[S.shots.length - 1];
const srcAt = (sh, t) => (typeof sh.src === 'number' ? sh.src : sh.src[0] + (t - sh.a) * sh.src[1]);

// ---------------------------------------------------------------------------
// Cards, built once.
const CODE = [];
function buildCards(scriptText) {
  const host = $('#cards'); let html = '';
  for (const [i, c] of S.cards.entries()) {
    const cid = `card-${i}`;
    if (c.type === 'count') html += `<div class="card panel hide" id="${cid}" data-type="count" style="top:560px;padding:58px 60px 54px"><div class="k">Processes running</div><div class="row"><span class="was">${c.from}<i></i></span><span class="arrow">→</span><span class="now">${c.from}</span></div><div class="sm"><b>Example run</b> on one PC. Restart for the real number; yours will differ.</div></div>`;
    if (c.type === 'list') html += `<div class="card hide" id="${cid}" data-type="list"><div class="n"></div><div class="name"></div><div class="id"></div><div class="why"></div><div class="stamp">→ DISABLED</div></div>`;
    if (c.type === 'ram') html += `<div class="card panel hide" id="${cid}" data-type="ram"><div class="stick"><div class="fin"></div><div class="lbl">DDR4-3200 · 8 GB</div><div class="pins"></div></div><div class="bars"><div class="bar"><span>3200 MT/s</span>Rated for<div class="tr"><div class="fl"></div></div></div><div class="bar slow"><span>2133 MT/s</span>Running at<div class="tr"><div class="fl"></div></div></div></div></div>`;
    if (c.type === 'cmd') html += `<div class="card hide" id="${cid}" data-type="cmd"><div class="ti">${esc(c.title)}</div><div class="box panel">${c.lines.map((l) => `<div><span class="ps">&gt; </span>${esc(l)}</div>`).join('')}</div><div class="note">Paste into Windows PowerShell</div></div>`;
    if (c.type === 'code') html += `<div class="card panel hide" id="${cid}" data-type="code"><div class="hd"><b>omnidx.ps1</b>public at omnidx.net/tune/omnidx.ps1</div><div class="body"><pre>${CODE.join('\n')}</pre><div class="fade"></div></div></div>`;
    if (c.type === 'games') html += `<div class="card hide" id="${cid}" data-type="games">${c.games.map((g) => `<div class="g">${esc(g)}</div>`).join('')}</div>`;
    if (c.type === 'names') html += `<div class="card hide" id="${cid}" data-type="names">${c.names.map((n) => `<div class="nm">${esc(n)}<i></i></div>`).join('')}</div>`;
    if (c.type === 'quote') html += `<div class="card panel hide" id="${cid}" data-type="quote"><div class="qk">${esc(c.k)}</div><div class="qt">${wordHtml(words(c.text))}</div></div>`;
    if (c.type === 'end') html += `<div class="card hide" id="${cid}" data-type="end"><img src="/studio/assets/logo/omnidx-logo.png" alt=""><div class="l1 t">${wordHtml(words(c.lines[0]))}</div><div class="l2">${wordHtml(words(c.lines[1]))}</div><div class="l3">${wordHtml(words(c.lines[2]))}</div></div>`;
  }
  host.innerHTML = html;
  // The list and names cards lay out from their spec.
  for (const [i, c] of S.cards.entries()) {
    const el = $(`#card-${i}`);
    if (c.type === 'names') {
      const pos = [[80, 420], [560, 470], [150, 610], [520, 700], [90, 810], [560, 900], [180, 1010], [540, 360]];
      [...el.children].forEach((n, j) => { n.style.left = `${pos[j % pos.length][0]}px`; n.style.top = `${pos[j % pos.length][1]}px`; });
    }
  }
}
function codeLines(text) {
  const lines = text.split(/\r?\n/);
  const at = Math.max(0, lines.findIndex((l) => l.includes("@('DiagTrack', 'telemetry')")) - 4);
  return lines.slice(at, at + 44).map((l) => {
    let h = esc(l.length > 64 ? l.slice(0, 63) + '…' : l);
    if (/^\s*#/.test(l)) return `<span class="c">${h}</span>`;
    return h.replace(/'([^']*)'/g, `<span class="s">'$1'</span>`);
  });
}

function seekCard(t, c, el) {
  const on = t >= c.a && t < c.b; show(el, on); if (!on) return;
  const lt = t - c.a, len = c.b - c.a, out = E.in(prog(t, c.b - 0.22, c.b));
  const inP = E.out(prog(lt, 0, 0.35));
  const base = (dy = 70) => { el.style.opacity = (inP * (1 - out)).toFixed(3); el.style.transform = `translateY(${((1 - inP) * dy - out * 30).toFixed(1)}px) scale(${(lerp(0.96, 1, inP) - out * 0.02).toFixed(4)})`; };
  if (c.type === 'count') {
    base();
    const np = E.expo(prog(lt, 0.35, 1.35));
    $('.now', el).textContent = String(Math.round(lerp(c.from, c.to, np)));
    $('.was i', el).style.transform = `scaleX(${E.cam(prog(lt, 0.3, 0.62)).toFixed(3)})`;
  } else if (c.type === 'list') {
    const i = Math.min(c.items.length - 1, Math.floor(lt / c.per)), it = c.items[i], li = lt - i * c.per;
    if (el.dataset.i !== String(i)) { el.dataset.i = String(i); $('.n', el).textContent = `${i + 1} / ${c.items.length}`; $('.name', el).textContent = it.name; $('.id', el).textContent = it.id; $('.why', el).textContent = it.why; }
    const o = E.in(prog(li, c.per - 0.14, c.per));
    const pop = (sel, t0, from = 0.7) => { const p = prog(li, t0, t0 + 0.26); const s = $(sel, el); s.style.opacity = (E.out(p) * (1 - o)).toFixed(3); s.style.transform = `scale(${lerp(from, 1, E.back(p)).toFixed(4)}) translateY(${(-o * 30).toFixed(1)}px)`; };
    el.style.opacity = '1'; el.style.transform = 'none';
    pop('.n', 0); pop('.name', 0.02, 0.6); pop('.id', 0.14); pop('.why', 0.24, 0.9);
    const sp = prog(li, c.per * 0.5, c.per * 0.5 + 0.18), st = $('.stamp', el);
    st.style.opacity = (sp > 0 ? 1 - o : 0).toFixed(3); st.style.transform = `rotate(-4deg) scale(${lerp(1.7, 1, E.out(sp)).toFixed(4)})`;
  } else if (c.type === 'ram') {
    base();
    const f = el.querySelectorAll('.fl');
    f[0].style.width = `${(100 * E.cam(prog(lt, 0.4, 1.0))).toFixed(1)}%`;
    f[1].style.width = `${(100 * (2133 / 3200) * E.cam(prog(lt, 0.9, 1.7))).toFixed(1)}%`;
  } else if (c.type === 'cmd') {
    base();
    [...$('.box', el).children].forEach((d, j) => { const p = E.io(prog(lt, 0.25 + j * 0.3, 0.75 + j * 0.3)); d.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`; });
  } else if (c.type === 'code') {
    base();
    const pre = $('pre', el), travel = Math.max(0, CODE.length * 38 - 820);
    pre.style.transform = `translateY(${(-travel * E.io(prog(lt, 0.3, len - 0.2))).toFixed(1)}px)`;
  } else if (c.type === 'games') {
    el.style.opacity = (1 - out).toFixed(3); el.style.transform = 'none';
    [...el.children].forEach((g, j) => { const p = prog(lt, 0.1 + j * 0.5, 0.36 + j * 0.5); g.style.opacity = E.out(p).toFixed(3); g.style.transform = `scale(${lerp(0.5, 1, E.back(p)).toFixed(4)})`; });
  } else if (c.type === 'names') {
    el.style.opacity = (1 - out).toFixed(3); el.style.transform = 'none';
    [...el.children].forEach((n, j) => { const t0 = j * 0.25, p = prog(lt, t0, t0 + 0.22); n.style.opacity = E.out(p).toFixed(3); n.style.transform = `scale(${lerp(0.4, 1, E.back(p)).toFixed(4)}) rotate(${(((j % 3) - 1) * 3).toFixed(1)}deg)`; $('i', n).style.transform = `scaleX(${E.cam(prog(lt, t0 + 0.2, t0 + 0.42)).toFixed(3)})`; });
  } else if (c.type === 'quote') {
    base();
    [...el.querySelectorAll('.qt .w')].forEach((w, j) => { const p = prog(lt, 0.25 + j * 0.035, 0.45 + j * 0.035); w.style.opacity = lerp(0.12, 1, E.out(p)).toFixed(3); });
  } else if (c.type === 'end') {
    el.style.opacity = (1 - out).toFixed(3); el.style.transform = 'none';
    const img = $('img', el), ip = E.out(prog(lt, 0, 0.45));
    img.style.opacity = ip.toFixed(3); img.style.transform = `scale(${lerp(1.08, 1, ip).toFixed(4)})`;
    [...el.querySelectorAll('.l1 .w')].forEach((w, j) => { const p = prog(lt, 0.2 + j * 0.06, 0.44 + j * 0.06); w.style.opacity = E.out(p).toFixed(3); w.style.transform = `scale(${lerp(0.6, 1, E.back(p)).toFixed(4)})`; });
    for (const [sel, t0] of [['.l2', 0.55], ['.l3', 0.8]]) { const p = E.out(prog(lt, t0, t0 + 0.35)); const e2 = $(sel, el); e2.style.opacity = p.toFixed(3); e2.style.transform = `translateY(${((1 - p) * 24).toFixed(1)}px)`; }
  }
}

// ---------------------------------------------------------------------------
const GRAIN = [];
function drawGrain() {
  for (let k = 0; k < 6; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), img = g.createImageData(256, 256), r = rng(700 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 150; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); GRAIN.push(c.toDataURL('image/png'));
  }
}

function popWords(host, t, a, stagger = 0.05) {
  [...host.querySelectorAll('.w')].forEach((w, j) => { const p = prog(t, a + j * stagger, a + j * stagger + 0.24); w.style.opacity = E.out(p).toFixed(3); w.style.transform = `translateY(${((1 - E.out(p)) * 26).toFixed(1)}px) scale(${lerp(0.62, 1, E.back(p)).toFixed(4)})`; });
}

function seek(t) {
  const sh = shotAt(t), src = srcAt(sh, t);
  const c = camAt(t), c1 = camAt(t - 1 / 60), k = punchAt(t), wp = whipAt(t), wp1 = whipAt(t - 1 / 60);
  // A cut is a cut: the frame after a jump carries no blur from the jump.
  const prev = c.setAt > t - 1 / 60 ? c : c1;
  const cam = { cx: c.cx, cy: c.cy, s: c.s * k, ox: wp.x, oy: wp.y }, cam0 = { cx: prev.cx, cy: prev.cy, s: prev.s * k, ox: wp1.x, oy: wp1.y };
  let tm = null;
  if (sh.tm) { const open = sh.tm.openAt != null ? t - sh.tm.openAt : 1; if (open >= 0) tm = { tab: sh.tm.tab, open, clock: t }; }
  W.seek(src, { cam, cam0, tm, pointer: sh.pointer !== false, zoomBlur: 420 });

  // Dim, scrims
  let dim = 0; for (const [a, b, v] of S.dims || []) dim = Math.max(dim, v * env(t, a, b, 0.22, 0.2));
  // The end card sits on a near-black frame so its words read at a glance.
  for (const c of S.cards) if (c.type === 'end') dim = Math.max(dim, 0.88 * env(t, c.a, c.b, 0.3, 0.05));
  $('#dim').style.opacity = dim.toFixed(3);
  const hk = S.hook, hookOn = t >= hk.a && t < hk.b;
  $('#topscrim').style.opacity = env(t, hk.a - 0.01, hk.b, 0.01, 0.2).toFixed(3);

  // Hook
  show($('#hook'), hookOn);
  if (hookOn) { popWords($('#hook'), t, hk.a + 0.02, 0.055); const o = E.in(prog(t, hk.b - 0.16, hk.b)); $('#hook').style.opacity = (1 - o).toFixed(3); $('#hook').style.transform = `scale(${(1 - o * 0.04).toFixed(4)})`; }

  // Captions
  const cp = (S.caps || []).find((x) => t >= x.a && t < x.b);
  let bs = 0; for (const x of S.caps || []) bs = Math.max(bs, env(t, x.a, x.b, 0.15, 0.15));
  $('#botscrim').style.opacity = (bs * 0.9).toFixed(3);
  const capEl = $('#cap'); show(capEl, !!cp);
  if (cp) {
    if (capEl.dataset.k !== String(cp.a)) { capEl.dataset.k = String(cp.a); capEl.innerHTML = wordHtml(words(cp.text)); }
    popWords(capEl, t, cp.a, 0.045);
    capEl.style.opacity = (1 - E.in(prog(t, cp.b - 0.1, cp.b))).toFixed(3);
  }

  // Rings around live things
  let rh = '';
  for (const bx of S.boxes || []) {
    if (t < bx.a || t >= bx.b) continue;
    const r = bx.sel ? W.rectOf(bx.sel) : W.rectOfText(bx.text[0], bx.text[1]);
    if (!r) continue;
    const p = E.out(prog(t, bx.a, bx.a + 0.26)), o = E.in(prog(t, bx.b - 0.14, bx.b)), pad = 14, sc = lerp(1.2, 1, p);
    rh += `<div class="ring" style="left:${(r.x - pad).toFixed(1)}px;top:${(r.y - pad).toFixed(1)}px;width:${(r.w + pad * 2).toFixed(1)}px;height:${(r.h + pad * 2).toFixed(1)}px;opacity:${(p * (1 - o)).toFixed(3)};transform:scale(${sc.toFixed(4)})">${bx.label ? `<span class="lb">${esc(bx.label)}</span>` : ''}</div>`;
  }
  $('#rings').innerHTML = rh;

  // Keycaps
  const ks = (S.keys || []).find((x) => t >= x.t - 0.05 && t < x.until);
  const kh = $('#keys');
  if (ks) {
    kh.innerHTML = ks.keys.map((k2, j) => { const t0 = ks.t + j * 0.25, p = prog(t, t0, t0 + 0.2); const dn = t >= t0 + 0.2 && t < t0 + 0.34; return `${j ? `<span class="plus" style="opacity:${E.out(p).toFixed(3)}">+</span>` : ''}<div class="key${dn ? ' dn' : ''}" style="opacity:${E.out(p).toFixed(3)};transform:scale(${lerp(0.4, 1, E.back(p)).toFixed(4)})">${esc(k2)}</div>`; }).join('');
    kh.style.opacity = (1 - E.in(prog(t, ks.until - 0.16, ks.until))).toFixed(3);
  } else kh.innerHTML = '';

  // Chips
  const chip = (el, spans) => { let v = 0; for (const [a, b] of spans || []) v = Math.max(v, env(t, a, b, 0.25, 0.2)); el.style.opacity = v.toFixed(3); show(el, v > 0.001); };
  chip($('#chip-ex'), S.chips?.ex); chip($('#chip-ff'), S.chips?.ff);

  // Cards
  S.cards.forEach((c2, i) => seekCard(t, c2, $(`#card-${i}`)));

  // Grain, flash on the hits
  const gi = Math.floor(t * 24) % GRAIN.length, gr = rng(Math.floor(t * 24) + 11);
  $('#grain').style.backgroundImage = `url(${GRAIN[gi]})`; $('#grain').style.backgroundPosition = `${Math.floor(gr() * 256)}px ${Math.floor(gr() * 256)}px`;
  let fl = 0; for (const p of S.punches || []) if (t >= p && t < p + 0.12) fl = Math.max(fl, 0.1 * (1 - prog(t, p, p + 0.12)));
  $('#flash').style.opacity = fl.toFixed(3);
}

async function init() {
  drawGrain();
  const frame = $('#screen');
  await new Promise((r) => { if (frame.contentWindow && frame.contentWindow.ready) r(); else frame.addEventListener('load', r, { once: true }); });
  W = frame.contentWindow;
  for (let i = 0; i < 400 && !W.ready; i++) await new Promise((r) => setTimeout(r, 50));
  if (S.cards.some((c) => c.type === 'code')) { const txt = await (await fetch('/tune/omnidx.ps1')).text(); CODE.push(...codeLines(txt)); }
  buildCards();
  $('#hook').innerHTML = S.hook.text.split('|').map((l) => `<span class="ln">${wordHtml(words(l))}</span>`).join('');
  CAM = S.cam.map((k) => ({ ...k, to: resolve(k.to) }));
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  seek(0);
  window.ready = true;
}
window.seek = seek;
window.DUR = S.dur;
window.FPS = 30;
window.COVER = S.cover;
init();
