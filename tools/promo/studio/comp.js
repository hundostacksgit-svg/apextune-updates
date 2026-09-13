/*
 * The promo composition: scenes positioned for one moment in time.
 *
 * A video here is a list of scenes (videos.js), each a few beats long. This
 * file builds every scene's DOM once, then exposes window.seek(t), which sets
 * every element for the frame at t seconds: which scene is on, where each word
 * is in its pop, where the cursor is, how far the counter has counted. The
 * renderer (render.mjs) calls seek for each frame and screenshots it, so the
 * output is exact and repeatable — no screen recording, no dropped frames, no
 * "the machine was busy".
 *
 * Scene durations are in beats of the music, so every cut lands on a beat of
 * the beat the app's own beatmaker made. Cheap trick, and the reason the
 * videos feel edited instead of assembled.
 */
import { VIDEOS, STILLS } from './videos.js';

const q = new URLSearchParams(location.search);
const FMT = q.get('fmt') || 'tiktok';
const SIZES = { tiktok: [1080, 1920], yt: [1920, 1080], feed: [1080, 1350], thumb: [1280, 720] };
const [W, H] = SIZES[FMT] || SIZES.tiktok;
const VERT = H > W;
const A = '/promo-assets';
const ALL = [...VIDEOS, ...STILLS];
const spec = ALL.find((v) => v.id === q.get('video')) || VIDEOS[0];

const stage = document.getElementById('stage');
stage.className = `fmt-${FMT}`;
stage.style.width = `${W}px`;
stage.style.height = `${H}px`;

/* ---------------------------------------------------------------- helpers */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p) => { const c = 1.70158, d = c + 1; return 1 + d * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const lerp = (a, b, p) => a + (b - a) * p;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const money = (n) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
/** The one entrance used everywhere: rise, scale up with a little overshoot, fade in. */
function pop(node, p, { y = 40, from = 0.6 } = {}) {
  node.style.opacity = p;
  node.style.transform = `translateY(${(1 - p) * y}px) scale(${lerp(from, 1, outBack(p))})`;
}
/** Interpolate a keyframe list [{at, ...fields}] at local time l; holds before the first and after the last. */
function keyAt(keys, l, fields) {
  if (!keys || !keys.length) return null;
  if (l <= keys[0].at) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (l < b.at) {
      const p = inOut(prog(l, a.at, b.at));
      const o = { at: l };
      for (const f of fields) o[f] = lerp(a[f] ?? 0, b[f] ?? 0, p);
      return o;
    }
  }
  return keys[keys.length - 1];
}
const CURSOR_SVG = '<svg viewBox="0 0 24 24" width="56" height="56"><path d="M5 3l14 8.2-6.3 1.3 3.6 7.2-2.7 1.3-3.6-7.3L5 17.4z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/* ---------------------------------------------------------------- music */
const music = await fetch(`${A}/music/${spec.music}.json`).then((r) => r.json()).catch(() => ({ bpm: 120, beats: [] }));
/* The audio-repair scene draws measurements, not a drawing of measurements:
   this file is written by running the app's own audio-repair.js over a
   deliberately awful recording. Missing is fine — no scene needs it. */
const AUDIO = await fetch(`${A}/audio-repair.json`).then((r) => r.json()).catch(() => null);
const BPM = music.bpm || 120;
const BEAT = 60 / BPM;
const BEATS = music.beats && music.beats.length ? music.beats : Array.from({ length: 600 }, (_, i) => i * BEAT);
let pulseNow = 0;
function pulseAt(t) {
  let last = -Infinity;
  for (const b of BEATS) { if (b <= t + 1e-6) last = b; else break; }
  return Math.exp(-5 * ((t - last) / BEAT));
}

/* ---------------------------------------------------------------- timing */
let at = 0;
const scenes = (spec.scenes || []).map((s, index) => {
  const dur = s.dur ?? (s.beats ?? 4) * BEAT;
  const o = { ...s, index, start: at, dur };
  at += dur;
  return o;
});
window.DURATION = at;

