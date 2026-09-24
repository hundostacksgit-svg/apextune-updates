/*
 * The tutorial's picture. window.seek(t) sets every element for time t; the
 * renderer calls it once per frame and takes a screenshot. Everything reads
 * timeline.js, which the score reads too, so a cut and its hit are the same
 * number.
 */
import * as T from './timeline.js';

const { CUE } = T;
const $ = (s, r = document) => r.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

// A cubic-bezier easing, solved the way a browser does, so the curves are the ones an editor's graph editor draws.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u, sy = (u) => ((ay * u + by) * u + cy) * u, dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) { const d = sx(u) - x; if (Math.abs(d) < 1e-6) break; const dd = dx(u); if (Math.abs(dd) < 1e-6) break; u -= d / dd; }
    let lo = 0, hi = 1; u = clamp(u);
    for (let i = 0; i < 30 && Math.abs(sx(u) - x) > 1e-6; i++) { if (sx(u) < x) lo = u; else hi = u; u = (lo + hi) / 2; }
    return sy(u);
  };
}
const E = {
  lin: (p) => p,
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p,
  io: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  expo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inExpo: (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
  back: (p) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  cam: bezier(0.72, 0, 0.18, 1),      // camera moves: a patient start, a long settle
  ptr: bezier(0.42, 0, 0.16, 1),      // a hand on a mouse
  pop: bezier(0.2, 0.9, 0.3, 1),
};
const env = (t, a, b, fi = 0.2, fo = 0.2, ei = E.out, eo = E.in) => (t < a || t > b ? 0 : Math.min(ei(prog(t, a, a + fi)), 1 - eo(prog(t, b - fo, b))));
const show = (el, on) => { if (el) el.classList.toggle('hide', !on); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Pictures drawn once: the wallpaper, the glow behind the title cards, the grain.
// ---------------------------------------------------------------------------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function drawWall() {
  const c = canvas(1920, 1080), g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 1920, 1080);
  base.addColorStop(0, '#0b0816'); base.addColorStop(0.5, '#120a24'); base.addColorStop(1, '#07050e');
  g.fillStyle = base; g.fillRect(0, 0, 1920, 1080);
  g.save(); g.filter = 'blur(90px)'; g.globalAlpha = 0.6;
  const glow = g.createRadialGradient(1240, 600, 0, 1240, 600, 620); glow.addColorStop(0, '#7c3aed'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 1920, 1080); g.restore();
  // Silk: bands between two waves, lit along their upper edge.
  const bands = [
    [820, 150, 210, 0.0021, 0.4, '#3b1273', '#9333ea', 0.9],
    [760, 130, 150, 0.0024, 1.3, '#5b21b6', '#c026d3', 0.8],
    [700, 120, 110, 0.0027, 2.1, '#6d28d9', '#e879f9', 0.7],
    [650, 100, 70, 0.0031, 2.9, '#7c3aed', '#f5d0fe', 0.55],
    [610, 90, 40, 0.0035, 3.6, '#a78bfa', '#fdf4ff', 0.45],
  ];
  g.save(); g.translate(960, 540); g.rotate(-0.3); g.translate(-960, -540);
  for (const [y0, amp, thick, f, ph, c1, c2, al] of bands) {
    const top = (x) => y0 + amp * Math.sin(x * f + ph) + 40 * Math.sin(x * f * 2.3 + ph * 1.7);
    const bot = (x) => top(x) + thick * (0.55 + 0.45 * Math.sin(x * f * 1.4 + ph + 1));
    const lg = g.createLinearGradient(-300, 0, 2300, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.35, c1); lg.addColorStop(0.62, c2); lg.addColorStop(0.85, c1); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.filter = 'blur(3px)'; g.globalAlpha = al; g.fillStyle = lg; g.beginPath();
    for (let x = -300; x <= 2300; x += 16) g.lineTo(x, top(x));
    for (let x = 2300; x >= -300; x -= 16) g.lineTo(x, bot(x));
    g.closePath(); g.fill(); g.restore();
    g.save(); g.filter = 'blur(1.2px)'; g.globalAlpha = al * 0.55; g.strokeStyle = 'rgba(255,240,255,.7)'; g.lineWidth = 1.6; g.beginPath();
    for (let x = 200; x <= 1900; x += 16) g.lineTo(x, top(x) + 1);
    g.stroke(); g.restore();
  }
  g.restore();
  const v = g.createRadialGradient(960, 520, 360, 960, 540, 1250); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)');
  g.fillStyle = v; g.fillRect(0, 0, 1920, 1080);
  return c.toDataURL('image/jpeg', 0.95);
}
function drawGlow(seed) {
  const c = canvas(1920, 1080), g = c.getContext('2d'), r = T.rng(seed);
  g.fillStyle = '#050308'; g.fillRect(0, 0, 1920, 1080);
  g.save(); g.filter = 'blur(60px)'; g.globalCompositeOperation = 'screen';
  const blobs = [[1420, 230, 820, '109,40,217', 0.34], [360, 930, 760, '217,70,239', 0.16], [980, 560, 520, '139,92,246', 0.1]];
  for (const [x, y, rad, col, a] of blobs) { const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = rg; g.fillRect(0, 0, 1920, 1080); }
  g.restore();
  // A few faint specks of dust in the light.
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(220,200,255,${0.03 + r() * 0.06})`; g.beginPath(); g.arc(r() * 1920, r() * 1080, 0.6 + r() * 1.4, 0, 7); g.fill(); }
  return c.toDataURL('image/jpeg', 0.94);
}
const GRAIN = [];
function drawGrain() {
  for (let k = 0; k < 6; k++) {
    const c = canvas(256, 256), g = c.getContext('2d'), img = g.createImageData(256, 256), r = T.rng(900 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() + r() + r() - 1.5) * 150; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); GRAIN.push(c.toDataURL('image/png'));
  }
}

// ---------------------------------------------------------------------------
// The DOM built once: the app's checkboxes, the start menu, the report, the ini.
// ---------------------------------------------------------------------------
const TUNE_BOXES = ['Startup apps off', 'Services this PC does not need', 'Telemetry tasks', 'Preinstalled apps and trials', 'Debloat: legacy Windows, OneDrive', 'Telemetry, ads, background apps', 'System: scheduler, input, visuals', 'The OmniDx power plan', 'Network latency', 'Discord, Spotify, browsers', 'Game profiles', "Settings inside your games' files", 'NVIDIA telemetry off', 'Clear update caches, temp files', 'Write the after-restart count', 'Keep it cut after Windows updates'];
const cbHtml = (label, on, id = '', wrap = false) => `<div class="cb${on ? ' on' : ''}${wrap ? ' wrap' : ''}"${id ? ` id="${id}"` : ''}><span class="bx"><svg width="11" height="11"><use href="#i-check"/></svg></span><span>${esc(label)}</span></div>`;
const FLIP_TAGS = { 10: 'V-Sync off', 11: 'Motion blur off', 4: 'Shadows off', 6: 'Post-processing low' };

function build() {
  $('#a-tune').innerHTML = TUNE_BOXES.map((l) => cbHtml(l, true)).join('');
  $('#c-tune').insertAdjacentHTML('beforeend', [cbHtml('Cut the Xbox services too (Game Pass and Minecraft need them)', false, '', true), cbHtml('Point DNS at 1.1.1.1', false)].join(''));
  $('#startup').innerHTML = '<div style="color:var(--ink3)">Reading...</div>';

  const pins = [['i-gear', 'Settings'], ['i-folder', 'File Explorer'], ['i-web', 'Browser'], ['i-note', 'Notepad'], ['i-term', 'Terminal'], ['i-ps', 'PowerShell ISE'], ['i-gear', 'Calculator'], ['i-folder', 'Photos'], ['i-note', 'Snipping Tool'], ['i-gear', 'Clock'], ['i-web', 'Media Player'], ['i-folder', 'Paint']];
  $('#s-grid').innerHTML = pins.map(([i, n]) => `<div class="gi"><svg width="32" height="32"><use href="#${i}"/></svg>${n}</div>`).join('');
  const rec = [['i-note', 'Build notes', '2h ago'], ['i-folder', 'Screenshots', 'Yesterday at 11:02 PM'], ['i-web', 'omnidx.net - Your key', '12m ago'], ['i-note', 'keybinds.txt', 'Sunday at 4:17 PM']];
  $('#s-rec').innerHTML = rec.map(([i, n, w]) => `<div class="ri"><svg width="28" height="28"><use href="#${i}"/></svg><div>${esc(n)}<small>${esc(w)}</small></div></div>`).join('');

  $('#ini').innerHTML = T.INI.map(([line], i) => {
    const eq = line.indexOf('=');
    const body = eq > 0 ? `${esc(line.slice(0, eq + 1))}<span class="val" data-row="${i}"><span>${esc(line.slice(eq + 1))}</span><span>${esc(T.INI[i][1] ?? '')}</span></span>` : esc(line || ' ');
    return `<div class="ln" data-ln="${i}">${body}${FLIP_TAGS[i] ? `<span class="tag" data-tag="${i}">${FLIP_TAGS[i]}</span>` : ''}</div>`;
  }).join('') + '<div class="bk" id="bk" style="position:absolute;right:22px;bottom:18px;display:flex;align-items:center;gap:12px;font-family:var(--ui);font-size:14px;color:#e9ddff;background:rgba(14,10,23,.92);border:1px solid rgba(48,211,138,.5);border-radius:12px;padding:10px 16px"><span style="width:22px;height:22px;border-radius:50%;background:#30D38A;display:grid;place-items:center"><svg width="12" height="12"><use href="#i-check"/></svg></span><span>Backed up first:<br><span style="font-family:var(--mono);font-size:12.5px;color:#b3a8cf">C:\\OmniDx\\backup\\2026-09-24_20-14-07\\games</span></span></div>';

  const bios = T.BIOS.map((b, i) => `<li data-bios="${i}"><span class="mk"></span>${i ? '<span class="tick"><svg width="14" height="14" viewBox="0 0 12 12"><path d="M2.2 6.3 4.8 8.8 9.8 3.4" fill="none" stroke="#06140d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : ''}<span class="tx">${esc(b)}</span></li>`).join('');
  $('#report').innerHTML = `<main>
    <h1><img src="/studio/assets/icons/icon-192.png" alt="">OmniDx Tune <span class="muted" style="font-size:16px">v1.77.0</span></h1>
    <p class="sub">Thursday, September 24, 2026 8:15 PM &middot; ${esc(T.PC.cpu)} &middot; ${esc('NVIDIA GeForce RTX 3060')}</p>
    <div class="big"><div><b>214</b><span>processes before</span></div><div><b>86</b><span>now, before a restart</span></div><div><b>~80</b><span>target for this PC after a restart</span></div></div>
    <h2>Next steps</h2><ol>
      <li>Restart. The services told to stop are still unwinding until you do, and the after-restart count lands in C:\\OmniDx\\after-restart.txt at your next sign-in, with the boot time of that start next to the one from before the tune.</li>
      <li>BIOS, item 1: the memory profile is OFF on this PC (the RAM runs at 2133 MT/s, rated 3200). That one setting is worth more than the rest of this report.</li>
      <li>GPU control panel: low latency mode, power management and V-Sync, from the list below. Two minutes.</li></ol>
    <h2>Warnings (1)</h2><ul class="warn"><li style="color:#ffc247">${esc(T.PC.warn)}</li></ul>
    <h2 id="bios-h">BIOS checklist for ${esc(T.PC.board)}</h2><div class="bios"><ul>${bios}</ul></div>
    <h2>GPU control panel</h2><ul><li>NVIDIA Control Panel &gt; Manage 3D settings (global): Low Latency Mode = Ultra, Power management = Prefer maximum performance, Vertical sync = Off.</li></ul>
  </main>`;
}

// ---------------------------------------------------------------------------
// Where things are in the world (measured once, camera at rest), and the
// camera, pointer and whip plans that aim at them.
// ---------------------------------------------------------------------------
const R = {};
function measure() {
  const hidden = ['#w-term', '#w-admin', '#w-app', '#w-note', '#w-web', '#w-tm', '#tm-mem', '#start', '#results', '#uacwrap'].map((s) => $(s)).filter((el) => el.classList.contains('hide'));
  hidden.forEach((el) => el.classList.remove('hide'));
  $('#startup').innerHTML = T.STARTUP.map((n, i) => cbHtml(n, true, `su-${i}`)).join('');
  const world = $('#world'); world.style.transform = 'none';
  const rect = (sel) => { const b = $(sel).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; };
  for (const [k, s] of Object.entries({ start: '#tb-start', best: '#best', yes: '#uac-yes', term: '#w-term', admin: '#w-admin', app: '#w-app', pc: '#c-pc', tune: '#c-tune', key: '#c-key', kbox: '#a-key', run: '#b-run', undo: '#b-undo', log: '#c-log', note: '#w-note', web: '#w-web', discord: `#su-${T.STARTUP.indexOf(T.UNTICKED)}`, count: '#a-count', biosH: '#bios-h', page: '#w-web .page', tm: '#w-tm', tmProcs: '#tm-procs-box', tmSpeed: '#tm-speed', tmNavPerf: '#tm-nav-performance', tmTileMem: '#tm-t-mem', mtSec: '#a-mt', foot: '.foot' })) R[k] = rect(s);
  R.biosTop = $('#bios-h').offsetTop;
  // The checklist items where they sit once the report has scrolled to them.
  R.bios = [...document.querySelectorAll('#report .bios li')].map((li) => { const r = rect(`li[data-bios="${li.dataset.bios}"]`); const dy = R.biosTop - 18; return { ...r, y: r.y - dy, cy: r.cy - dy }; });
  R.mt = [...document.querySelectorAll('#a-mt')].map(() => rect('#a-mt'))[0];
  // The terminal's character cell, for aiming at the prompt.
  const probe = document.createElement('span'); probe.textContent = 'M'.repeat(40); probe.style.cssText = 'font-family:var(--mono);font-size:14px;position:absolute;visibility:hidden;white-space:pre';
  document.body.appendChild(probe); R.ch = probe.getBoundingClientRect().width / 40; probe.remove();
  $('#startup').innerHTML = '<div style="color:var(--ink3)">Reading...</div>';
  hidden.forEach((el) => el.classList.add('hide'));
}

let CAM = [], PTR = [], HOVER = [];
const WHIPS = [{ t: CUE.step7, dir: -1 }, { t: CUE.step8, dir: -1 }, { t: CUE.step9, dir: 1 }];
function plans() {
  const at = (r, s, ox = 0, oy = 0) => ({ cx: r.cx + ox, cy: r.cy + oy, s });
  const promptY = R.term.y + 40 + 10 + 5 * 19 + 9, promptX = R.term.x + 14;
  const verifyY = R.admin.y + 40 + 10 + 5 * 19 + 9;
  R.prompt = { cx: promptX + 230, cy: promptY, x: promptX, y: promptY - 10 };
  R.verify = { cx: R.admin.x + 14 + 500, cy: verifyY, x: R.admin.x + 14, y: verifyY - 10 };
  CAM = [
    { set: CUE.desk, to: { cx: 960, cy: 566, s: 1.12 } },
    { a: CUE.desk, b: CUE.desk + 1.0, to: { cx: 960, cy: 540, s: 1.0 }, e: E.out },
    { a: 10.45, b: 11.25, to: { cx: 960, cy: 646, s: 1.36 }, e: E.cam },
    { a: 13.15, b: 13.95, to: at(R.term, 1.26, -20, -40), e: E.cam },
    { a: CUE.step2, b: CUE.step2 + 0.85, to: { cx: promptX + 380, cy: promptY, s: 2.05 }, e: E.cam },
    { a: CUE.step2 + 0.85, b: CUE.enter, to: { cx: promptX + 420, cy: promptY, s: 2.12 }, e: E.io },
    { a: 21.8, b: 22.55, to: { cx: 960, cy: 520, s: 1.42 }, e: E.cam },
    { a: 23.55, b: 24.2, to: { cx: R.admin.x + 520, cy: verifyY - 30, s: 1.6 }, e: E.cam },
    { a: 24.2, b: CUE.step3, to: { cx: R.admin.x + 512, cy: verifyY - 20, s: 1.7 }, e: E.io },
    { set: CUE.step3, to: { cx: 960, cy: 516, s: 1.15 } },
    { a: CUE.step3, b: CUE.probe, to: { cx: 960, cy: 516, s: 1.2 }, e: E.io },
    { a: CUE.probe + 0.1, b: CUE.probe + 0.95, to: { cx: R.pc.cx + 150, cy: R.pc.y + 236, s: 1.62 }, e: E.cam },
    { a: CUE.probe + 0.95, b: CUE.step4 - 0.2, to: { cx: R.pc.cx + 150, cy: R.pc.y + 232, s: 1.67 }, e: E.io },
    { a: CUE.step4 - 0.25, b: CUE.step4 + 0.6, to: at(R.discord, 1.95, 150, -40), e: E.cam },
    { a: CUE.step5 - 0.25, b: CUE.step5 + 0.6, to: at(R.key, 2.0, 0, -90), e: E.cam },
    { a: CUE.runClick + 0.05, b: CUE.runClick + 0.85, to: { cx: 960, cy: 560, s: 1.2 }, e: E.cam },
    { a: CUE.runClick + 2.0, b: CUE.runClick + 3.3, to: at(R.log, 1.7, 0, -20), e: E.cam },
    { a: CUE.runClick + 3.3, b: CUE.done - 0.4, to: at(R.log, 1.78, 0, -20), e: E.io },
    { a: CUE.done - 0.3, b: CUE.done + 0.45, to: { cx: 960, cy: 520, s: 1.18 }, e: E.cam },
    { set: CUE.step7, to: at(R.note, 1.3, 0, 10) },
    { a: CUE.step7, b: CUE.step8, to: at(R.note, 1.4, 0, 10), e: E.io },
    { set: CUE.step8, to: at(R.web, 1.22, 0, -40) },
    { a: CUE.step8 + 0.35, b: CUE.step8 + 1.2, to: { cx: R.web.cx, cy: R.page.y + 300, s: 1.46 }, e: E.cam },
    { a: CUE.step8 + 1.2, b: CUE.step9, to: { cx: R.web.cx, cy: R.page.y + 300, s: 1.52 }, e: E.io },
    { set: CUE.step9, to: { cx: R.key.cx - 180, cy: R.key.cy + 60, s: 1.62 } },
    { a: CUE.undoClick + 0.4, b: CUE.undoClick + 1.2, to: { cx: 960, cy: 560, s: 1.22 }, e: E.cam },
    { a: CUE.outro - 0.45, b: CUE.outro, to: { cx: 960, cy: 560, s: 1.95 }, e: E.in },
  ];
  const rest1 = { x: 1580, y: 880 }, rest2 = { x: 1650, y: 945 };
  const tip = (r, dx = 0, dy = 0) => ({ x: r.cx + dx, y: r.cy + dy });
  PTR = [
    { t: CUE.desk, x: 1330, y: 770 },
    { t: CUE.startClick - 0.08, ...tip(R.start, 1, 3), d: 0.8 },
    { t: 12.35, x: 1430, y: 690, d: 0.7 },
    { t: CUE.psClick - 0.08, ...tip(R.best, -40, 2), d: 0.55 },
    { t: 14.35, ...rest1, d: 0.8 },
    { t: CUE.uac + 0.5, ...rest1 },
    { t: CUE.uacYes - 0.08, ...tip(R.yes, -6, 2), d: 0.62 },
    { t: CUE.elevated + 0.7, ...rest2, d: 0.7 },
    { t: CUE.step4 + 0.35, ...rest2 },
    { t: CUE.untick - 0.08, x: R.discord.x + 7, y: R.discord.cy + 1, d: 0.75 },
    { t: CUE.keyClick - 0.08, ...tip(R.kbox, 70, 2), d: 0.62 },
    { t: CUE.runClick - 0.08, ...tip(R.run, 24, 4), d: 0.72 },
    { t: CUE.runClick + 1.1, ...rest2, d: 0.8 },
    { t: CUE.step9 + 0.05, ...rest2 },
    { t: CUE.undoArm - 0.08, ...tip(R.undo, 30, 2), d: 0.6 },
    { t: CUE.undoClick - 0.08, ...tip(R.undo, 34, 3), d: 0.25 },
    { t: CUE.undoClick + 0.9, ...rest2, d: 0.7 },
  ];
  HOVER = [['#tb-start', R.start], ['#best', R.best], ['#uac-yes', R.yes], ['#b-run', R.run], ['#b-undo', R.undo], [`#su-${T.STARTUP.indexOf(T.UNTICKED)}`, R.discord]];
}

function camAt(t) {
  let st = { cx: 960, cy: 540, s: 1 };
  for (const k of CAM) {
    if (k.set !== undefined) { if (t >= k.set) st = { ...k.to }; continue; }
    if (t < k.a) continue;
    const p = k.e(prog(t, k.a, k.b));
    st = { cx: lerp(st.cx, k.to.cx, p), cy: lerp(st.cy, k.to.cy, p), s: lerp(st.s, k.to.s, p) };
  }
  return st;
}
// A whip pan: the frame leaves fast one way, the next shot arrives from the other side and settles.
function whipAt(t) {
  let x = 0;
  for (const w of WHIPS) {
    if (t >= w.t - 0.2 && t < w.t) x += w.dir * 2600 * E.inExpo(prog(t, w.t - 0.2, w.t));
    else if (t >= w.t && t < w.t + 0.36) x += -w.dir * 2600 * (1 - E.expo(prog(t, w.t, w.t + 0.36)));
  }
  return x;
}
function ptrAt(t) {
  let prev = PTR[0];
  for (let i = 1; i < PTR.length; i++) {
    const k = PTR[i];
    if (t >= k.t) { prev = k; continue; }
    const d = k.d ?? 0; const t0 = k.t - d;
    if (!d || t < t0) return { x: prev.x, y: prev.y };
    const p = E.ptr(prog(t, t0, k.t)), dx = k.x - prev.x, dy = k.y - prev.y, dist = Math.hypot(dx, dy) || 1;
    const arc = Math.sin(Math.PI * p) * Math.min(60, dist * 0.09);
    return { x: lerp(prev.x, k.x, p) + (-dy / dist) * arc, y: lerp(prev.y, k.y, p) + (dx / dist) * arc };
  }
  return { x: prev.x, y: prev.y };
}

// ---------------------------------------------------------------------------
// seek(t)
// ---------------------------------------------------------------------------
let lastLog = '', lastTerm = '', lastAdmin = '';
function setText(el, v) { if (el.textContent !== v) el.textContent = v; }
function setHTML(el, v) { if (el.innerHTML !== v) el.innerHTML = v; }
function blink(t, since) { return t - since < 0.5 || Math.floor((t - since) / 0.53) % 2 === 0; }
function clockAt(t) { return t < 40 ? '8:14 PM' : t < CUE.done ? '8:15 PM' : t < CUE.step8 + 2 ? '8:16 PM' : '8:17 PM'; }

// Short mode: the TikTok cuts load this page at 1080 x 1920 and drive the camera themselves (short.js).
const SHORT = new URLSearchParams(location.search).get('mode') === 'short';
const FW = SHORT ? 1080 : 1920, FH = SHORT ? 1920 : 1080;

function seek(t, opts = {}) {
  const desk = SHORT || (t >= CUE.desk - 0.01 && t < CUE.outro + 0.2);
  show($('#cam'), desk);

  // ---- camera, whips and the motion blur they earn
  const own = !!opts.cam;
  const c = own ? opts.cam : camAt(t), c0 = own ? (opts.cam0 || opts.cam) : camAt(t - 1 / 60);
  const wx = own ? (c.ox || 0) : whipAt(t), wx0 = own ? (c0.ox || 0) : whipAt(t - 1 / 60);
  const wy = own ? (c.oy || 0) : 0, wy0 = own ? (c0.oy || 0) : 0;
  $('#world').style.transform = `translate(${(FW / 2 - c.cx * c.s + wx).toFixed(2)}px, ${(FH / 2 - c.cy * c.s + wy).toFixed(2)}px) scale(${c.s.toFixed(5)})`;
  // A 90-degree shutter: the blur is the distance the picture moves in 1/120 s. Camera moves stay nearly
  // sharp so the words on screen stay readable; the whips smear, as a whip should.
  const cvx = (c0.cx - c.cx) * c.s / 2, cvy = (c0.cy - c.cy) * c.s / 2, wv = (wx - wx0) / 2, wvy = (wy - wy0) / 2;
  const zoomOut = !own && t >= CUE.outro - 0.45 && t < CUE.outro + 0.1 ? Math.abs(c.s - c0.s) / c.s * 900 : own ? Math.abs(c.s - c0.s) / c.s * (opts.zoomBlur || 0) : 0;
  let bx = Math.abs(cvx) / 3 + Math.abs(wv) / 2.2 + zoomOut, by = Math.abs(cvy) / 3 + Math.abs(wvy) / 2.2 + zoomOut;
  if (Math.max(bx, by) < 1.4) { bx = 0; by = 0; }
  bx = Math.min(80, bx); by = Math.min(80, by);
  $('#mbg').setAttribute('stdDeviation', `${bx.toFixed(2)} ${by.toFixed(2)}`);
  $('#cam').style.filter = bx || by ? 'url(#mb)' : 'none';

  // ---- taskbar and clock
  setText($('#clock-t'), clockAt(t));
  const startOpen = t >= CUE.startClick + 0.08 && t < CUE.termOpen;
  $('#tb-start').classList.toggle('open', startOpen);
  const psRun = t >= CUE.termOpen;
  $('#tb-ps').classList.toggle('run', psRun);
  $('#tb-ps').classList.toggle('focus', psRun && !(t >= CUE.step7 && t < CUE.step9));
  show($('#tb-note'), t >= CUE.step7 - 0.3);
  $('#tb-note').classList.toggle('focus', t >= CUE.step7 && t < CUE.step8);
  $('#tb-note').classList.toggle('run', t >= CUE.step7);

  // ---- start menu and search
  const sm = $('#start');
  show(sm, t >= CUE.startClick + 0.08 && t < CUE.termOpen + 0.12);
  if (t >= CUE.startClick + 0.08) {
    const pin = E.out(prog(t, CUE.startClick + 0.08, CUE.startClick + 0.34)), pout = E.in(prog(t, CUE.termOpen - 0.06, CUE.termOpen + 0.1));
    sm.style.transform = `translateY(${((1 - pin) * 36 + pout * 24).toFixed(1)}px)`;
    sm.style.opacity = (pin * (1 - pout)).toFixed(3);
  }
  const typed = T.SEARCH_KEYS.filter((k) => k.t <= t).length;
  show($('#pinned'), typed === 0); show($('#results'), typed > 0);
  const lastKey = typed ? T.SEARCH_KEYS[typed - 1].t : CUE.startClick;
  setHTML($('#s-text'), typed ? `<span class="typed">${esc(T.SEARCH.slice(0, typed))}</span>${blink(t, lastKey) ? '<span class="caret"></span>' : ''}` : `<span class="ph">Search for apps, settings, and documents</span>`);

  // ---- the first PowerShell window
  const wt = $('#w-term');
  show(wt, t >= CUE.termOpen && t < CUE.step7);
  if (t >= CUE.termOpen) {
    const p = E.out(prog(t, CUE.termOpen, CUE.termOpen + 0.2));
    wt.style.transform = `scale(${lerp(0.955, 1, p).toFixed(4)})`; wt.style.opacity = p.toFixed(3);
    const n = T.COMMAND_KEYS.filter((k) => k.t <= t).length, lk = n ? T.COMMAND_KEYS[n - 1].t : CUE.termOpen;
    let s = '';
    if (t >= CUE.termOpen + 0.25) s += 'Windows PowerShell\nCopyright (C) Microsoft Corporation. All rights reserved.\n\nInstall the latest PowerShell for new features and improvements! https://aka.ms/PSWindows\n\n';
    if (t >= CUE.termOpen + 0.45) {
      s += esc(T.PROMPT + T.COMMAND.slice(0, n));
      if (t < CUE.enter) s += blink(t, lk) && t < CUE.uac ? '<span class="cur"></span>' : '';
      else {
        s += '\n';
        if (t >= CUE.admin) s += '<span class="dim">  Asking for administrator rights...</span>\n';
        if (t >= CUE.admin + 0.3) s += esc(T.PROMPT) + (t < CUE.uac ? '<span class="cur"></span>' : '');
      }
    }
    if (s !== lastTerm) { $('#term-text').innerHTML = s; lastTerm = s; }
  }

  // ---- UAC
  const uw = $('#uacwrap');
  show(uw, t >= CUE.uac && t < CUE.uacYes + 0.16);
  if (t >= CUE.uac) {
    const din = E.out(prog(t, CUE.uac, CUE.uac + 0.16)), dout = prog(t, CUE.uacYes + 0.03, CUE.uacYes + 0.16);
    $('#uacdim').style.opacity = (din * (1 - dout)).toFixed(3);
    const pin = E.pop(prog(t, CUE.uac + 0.06, CUE.uac + 0.32));
    $('#uac').style.transform = `scale(${lerp(0.94, 1, pin).toFixed(4)})`; $('#uac').style.opacity = (pin * (1 - dout)).toFixed(3);
  }

  // ---- the elevated window
  const wa = $('#w-admin');
  show(wa, t >= CUE.elevated && t < CUE.step7);
  if (t >= CUE.elevated) {
    const p = E.out(prog(t, CUE.elevated, CUE.elevated + 0.2));
    wa.style.transform = `scale(${lerp(0.955, 1, p).toFixed(4)})`; wa.style.opacity = p.toFixed(3);
    const hl = E.cam(prog(t, CUE.verified + 0.35, CUE.verified + 0.8));
    const s = T.ELEVATED.filter((l) => l.t <= t).map((l) => {
      if (l.text.includes('Script verified')) return `<span class="dim" style="background:linear-gradient(90deg,rgba(139,92,246,.42),rgba(139,92,246,.42)) no-repeat 0 0/${(hl * 100).toFixed(1)}% 100%;color:${hl > 0.02 ? '#e9ddff' : '#767676'}">${esc(l.text)}</span>`;
      return l.cls ? `<span class="${l.cls}">${esc(l.text)}</span>` : esc(l.text);
    }).join('\n');
    if (s !== lastAdmin) { $('#admin-text').innerHTML = s; lastAdmin = s; }
  }

  // ---- OmniDx Tune
  seekApp(t);

  // ---- Notepad and the report
  seekNote(t);
  seekWeb(t);

  // ---- pointer, hover and clicks
  const pt = ptrAt(t);
  let press = 0;
  for (const ck of T.CLICKS) if (t >= ck - 0.04 && t < ck + 0.09) press = 1;
  $('#pointer').style.transform = `translate(${(pt.x - 1.5).toFixed(2)}px, ${(pt.y - 1.5).toFixed(2)}px) scale(${press ? 0.88 : 1})`;
  show($('#pointer'), (SHORT || t >= CUE.desk) && opts.pointer !== false);
  for (const [sel, r] of HOVER) { const el = $(sel); if (el) el.classList.toggle('hover', pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h); }
  let ring = '';
  for (const ck of T.CLICKS) {
    if (t < ck || t > ck + 0.42) continue;
    const p = prog(t, ck, ck + 0.42), at = ptrAt(ck), rad = lerp(5, 30, E.out(p));
    ring += `<i style="left:${(at.x - rad).toFixed(1)}px;top:${(at.y - rad).toFixed(1)}px;width:${(rad * 2).toFixed(1)}px;height:${(rad * 2).toFixed(1)}px;opacity:${((1 - p) * 0.95).toFixed(3)}"></i>`;
  }
  setHTML($('#ring'), ring);
  $('#b-run').classList.toggle('press', t >= CUE.runClick - 0.03 && t < CUE.runClick + 0.12);
  $('#b-undo').classList.toggle('press', (t >= CUE.undoArm - 0.03 && t < CUE.undoArm + 0.12) || (t >= CUE.undoClick - 0.03 && t < CUE.undoClick + 0.12));
  $('#uac-yes').classList.toggle('hover', t >= CUE.uacYes - 0.3);

  seekTM(t, opts.tm);
  if (!SHORT) seekOverlays(t);
}

function seekApp(t) {
  const w = $('#w-app');
  show(w, t >= CUE.step3 && t < CUE.outro + 0.2);
  if (t < CUE.step3) return;
  const p = E.out(prog(t, CUE.step3, CUE.step3 + 0.24));
  w.style.transform = `scale(${lerp(0.95, 1, p).toFixed(4)})`; w.style.opacity = p.toFixed(3);
  w.style.zIndex = 5;

  const read = t >= CUE.probe, run = t >= CUE.runClick, fin = CUE.done + 0.35, done = t >= fin;
  const undoing = t >= CUE.undoClick, undoEnd = T.UNDO_LOG.at(-1).t + 0.15, undone = t >= undoEnd;
  const busy = (run && !done) || (undoing && !undone);

  // THIS PC
  // One line per element, so the TikTok cuts can point at a single line (the security one, say).
  setHTML($('#a-mt'), read ? [T.PC.os, `CPU  ${T.PC.cpu}`, `GPU  ${T.PC.gpu}`, `RAM  ${T.PC.ram}`, `Board  ${T.PC.board}`, T.PC.kind, T.PC.sec, T.PC.keeps].map((l, i) => `<div data-mt="${i}">${esc(l)}</div>`).join('') : 'Reading...');
  setText($('#a-count'), done ? String(T.PC.after) : read ? String(T.PC.before) : '-');
  setText($('#a-tgt'), read ? `target after the tune and a restart: about ${T.PC.target}` : '');
  setText($('#a-adv'), read ? `! ${T.PC.warn}` : '');

  // Startup list
  const su = $('#startup');
  if (read && !su.dataset.filled) { su.innerHTML = T.STARTUP.map((n, i) => cbHtml(n, true, `su-${i}`)).join(''); su.dataset.filled = '1'; }
  if (!read && su.dataset.filled) { su.innerHTML = '<div style="color:var(--ink3)">Reading...</div>'; delete su.dataset.filled; }
  const dc = $(`#su-${T.STARTUP.indexOf(T.UNTICKED)}`);
  if (dc) dc.classList.toggle('on', t < CUE.untick);

  // Status line
  let status = 'Reading this PC...';
  if (read) status = 'Read in 4 s. Nothing has changed.';
  if (run) { const h = T.HEADS.filter((x) => x.t <= t && x.t >= CUE.runClick); if (h.length) status = h.at(-1).text; }
  if (done) status = 'Done. Restart when you are ready.';
  if (undone) status = 'Undo finished. Restart to finish.';
  setText($('#a-status'), status);

  // Key
  const kb = $('#a-key'), focus = t >= CUE.keyClick && t < CUE.runClick + 0.05;
  kb.classList.toggle('focus', focus);
  const hasKey = t >= CUE.keyPaste, blurA = E.out(prog(t, CUE.keyPaste + 0.2, CUE.keyPaste + 0.36));
  setHTML(kb, `${hasKey ? esc(T.KEY) : ''}${focus && blink(t, hasKey ? CUE.keyPaste : CUE.keyClick) ? '<span class="kc"></span>' : ''}${hasKey ? `<span class="blur" style="opacity:${blurA.toFixed(3)}"></span>` : ''}`);
  setText($('#a-knote'), run ? 'Checking the key, then running. The log below is live.' : 'From the page after you paid. It locks to this PC.');

  // Buttons
  const off = (id, v) => $(id).classList.toggle('off', v);
  off('#b-run', !read || busy); off('#b-report', !read || busy); off('#b-undo', busy); off('#b-status', busy);
  off('#b-open', !done); off('#b-restart', !done && !undone);
  setText($('#b-undo'), t >= CUE.undoArm && t < CUE.undoClick ? 'Sure? Click again to undo' : 'Undo every run');
  setText($('#a-result'), done ? `Done. ${T.PC.before} -> ${T.PC.after} processes now. Restart for the real number, then do the BIOS checklist in the report.` : '');

  // The log
  let lines;
  if (undoing) lines = T.UNDO_LOG.filter((l) => l.t <= t);
  else if (run) lines = T.LOG.filter((l) => l.t <= t);
  else lines = [{ text: 'Reading this PC. Nothing has changed.' }];
  const html = lines.map((l) => `<div>${esc(l.text) || ' '}</div>`).join('');
  const lb = $('#logbox');
  if (html !== lastLog) { lb.innerHTML = html; lastLog = html; }
  lb.scrollTop = lb.scrollHeight;

  // Progress and the footer
  const bar = $('#a-prog i');
  if ((t < CUE.probe) || (undoing && !undone)) {
    const ph = ((t - (t < CUE.probe ? CUE.step3 : CUE.undoClick)) * 0.75) % 1.35 - 0.3;
    bar.style.left = `${(ph * 100).toFixed(2)}%`; bar.style.width = '30%';
  } else {
    let v = 0;
    if (run) v = Math.min(96, (100 * T.HEADS.filter((x) => x.t <= t && x.t >= CUE.runClick).length) / 19);
    if (done) v = 100;
    bar.style.left = '0'; bar.style.width = `${v.toFixed(2)}%`;
  }
  if (run) {
    const secs = Math.round((Math.min(t, CUE.done) - CUE.runClick) * T.SPEED);
    setText($('#a-foot'), `Running for ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}. Restore point first. Every change recorded.`);
  } else setText($('#a-foot'), 'Restore point first. Every change recorded. Undo is one button. Security never lowered.');
}

function seekNote(t) {
  const w = $('#w-note');
  show(w, t >= CUE.step7 - 0.01 && t < CUE.step8);
  if (!(t >= CUE.step7 - 0.01 && t < CUE.step8)) return;
  w.style.zIndex = 6;
  let row = 11;
  for (const f of T.FLIPS) {
    const p = E.cam(prog(t, f.t, f.t + 0.3));
    const v = $(`.val[data-row="${f.row}"]`);
    v.style.width = `${Math.max(v.children[0].offsetWidth, v.children[1].offsetWidth)}px`;
    [...v.children].forEach((el) => { el.style.transform = `translateY(${(-26 * p).toFixed(2)}px)`; });
    const ln = $(`.ln[data-ln="${f.row}"]`), flash = t >= f.t ? Math.max(0.16, 0.5 * (1 - prog(t, f.t, f.t + 0.9))) : 0;
    ln.style.background = flash ? `rgba(139,92,246,${flash.toFixed(3)})` : 'transparent';
    const tag = $(`.tag[data-tag="${f.row}"]`), tp = E.pop(prog(t, f.t + 0.12, f.t + 0.4));
    tag.style.opacity = tp.toFixed(3); tag.style.transform = `translateX(${((1 - tp) * -14).toFixed(1)}px) scale(${lerp(0.9, 1, tp).toFixed(3)})`;
    if (t >= f.t) row = f.row + 1;
  }
  setText($('#n-pos'), `Ln ${row}, Col ${row === 11 || row === 12 ? 16 : 20}`);
  const bp = E.pop(prog(t, T.FLIPS.at(-1).t + 0.7, T.FLIPS.at(-1).t + 1.05));
  $('#bk').style.opacity = bp.toFixed(3); $('#bk').style.transform = `translateY(${((1 - bp) * 16).toFixed(1)}px)`;
}

function seekWeb(t) {
  const w = $('#w-web');
  show(w, t >= CUE.step8 - 0.01 && t < CUE.step9);
  if (!(t >= CUE.step8 - 0.01 && t < CUE.step9)) return;
  w.style.zIndex = 7;
  const sp = E.cam(prog(t, CUE.step8 + 0.3, CUE.step8 + 1.15));
  $('#report').style.transform = `translateY(${(-sp * (R.biosTop - 18)).toFixed(1)}px)`;
  T.CHECKS.forEach((ct, i) => {
    const li = $(`li[data-bios="${i + 1}"]`);
    const mp = E.cam(prog(t, ct, ct + 0.32)), tp = E.back(prog(t, ct + 0.06, ct + 0.36));
    $('.mk', li).style.transform = `scaleX(${mp.toFixed(4)})`;
    $('.tick', li).style.transform = `scale(${tp.toFixed(4)})`;
  });
}

function seekOverlays(t) {
  // Captions: a mask reveal per word, eyebrow rule drawn first; out with a small lift.
  const cap = T.CAPTIONS.find(([a, b]) => t >= a && t <= b);
  const capEl = $('#cap');
  let scrim = 0;
  for (const [a, b] of T.CAPTIONS) scrim = Math.max(scrim, env(t, a - 0.1, b + 0.1, 0.4, 0.4));
  $('#scrim').style.opacity = scrim.toFixed(3);
  show($('#capl'), !!cap);
  if (cap) {
    const [a, b, eb, line] = cap;
    if (capEl.dataset.key !== String(a)) {
      capEl.dataset.key = String(a);
      $('.ebt', capEl).textContent = eb || '';
      $('.ln', capEl).innerHTML = line.split(' ').map((wd) => `<span class="w"><span>${esc(wd)}</span></span>`).join(' ');
      $('.eb', capEl).style.display = eb ? 'flex' : 'none';
    }
    const out = E.in(prog(t, b - 0.28, b));
    $('.rule', capEl).style.width = `${(44 * E.cam(prog(t, a, a + 0.4))).toFixed(1)}px`;
    const ep = E.out(prog(t, a + 0.12, a + 0.5));
    $('.ebt', capEl).style.opacity = ep.toFixed(3); $('.ebt', capEl).style.transform = `translateX(${((1 - ep) * -12).toFixed(1)}px)`;
    [...capEl.querySelectorAll('.w > span')].forEach((s, j) => {
      const s0 = a + (eb ? 0.16 : 0.04) + j * 0.034, pp = E.expo(prog(t, s0, s0 + 0.6));
      s.style.transform = `translateY(${((1 - pp) * 105).toFixed(1)}%)`;
    });
    capEl.style.transform = `translateY(${(-14 * out).toFixed(1)}px)`; capEl.style.opacity = (1 - out).toFixed(3);
  }

  // Chips
  const ex = env(t, CUE.step3 + 0.3, CUE.outro - 0.3, 0.35, 0.3), ff = env(t, CUE.runClick + 0.25, CUE.done + 0.2, 0.3, 0.25);
  $('#chip-ex').style.opacity = ex.toFixed(3); $('#chip-ex').style.transform = `translateY(${((1 - ex) * -10).toFixed(1)}px)`;
  $('#chip-ff').style.opacity = ff.toFixed(3); $('#chip-ff').style.transform = `translateY(${((1 - ff) * -10).toFixed(1)}px)`;
  show($('#chip-ff'), ff > 0.001);
  setText($('#ff-t'), `Sped up ${T.SPEED}\u00d7`);

  // Keys pressed, as keycaps
  const presses = [{ t: CUE.enter, keys: ['Enter'] }, { t: CUE.keyPaste, keys: ['Ctrl', 'V'] }];
  const kp = presses.find((k) => t >= k.t - 0.25 && t < k.t + 0.95);
  if (kp) {
    const e = env(t, kp.t - 0.25, kp.t + 0.95, 0.18, 0.25);
    setHTML($('#keys'), kp.keys.map((k) => `<div class="key${t >= kp.t && t < kp.t + 0.14 ? ' dn' : ''}">${k}</div>`).join('<span class="plus">+</span>'));
    $('#keys').style.opacity = e.toFixed(3); $('#keys').style.transform = `translateY(${((1 - e) * 14).toFixed(1)}px)`;
  } else $('#keys').style.opacity = '0';

  // The result card
  const r0 = CUE.done + 0.5, r1 = CUE.step7 - 0.25;
  const re = env(t, r0, r1, 0.45, 0.3, E.out, E.in);
  show($('#result'), re > 0.001);
  if (re > 0.001) {
    $('#result').style.background = `rgba(5,3,8,${(0.55 * re).toFixed(3)})`;
    const card = $('#result .rc');
    card.style.opacity = re.toFixed(3); card.style.transform = `translateY(${((1 - E.out(prog(t, r0, r0 + 0.5))) * 40 - E.in(prog(t, r1 - 0.3, r1)) * 20).toFixed(1)}px)`;
    const np = E.expo(prog(t, r0 + 0.35, r0 + 1.35));
    setText($('#r-now'), String(Math.round(lerp(T.PC.before, T.PC.after, np))));
    $('#result .was').style.setProperty('--strike', E.cam(prog(t, r0 + 0.3, r0 + 0.65)).toFixed(3));
  }

  // Cold open
  const cold = $('#cold');
  show(cold, t < CUE.title + 0.05);
  if (t < CUE.title + 0.05) {
    const out = E.in(prog(t, CUE.title - 0.42, CUE.title));
    const word = (el, i, t0) => { const p = E.out(prog(t, t0 + i * 0.075, t0 + i * 0.075 + 0.55)); el.style.opacity = p.toFixed(3); el.style.transform = `translateY(${((1 - p) * 26).toFixed(1)}px)`; el.style.filter = `blur(${((1 - p) * 9).toFixed(2)}px)`; };
    [...$('#cold1').children].forEach((el, i) => word(el, i, CUE.open1));
    [...$('#cold2').children].forEach((el, i) => word(el, i, CUE.open2));
    for (const id of ['#cold1', '#cold2']) { const el = $(id); el.style.opacity = (1 - out).toFixed(3); el.style.transform = `translateY(${(-28 * out).toFixed(1)}px)`; el.style.filter = `blur(${(out * 10).toFixed(2)}px)`; }
    $('#cold-bg').style.transform = `scale(${(1.04 + t * 0.006).toFixed(4)}) translate(${(-t * 4).toFixed(1)}px, 0)`;
  }

  // Title
  const ti = $('#title');
  show(ti, t >= CUE.title && t < CUE.desk);
  if (t >= CUE.title && t < CUE.desk) {
    const t0 = CUE.title, lp = E.out(prog(t, t0 + 0.05, t0 + 0.9)), out = E.in(prog(t, CUE.desk - 0.34, CUE.desk));
    const lg = $('#t-logo'); lg.style.opacity = lp.toFixed(3); lg.style.transform = `scale(${lerp(1.08, 1, lp).toFixed(4)})`; lg.style.filter = `blur(${((1 - lp) * 10).toFixed(2)}px)`;
    $('#t-sweep i').style.left = `${lerp(-30, 120, E.io(prog(t, t0 + 0.7, t0 + 1.7))).toFixed(2)}%`;
    const ebp = E.out(prog(t, t0 + 0.55, t0 + 1.0)), bp = E.out(prog(t, t0 + 0.75, t0 + 1.35));
    $('#t-eb').style.opacity = ebp.toFixed(3); $('#t-eb').style.letterSpacing = `${lerp(0.5, 0.32, ebp).toFixed(3)}em`;
    $('#t-big').style.opacity = bp.toFixed(3); $('#t-big').style.transform = `translateY(${((1 - bp) * 22).toFixed(1)}px)`;
    ti.style.opacity = (1 - out).toFixed(3); ti.style.transform = `scale(${lerp(1, 1.32, out).toFixed(4)})`; ti.style.filter = `blur(${(out * 14).toFixed(2)}px)`;
    $('#title-bg').style.transform = `scale(${(1.03 + (t - t0) * 0.006).toFixed(4)})`;
  }

  // Outro
  const ou = $('#outro');
  show(ou, t >= CUE.outro - 0.22);
  if (t >= CUE.outro - 0.22) {
    const t0 = CUE.outro, fin = E.out(prog(t, t0 - 0.22, t0 + 0.12));
    ou.style.opacity = fin.toFixed(3);
    $('#outro-bg').style.transform = `scale(${(1.03 + (t - t0) * 0.005).toFixed(4)}) translate(${((t - t0) * -3).toFixed(1)}px, 0)`;
    const lp = E.out(prog(t, t0 + 0.05, t0 + 0.9));
    const lg = $('#o-logo'); lg.style.opacity = lp.toFixed(3); lg.style.transform = `scale(${lerp(1.07, 1, lp).toFixed(4)})`; lg.style.filter = `blur(${((1 - lp) * 8).toFixed(2)}px)`;
    $('#o-sweep i').style.left = `${lerp(-30, 120, E.io(prog(t, t0 + 0.8, t0 + 1.8))).toFixed(2)}%`;
    const c1 = CUE.card, gone = E.in(prog(t, c1 - 0.3, c1));
    const fade = (id, a, dy = 18) => { const p = E.out(prog(t, a, a + 0.45)) * (1 - gone); const el = $(id); el.style.opacity = p.toFixed(3); el.style.marginTop = `${((1 - E.out(prog(t, a, a + 0.45))) * dy).toFixed(1)}px`; };
    fade('#o-lead', t0 + 0.7); fade('#o-cmd', t0 + 0.9); fade('#o-free', t0 + 2.2);
    const wipe = E.io(prog(t, t0 + 1.05, t0 + 1.7));
    $('#o-cmdt').style.clipPath = `inset(0 ${((1 - wipe) * 100).toFixed(2)}% 0 0)`;
    setHTML($('#o-cmdt'), `${esc(T.COMMAND)}<span class="cc" style="opacity:${blink(t, t0 + 1.7) ? 1 : 0}"></span>`);
    setText($('#o-rep'), T.REPORT_COMMAND);
    const fade2 = (id, a) => { const p = E.out(prog(t, a, a + 0.5)); const el = $(id); el.style.opacity = p.toFixed(3); el.style.transform = `translateY(${((1 - p) * 20).toFixed(1)}px)`; };
    fade2('#o-price', c1 + 0.1); fade2('#o-fine', c1 + 0.45); fade2('#o-url', c1 + 0.75);
  }

  // Grain, and the fade to black at the very end.
  const gi = Math.floor(t * 24) % GRAIN.length, gr = T.rng(Math.floor(t * 24) + 7);
  const g = $('#grain'); g.style.backgroundImage = `url(${GRAIN[gi]})`; g.style.backgroundPosition = `${Math.floor(gr() * 256)}px ${Math.floor(gr() * 256)}px`;
  $('#black').style.opacity = Math.max(1 - prog(t, 0, 0.3), E.in(prog(t, CUE.end - 0.9, CUE.end - 0.05))).toFixed(3);
}

// ---------------------------------------------------------------------------
// Task Manager (the TikTok cuts only): opts.tm = { open: seconds since it opened, tab: 'cpu' | 'mem', clock: seconds for the graphs }
function tmPath(seed, n, w, h, base, jitter, clock, fill) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const k = Math.floor(clock * 1) + i, r = T.rng(seed * 1000 + k)();
    const v = base + (r - 0.5) * jitter + (r > 0.93 ? jitter * 1.8 : 0);
    pts.push([(i - (clock % 1)) / n * w, h - Math.max(0.5, Math.min(h - 1, v * h))]);
  }
  const d = 'M' + pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' L');
  return fill ? `${d} L${w},${h} L0,${h} Z` : d;
}
function seekTM(t, tm) {
  const w = $('#w-tm');
  show(w, !!tm);
  if (!tm) return;
  w.style.zIndex = 8;
  const p = E.out(prog(tm.open ?? 1, 0, 0.22));
  w.style.transform = `scale(${lerp(0.955, 1, p).toFixed(4)})`; w.style.opacity = p.toFixed(3);
  const mem = tm.tab === 'mem', clock = tm.clock ?? t;
  show($('#tm-cpu'), !mem); show($('#tm-mem'), mem);
  $('#tm-t-cpu').classList.toggle('sel', !mem); $('#tm-t-mem').classList.toggle('sel', mem);
  const grid = (w2, h2) => { let g = ''; for (let i = 1; i < 10; i++) g += `<path d="M0 ${(h2 * i / 10).toFixed(1)}H${w2}" stroke="rgba(255,255,255,.07)"/>`; for (let i = 1; i < 20; i++) g += `<path d="M${(w2 * i / 20).toFixed(1)} 0V${h2}" stroke="rgba(255,255,255,.07)"/>`; return g; };
  if (!mem) {
    $('#tm-g-cpu').innerHTML = grid(560, 250) + `<path d="${tmPath(3, 60, 560, 250, 0.04, 0.05, clock, true)}" fill="rgba(58,150,221,.18)"/><path d="${tmPath(3, 60, 560, 250, 0.04, 0.05, clock)}" fill="none" stroke="#3a96dd" stroke-width="1.6"/>`;
    const u = Math.max(1, Math.round(3 + (T.rng(Math.floor(clock))() - 0.5) * 4));
    setText($('#tm-util'), `${u}%`); setText($('#tm-cpu-s'), `${u}%\u00a0\u00a03.70 GHz`);
    const up = 2 * 3600 + 13 * 60 + 40 + Math.floor(clock);
    setText($('#tm-up'), `0:${String(Math.floor(up / 3600)).padStart(2, '0')}:${String(Math.floor(up / 60) % 60).padStart(2, '0')}:${String(up % 60).padStart(2, '0')}`);
  } else {
    $('#tm-g-mem').innerHTML = grid(560, 250) + `<path d="${tmPath(5, 60, 560, 250, 0.32, 0.006, clock, true)}" fill="rgba(168,107,219,.22)"/><path d="${tmPath(5, 60, 560, 250, 0.32, 0.006, clock)}" fill="none" stroke="#a86bdb" stroke-width="1.6"/>`;
  }
  $('#tm-m-cpu').innerHTML = `<path d="${tmPath(3, 20, 70, 46, 0.05, 0.06, clock, true)}" fill="rgba(58,150,221,.35)"/>`;
  $('#tm-m-mem').innerHTML = `<path d="${tmPath(5, 20, 70, 46, 0.32, 0.01, clock, true)}" fill="rgba(168,107,219,.4)"/>`;
}

// Where an element is on screen right now (after the last seek), for the TikTok cuts' pointers and circles.
window.rectOf = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
window.worldRect = (key) => R[key];
window.rectOfText = (sel, text) => {
  for (const el of document.querySelectorAll(sel)) if (el.textContent.includes(text) && el.offsetParent !== null) { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }
  return null;
};

// ---------------------------------------------------------------------------
async function init() {
  drawGrain();
  $('#wall').style.backgroundImage = `url(${drawWall()})`;
  const glow = drawGlow(3);
  for (const id of ['#cold-bg', '#title-bg', '#outro-bg']) $(id).style.backgroundImage = `url(${glow})`;
  for (const id of ['#t-sweep', '#o-sweep']) { $(id).style.webkitMaskImage = "url('/studio/assets/logo/omnidx-logo.png')"; $(id).style.maskImage = "url('/studio/assets/logo/omnidx-logo.png')"; }
  const words = (el, text, grad = []) => { el.innerHTML = text.split(' ').map((w, i) => `<span class="w${grad.includes(i) ? ' gradtext' : ''}">${esc(w)}</span>`).join(''); };
  words($('#cold1'), 'Windows runs about two hundred things for itself.');
  words($('#cold2'), "Your game gets what's left.", [3, 4]);
  build();
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  if (SHORT) {
    document.documentElement.classList.add('short');
    $('#frame').style.backgroundImage = `url(${glow})`;
  }
  measure(); plans();
  seek(0);
  window.ready = true;
}
window.seek = seek;
window.DURATION = T.DURATION;
window.FPS = T.FPS;
init();