/* ---------------------------------------------------------------- ground + chrome */
const bg = el('div', null, '<div class="blob a"></div><div class="blob b"></div><div class="vignette"></div>');
bg.id = 'bg';
const blobA = bg.querySelector('.a'), blobB = bg.querySelector('.b');
const layer = el('div');
const flash = el('div'); flash.id = 'flash';
const cap = el('div'); cap.id = 'cap'; const capBox = el('div', 'box'); cap.appendChild(capBox);
const wm = el('div', null, `<img src="${A}/mark.svg" alt=""><span><b>omnidx</b>.net</span>`); wm.id = 'wm';
stage.append(bg, layer, flash, cap, wm);
if (spec.noWatermark) wm.style.display = 'none';

/* ---------------------------------------------------------------- layout of the device frame */
function deviceBox(s) {
  const phone = s.frame === 'phone';
  if (FMT === 'yt' || FMT === 'thumb') {
    const sh = FMT === 'yt' ? 810 : 560;
    const sw = phone ? Math.round(sh * 390 / 844) : Math.round(sh * 1.6);
    return { sw, sh, top: FMT === 'yt' ? 104 : 90, pad: 12 };
  }
  const sw = phone ? 440 : (W - 100 - 32);
  let sh;
  if (phone) sh = Math.round(sw * 844 / 390);
  else sh = s.box === 'tall' ? (FMT === 'feed' ? 900 : 960) : s.box === 'square' ? sw : Math.round(sw / 1.6);
  const bandTop = FMT === 'feed' ? 190 : 300, bandBottom = FMT === 'feed' ? 1130 : 1320;
  const top = Math.round((bandTop + bandBottom) / 2 - (sh + 32) / 2);
  return { sw, sh, top, pad: 16 };
}

/* ---------------------------------------------------------------- scene builders */
const BUILD = {
  /* Big words, one at a time. Also the "statement" scene: same thing, smaller. */
  hook(s) {
    const root = el('div', `hook ${s.size || 'xl'}`);
    const lines = el('div', 'lines'); root.appendChild(lines);
    const words = [];
    s.lines.forEach((text, li) => {
      const line = el('div', 'line' + ((s.grad || []).includes(li) ? ' grad' : '') + ((s.mint || []).includes(li) ? ' mint' : ''));
      text.split(' ').forEach((w) => { const span = el('span', 'w', w); line.appendChild(span); words.push(span); });
      lines.appendChild(line);
    });
    let sub = null;
    if (s.sub) { sub = el('div', 'sub', s.sub); root.appendChild(sub); }
    const step = s.stagger ?? Math.min(0.14, (s.dur * 0.45) / Math.max(1, words.length));
    return { el: root, update(l) {
      words.forEach((w, k) => pop(w, prog(l, 0.05 + k * step, 0.05 + k * step + 0.3), { y: 50, from: 0.5 }));
      if (sub) pop(sub, prog(l, 0.2 + words.length * step, 0.65 + words.length * step), { y: 30, from: 0.9 });
    } };
  },

  /* The real editor in a frame: a view that pans and zooms, a cursor, a spotlight. */
  app(s) {
    const root = el('div', 'app');
    const box = deviceBox(s);
    const device = el('div', 'device' + (s.frame === 'phone' ? ' phone' : ''));
    device.style.top = `${box.top}px`; device.style.padding = `${box.pad}px`;
    const screen = el('div', 'screen'); screen.style.width = `${box.sw}px`; screen.style.height = `${box.sh}px`;
    const img = el('img', 'shot'); img.src = `${A}/shots/${s.shot}.png`;
    const spot = el('div', 'spot' + (s.spotBelow ? ' below' : '')); const lbl = el('div', 'lbl'); spot.appendChild(lbl);
    const ripple = el('div', 'ripple');
    const cur = el('div', 'cursor', CURSOR_SVG);
    screen.append(img, spot, ripple, cur); device.appendChild(screen); root.appendChild(device);
    let tag = null;
    if (s.tag) {
      tag = el('div', 'tag', s.tag); root.appendChild(tag);
      /* Above the frame when there is room under the watermark; otherwise beside
         a phone, or in the frame's top-right corner — never below, where the
         caption lives. */
      const above = box.top - 84;
      const wmBottom = FMT === 'yt' ? 0 : (FMT === 'feed' ? 170 : 300);
      if (above > wmBottom) tag.style.top = `${above}px`;
      else if (s.frame === 'phone') { tag.style.top = `${box.top + 24}px`; tag.style.left = `calc(50% + ${box.sw / 2 + box.pad + 18}px)`; tag.style.transform = 'none'; tag.style.fontSize = '24px'; tag.style.padding = '9px 18px'; }
      else { tag.style.top = `${box.top + box.pad + 16}px`; tag.style.left = 'auto'; tag.style.right = `${(W - box.sw) / 2 + 4}px`; tag.style.transform = 'none'; }
    }
    const views = Array.isArray(s.view) ? s.view : [{ at: 0, ...(s.view || { cx: 0.5, cy: 0.5, w: 1 }) }];
    const cursors = s.cursor || [];
    const spots = s.spots || (s.spot ? [s.spot] : []);
    return { el: root, update(l) {
      const asp = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 1.6;
      const v = keyAt(views, l, ['cx', 'cy', 'w']);
      const imgW = Math.max(box.sw / Math.max(0.05, v.w), box.sh * asp);
      const imgH = imgW / asp;
      let left = box.sw / 2 - v.cx * imgW, top = box.sh / 2 - v.cy * imgH;
      left = imgW <= box.sw ? (box.sw - imgW) / 2 : clamp(left, box.sw - imgW, 0);
      top = imgH <= box.sh ? (box.sh - imgH) / 2 : clamp(top, box.sh - imgH, 0);
      img.style.width = `${imgW}px`;
      img.style.transform = `translate(${left}px, ${top}px)`;
      const px = (x) => left + x * imgW, py = (y) => top + y * imgH;
      /* cursor */
      if (cursors.length) {
        const c = keyAt(cursors, l, ['x', 'y']);
        const fade = prog(l, cursors[0].at - 0.3, cursors[0].at);
        let scale = 1;
        ripple.style.opacity = 0;
        for (const k of cursors) if (k.click && l >= k.at && l < k.at + 0.45) {
          const p = prog(l, k.at, k.at + 0.45);
          scale = p < 0.25 ? lerp(1, 0.82, Math.sin(p / 0.25 * Math.PI)) : 1;
          ripple.style.opacity = (1 - p) * 0.9;
          ripple.style.transform = `translate(${px(k.x)}px, ${py(k.y)}px) scale(${lerp(0.3, 1.5, outCubic(p))})`;
        }
        cur.style.opacity = fade;
        cur.style.transform = `translate(${px(c.x)}px, ${py(c.y)}px) scale(${scale})`;
      } else cur.style.opacity = 0;
      /* spotlight */
      let shown = null;
      for (const sp of spots) if (l >= sp.at && (sp.until == null || l < sp.until)) shown = sp;
      if (shown) {
        const p = prog(l, shown.at, shown.at + 0.35);
        spot.style.opacity = p;
        spot.style.left = `${px(shown.x)}px`; spot.style.top = `${py(shown.y)}px`;
        spot.style.width = `${shown.w * imgW}px`; spot.style.height = `${shown.h * imgH}px`;
        spot.style.transform = `scale(${lerp(1.12, 1, outCubic(p))})`;
        lbl.textContent = shown.label || '';
        lbl.style.display = shown.label ? '' : 'none';
      } else spot.style.opacity = 0;
      if (tag) { const p = prog(l, 0.1, 0.5); tag.style.opacity = p; }
      const pd = prog(l, 0, 0.45);
      device.style.opacity = pd;
      device.style.transform = `translateX(-50%) translateY(${(1 - pd) * 40}px) scale(${lerp(0.96, 1, outCubic(pd))})`;
    } };
  },

  /* The two ways to pay, side by side, with the subscription's bill counting up. */
  price(s) {
    const root = el('div', 'price');
    const o = { name: 'Subscription editors', price: 22.99, years: 3, note: 'and it never stops', ...(s.other || {}) };
    const u = { name: 'OmniDx Studio · Creator', price: '$19.99', label: 'once', checks: ['No subscription. Ever.', 'Every update free, forever.', 'Every device you own.'], ...(s.ours || {}) };
    const other = el('div', 'pc other', `<div class="pl">${o.name}</div><div class="pv">${money(o.price)}<span>/month</span><i class="strike"></i></div>
      <div class="pt">${o.years} years = <b class="cnt">$0.00</b></div><div class="pn">${o.note}</div>`);
    const vs = el('div', 'vs', 'vs');
    const ours = el('div', 'pc ours', `<div class="pl">${u.name}</div><div class="pv">${u.price}<span>${u.label}</span></div>
      <div class="pt">${o.years} years = <b>${u.price}</b></div><ul class="chk">${u.checks.map((c) => `<li>${c}</li>`).join('')}</ul>`);
    root.append(other, vs, ours);
    const cnt = other.querySelector('.cnt'), strike = other.querySelector('.strike'), lis = [...ours.querySelectorAll('li')];
    const total = o.price * o.years * 12;
    return { el: root, update(l) {
      const p1 = outCubic(prog(l, 0, 0.5)); other.style.opacity = p1; other.style.transform = `translateX(${(1 - p1) * -140}px)`;
      const p2 = outCubic(prog(l, 0.3, 0.8)); ours.style.opacity = p2; ours.style.transform = `translateX(${(1 - p2) * 140}px)`;
      vs.style.opacity = prog(l, 0.5, 0.8);
      cnt.textContent = money(total * outCubic(prog(l, 0.9, 2.6)));
      strike.style.width = `${outCubic(prog(l, 2.8, 3.2)) * 106}%`;
      lis.forEach((li, k) => pop(li, prog(l, 3.0 + k * 0.28, 3.4 + k * 0.28), { y: 24, from: 0.85 }));
    } };
  },

  /* A title, a number that climbs, and chips that arrive on the beat. */
  list(s) {
    const root = el('div', 'list' + (s.big ? ' big' : ''));
    const head = el('div', 'head');
    let num = null;
    if (s.count != null) { num = el('div', 'num', '0'); head.appendChild(num); }
    head.appendChild(el('div', 'ttl' + (s.title.length > 22 ? ' small' : ''), s.title));
    const grid = el('div', 'grid');
    const chips = s.items.map((it) => {
      const [ic, txt] = Array.isArray(it) ? it : [null, it];
      const c = el('div', 'chip' + ((s.hot || []).includes(txt) ? ' hot' : ''), (ic ? `<span class="ic">${ic}</span>` : '') + `<span>${txt}</span>`);
      grid.appendChild(c);
      return c;
    });
    root.append(head, grid);
    const step = (s.stepBeats ?? 0.5) * BEAT, t0 = 0.35;
    const countEnd = Math.min(s.dur - 0.5, t0 + chips.length * step + 0.4);
    return { el: root, update(l) {
      pop(head, prog(l, 0, 0.4), { y: 30, from: 0.9 });
      chips.forEach((c, k) => pop(c, prog(l, t0 + k * step, t0 + k * step + 0.3), { y: 30, from: 0.5 }));
      if (num) num.textContent = (s.prefix || '') + Math.round(s.count * outCubic(prog(l, 0.2, countEnd))) + (s.suffix || '');
    } };
  },

  /* The AI editor, typed live, then its plan. */
  typing(s) {
    const root = el('div', 'typing');
    const card = el('div', 'card', `<div class="hd"><i>✨</i> AI editor <span class="pill">runs on your device</span></div>
      <div class="ta"><span class="txt"></span><span class="caret"></span></div><div class="btn">✨ Plan the edit</div><ul class="steps"></ul><div class="do">Do it</div>`);
    root.appendChild(card);
    const txt = card.querySelector('.txt'), caret = card.querySelector('.caret'), btn = card.querySelector('.btn'), ul = card.querySelector('.steps'), doBtn = card.querySelector('.do');
    const lis = (s.steps || []).map((st) => { const li = el('li', null, st); ul.appendChild(li); return li; });
    const cps = s.cps ?? 30, tStart = 0.35, tType = s.prompt.length / cps, tEnd = tStart + tType;
    const tPress = tEnd + 0.4, tSteps = tPress + 0.6, gap = s.stepGap ?? 0.32;
    return { el: root, update(l) {
      pop(card, prog(l, 0, 0.4), { y: 40, from: 0.92 });
      txt.textContent = s.prompt.slice(0, Math.floor(clamp((l - tStart) / tType) * s.prompt.length));
      caret.style.opacity = l < tPress && Math.floor(l * 3) % 2 === 0 ? 1 : 0;
      const pp = prog(l, tPress, tPress + 0.3);
      btn.style.transform = `scale(${l >= tPress && l < tPress + 0.3 ? lerp(1, 0.95, Math.sin(pp * Math.PI)) : 1})`;
      btn.style.opacity = l > tPress + 0.3 ? 0.55 : 1;
      lis.forEach((li, k) => pop(li, prog(l, tSteps + k * gap, tSteps + k * gap + 0.3), { y: 20, from: 0.9 }));
      const pd = prog(l, tSteps + lis.length * gap + 0.2, tSteps + lis.length * gap + 0.5);
      doBtn.style.opacity = pd; doBtn.style.boxShadow = `0 0 ${40 * pd}px rgba(49,217,167,.5)`;
    } };
  },

  /* A timeline being cut on the beat. */
  timeline(s) {
    const root = el('div', 'tl');
    const card = el('div', 'card');
    const ruler = el('div', 'ruler');
    for (let i = 0; i <= 10; i++) { const m = el('i', null, `${i * 2}s`); m.style.left = `${2 + i * 9.6}%`; ruler.appendChild(m); }
    const beatsRow = el('div', 'beats');
    const lanes = el('div'); lanes.style.position = 'relative';
    const track = (name, cls) => { const t = el('div', 'track'); t.appendChild(el('div', 'name', name)); const lane = el('div', 'lane' + (cls ? ' ' + cls : '')); t.appendChild(lane); lanes.appendChild(t); return lane; };
    const vText = track('Text'), vMain = track('Video 1'), aMain = track('Audio 1');
    const title = el('div', 'clip title', '<span class="nm">T  Summer reel</span>'); title.style.left = '12%'; title.style.width = '34%'; vText.appendChild(title);
    const clips = [['sunset', 26], ['city', 22], ['forest', 30], ['studio', 20]];
    let x = 0;
    for (const [name, w] of clips) {
      const c = el('div', 'clip', `<img src="${A}/footage/${name}-preview.png" alt=""><span class="nm">${name}.mp4</span>`);
      c.style.left = `${x}%`; c.style.width = `${w - 0.6}%`; vMain.appendChild(c); x += w;
    }
    const wave = el('div', 'wave');
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 140; i++) { const b = el('i'); const beat = i % 7 === 0; b.style.height = `${(beat ? 70 : 18) + rnd() * (beat ? 30 : 40)}%`; wave.appendChild(b); }
    aMain.appendChild(wave);
    const head = el('div', 'head'); lanes.appendChild(head);
    const tflash = el('div', 'flash');
    card.append(ruler, beatsRow, lanes, tflash); root.appendChild(card);
    let note = null; if (s.note) { note = el('div', 'note', s.note); root.appendChild(note); }
    const x0 = 2, x1 = 98;
    const beatsIn = BEATS.filter((b) => b >= s.start - 1e-6 && b < s.start + s.dur - 0.05).map((b) => b - s.start);
    const dots = beatsIn.map((b) => { const d = el('b'); d.style.left = `${lerp(x0, x1, b / s.dur)}%`; beatsRow.appendChild(d); return d; });
    const every = s.every ?? 1;
    const cuts = beatsIn.filter((_, i) => i % every === 0 && i > 0).map((b) => { const c = el('div', 'cut'); c.style.left = `${lerp(x0, x1, b / s.dur)}%`; vMain.appendChild(c); return { c, b }; });
    return { el: root, update(l) {
      pop(card, prog(l, 0, 0.4), { y: 30, from: 0.94 });
      const xf = lerp(x0, x1, l / s.dur);
      const laneW = vMain.clientWidth || 800;
      head.style.left = `${130 + laneW * xf / 100}px`;
      dots.forEach((d, i) => d.classList.toggle('hit', l >= beatsIn[i]));
      let fl = 0;
      for (const { c, b } of cuts) { const p = prog(l, b, b + 0.3); c.style.opacity = l >= b ? 1 : 0; fl = Math.max(fl, (1 - p) * (l >= b ? 0.35 : 0)); }
      tflash.style.opacity = fl;
      if (note) pop(note, prog(l, 0.4, 0.8), { y: 20, from: 0.85 });
    } };
  },

  /* Before and after, revealed by a wipe.
     One picture with two filters (a grade), or — with `pair` — two different
     pictures, which is how the eraser and the background remover are shown:
     both frames come out of the app, so the wipe is the actual result. */
  wipe(s) {
    const root = el('div', 'wipe');
    const frame = el('div', 'frame');
    const one = s.pair ? `${A}/footage/${s.pair}-before.png` : `${A}/footage/${s.shot || 'sunset'}-preview.png`;
    const two = s.pair ? `${A}/footage/${s.pair}-after.png` : one;
    const before = el('img'); before.src = one; if (!s.pair) before.style.filter = s.before || 'saturate(.35) contrast(.85) brightness(.9)';
    const after = el('img'); after.src = two; if (!s.pair) after.style.filter = s.after || 'saturate(1.35) contrast(1.12)';
    const line = el('div', 'line');
    const lb1 = el('div', 'lb before', (s.labels || [])[0] || 'Before'), lb2 = el('div', 'lb after', (s.labels || [])[1] || 'After');
    frame.append(before, after, line, lb1, lb2);
    /* The tap that starts it: a finger goes down on the thing, and the wipe
       leaves from where it landed. Nothing else in the shot is touched. */
    let tap = null, tapRing = null, tapLbl = null;
    if (s.tap) {
      tap = el('div', 'tap'); tap.style.left = `${s.tap.x * 100}%`; tap.style.top = `${s.tap.y * 100}%`;
      tapRing = el('div', 'ring'); tapLbl = el('div', 'tlbl', s.tap.label || 'tap');
      tap.append(tapRing, tapLbl); frame.appendChild(tap);
    }
    root.appendChild(frame);
    const at = s.tap ? (s.tap.at ?? 0.9) : 0;
    const start = s.tap ? at + 0.9 : 0.5;
    const end = s.dur - 0.4;
    return { el: root, update(l) {
      pop(frame, prog(l, 0, 0.4), { y: 30, from: 0.94 });
      if (tap) {
        /* Down, a ring that leaves, then it stays lit long enough to be read
           before the wipe takes over. */
        const down = prog(l, at, at + 0.16), gone = prog(l, at + 1.05, at + 1.4);
        tap.style.opacity = down * (1 - gone);
        tap.style.transform = `translate(-50%, -50%) scale(${lerp(1.5, 1, outBack(down))})`;
        const r = prog(l, at, at + 0.6);
        tapRing.style.transform = `scale(${lerp(0.3, 2.6, outCubic(r))})`;
        tapRing.style.opacity = (1 - r) * 0.9;
      }
      const p = prog(l, start, end);
      const x = lerp(6, 94, inOut(p));
      after.style.clipPath = `inset(0 ${100 - x}% 0 0)`;
      line.style.left = `${x}%`;
      line.style.opacity = l >= start - 0.05 ? 1 : 0;
      /* Each label belongs to the half of the picture it is standing on, so
         neither one names a frame that is not on screen yet. */
      lb2.style.opacity = prog(l, start, start + 0.35);
      lb1.style.opacity = 1 - prog(l, end - 0.7, end - 0.2);
    } };
  },

  /* Audio repair, drawn: the same three seconds before and after the app's
     repair pass, with a sweep that fills the clean one in as it goes. Every
     number on screen is measured, and comes in from audio-repair.json. */
  sound(s) {
    const root = el('div', 'sound');
    const D = AUDIO || { before: [0], after: [0], floorBefore: 0.1, floorAfter: 0.02, clicks: [], seconds: 3 };
    const card = el('div', 'card'); root.appendChild(card);

    const panel = (cls, label, env, floor, marks) => {
      const wrap = el('div', `pan ${cls}`);
      wrap.appendChild(el('div', 'plbl', label));
      const box = el('div', 'wv');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 1000 300'); svg.setAttribute('preserveAspectRatio', 'none');
      /* The noise floor, as a band you can see the height of. */
      const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      band.setAttribute('class', 'floor'); band.setAttribute('x', '0'); band.setAttribute('width', '1000');
      const fh = Math.max(1.5, floor * 290);
      band.setAttribute('y', String(150 - fh)); band.setAttribute('height', String(fh * 2));
      svg.appendChild(band);
      const step = 1000 / env.length, bw = Math.max(1.6, step * 0.62);
      const bars = env.map((v, k) => {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('class', 'bar'); r.setAttribute('x', String(k * step + (step - bw) / 2)); r.setAttribute('width', String(bw));
        svg.appendChild(r); return { r, v };
      });
      box.appendChild(svg);
      /* The clicks, pinned where they are in the recording. */
      const pins = (marks || []).map((t) => { const e = el('div', 'pin', '✕'); e.style.left = `${(t / D.seconds) * 100}%`; box.appendChild(e); return e; });
      wrap.appendChild(box);
      const note = el('div', 'fnote'); wrap.appendChild(note);
      return { wrap, bars, pins, note, box };
    };

    const A1 = panel('bad', (s.labels || [])[0] || 'straight off the phone', D.before, D.floorBefore, D.clicks);
    const A2 = panel('good', (s.labels || [])[1] || 'after one pass', D.after, D.floorAfter, null);
    A1.note.innerHTML = s.noteBefore || 'hiss · 60Hz hum · clicks · wandering level';
    const dB = (D.floorBefore > 0 && D.floorAfter > 0) ? 20 * Math.log10(D.floorAfter / D.floorBefore) : 0;
    A2.note.innerHTML = s.noteAfter || `hum gone · noise floor <b>${dB.toFixed(0)} dB</b> · clicks repaired · level evened`;
    const sweep = el('div', 'sweep');
    card.append(A1.wrap, sweep, A2.wrap);

    /* Inside the card, not under it: the caption band starts at a fixed height
       and a row floating between the two would land in it. */
    const chips = el('div', 'chips'); card.appendChild(chips);
    const chipEls = (s.chips || ['60Hz hum', 'hiss', 'clicks', 'wandering level']).map((c) => { const e = el('span', null, `${c} <i>✓</i>`); chips.appendChild(e); return e; });

    const t0 = 0.55, t1 = Math.max(t0 + 0.6, s.dur - 1.5);
    return { el: root, update(l) {
      pop(card, prog(l, 0, 0.4), { y: 34, from: 0.94 });
      const p = inOut(prog(l, t0, t1));
      /* The dirty bars are full height from the start; the clean ones grow in
         behind the sweep, so you watch the repair happen rather than cut to it. */
      A1.bars.forEach((b, k) => {
        const passed = clamp((p * A1.bars.length - k) / 6);
        b.r.setAttribute('height', String(Math.max(1, b.v * 290)));
        b.r.setAttribute('y', String(150 - b.v * 145));
        b.r.style.opacity = String(lerp(1, 0.28, passed));
      });
      A2.bars.forEach((b, k) => {
        const passed = clamp((p * A2.bars.length - k) / 6);
        const hgt = Math.max(1, b.v * 290 * passed);
        b.r.setAttribute('height', String(hgt)); b.r.setAttribute('y', String(150 - hgt / 2));
      });
      A1.pins.forEach((e, k) => {
        const x = (D.clicks[k] / D.seconds);
        e.style.opacity = String(prog(l, 0.35 + k * 0.06, 0.6 + k * 0.06) * (1 - clamp((p - x) * 6)));
      });
      sweep.style.left = `calc(30px + (100% - 60px) * ${p.toFixed(4)})`;
      sweep.style.opacity = String(prog(l, t0 - 0.15, t0) * (1 - prog(l, t1, t1 + 0.25)));
      A2.wrap.style.setProperty('--fill', String(p));
      chipEls.forEach((e, k) => pop(e, prog(l, t1 - 0.5 + k * 0.16, t1 - 0.2 + k * 0.16), { y: 22, from: 0.7 }));
    } };
  },

  /* The end card: the mark, the address, the price, the tags. */
  end(s) {
    const root = el('div', 'end');
    const mark = el('img', 'mark'); mark.src = `${A}/mark.svg`;
    const url = el('div', 'url', '<b>omnidx</b>.net');
    const line = el('div', 'line', s.line || 'Free to start. <b>$19.99 once</b> for everything in Creator.');
    const tags = el('div', 'tags');
    const tagEls = (s.tags || []).map((t) => { const e = el('span', null, t); tags.appendChild(e); return e; });
    const bio = el('div', 'bio', s.bio || 'link in bio ↑');
    if (FMT === 'yt') { const col = el('div', 'col'); col.append(url, line, tags, bio); root.append(mark, col); }
    else root.append(mark, url, line, tags, bio);
    return { el: root, update(l) {
      const p0 = prog(l, 0, 0.5);
      mark.style.opacity = p0;
      mark.style.transform = `scale(${lerp(0.5, 1, outBack(p0)) * (1 + pulseNow * 0.05)})`;
      pop(url, prog(l, 0.2, 0.6), { y: 40, from: 0.9 });
      pop(line, prog(l, 0.5, 0.9), { y: 30, from: 0.95 });
      tagEls.forEach((e, k) => pop(e, prog(l, 0.8 + k * 0.1, 1.1 + k * 0.1), { y: 20, from: 0.7 }));
      pop(bio, prog(l, 1.4, 1.8), { y: 24, from: 0.8 });
    } };
  },

  /* A YouTube thumbnail: still. */
  thumb(s) {
    const root = el('div', 'thumb', `<div class="txt"><div class="big">${s.big}</div><div class="small">${s.small || ''}</div></div>
      <div class="device"><img src="${A}/shots/${s.shot || 'editor'}.png" alt=""></div>`);
    return { el: root, update() {} };
  },
};
BUILD.statement = (s) => BUILD.hook({ size: 'md', ...s });

const built = scenes.map((s) => {
  const b = BUILD[s.type](s);
  b.el.classList.add('scene');
  layer.appendChild(b.el);
  return { s, ...b };
});

/* ---------------------------------------------------------------- the frame */
let current = null, capKey = null, capAt = 0;
window.seek = function seek(t) {
  t = clamp(t, 0, Math.max(0, window.DURATION - 1e-4));
  let cur = built[0];
  for (const b of built) if (t >= b.s.start) cur = b;
  if (cur !== current) { built.forEach((b) => b.el.classList.toggle('on', b === cur)); current = cur; }
  const s = cur.s, l = t - s.start;
  pulseNow = pulseAt(t);
  stage.style.setProperty('--pulse', pulseNow.toFixed(3));
  blobA.style.transform = `translate(${Math.sin(t * 0.35) * 140}px, ${Math.cos(t * 0.27) * 110}px)`;
  blobB.style.transform = `translate(${Math.cos(t * 0.3) * -120}px, ${Math.sin(t * 0.22) * -100}px)`;
  cur.update(l, t);
  flash.style.opacity = s.index > 0 && !s.noflash ? Math.max(0, 1 - l / 0.14) * 0.7 : 0;
  /* the caption: one per scene, or a list of [beatOffset, text] */
  let text = s.cap || null, since = 0;
  if (s.caps) for (const [b, tx] of s.caps) if (l >= b * BEAT) { text = tx; since = b * BEAT; }
  const key = `${s.index}:${text}`;
  if (key !== capKey) { capKey = key; capAt = since; capBox.innerHTML = text || ''; }
  if (text) { cap.style.display = ''; pop(capBox, prog(l, capAt, capAt + 0.28), { y: 24, from: 0.85 }); }
  else cap.style.display = 'none';
};

/* ---------------------------------------------------------------- ready */
await Promise.all(['800 50px Inter', '600 50px Inter', '500 40px Inter', '800 50px Sora', '700 30px Inter'].map((f) => document.fonts.load(f).catch(() => {})));
await Promise.all([...document.images].map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => { i.onload = () => i.decode().then(r, r); i.onerror = r; }))));
window.seek(Number(q.get('t') || 0));
window.READY = true;
