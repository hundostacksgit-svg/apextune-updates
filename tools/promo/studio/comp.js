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
import { VIDEOS, STILLS, DROP_TONES } from './videos.js';

const q = new URLSearchParams(location.search);
/*
 * Half a frame, for deciding which cut is live.
 *
 * A cut is asked for at a time; the renderer only samples the composition at
 * frame boundaries. Testing `l >= cut.at` means a cut asked for at 1.2673s
 * first appears on the frame at 1.3000 — because frame 38 lands at 1.2667,
 * six tenths of a millisecond short — so every cut in a beat-locked edit came
 * out up to a full frame late, and measurably so: the first render of mog-02
 * was between 21 and 33ms behind its own grid on every cut. Allowing half a
 * frame of tolerance puts each cut on the NEAREST frame instead of the next
 * one, which is what an NLE does and which halves the worst error.
 */
const HALF_FRAME = 0.5 / (Number(q.get('fps')) || 30);
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

/* ---------------------------------------------------------------- music, or a voice */
/*
 * A narrated tour has no music and takes its timing from the speech instead:
 * voice.mjs says each line, measures it, and writes the start and length of
 * every scene here. The picture then holds for exactly as long as the
 * sentence about it, which is the whole reason these read like a tour rather
 * than a slideshow with a voice laid over it.
 */
const VOICE = spec.voice ? await fetch(`${A}/voice/${spec.id}.json`).then((r) => r.json()).catch(() => null) : null;
const music = spec.music
  ? await fetch(`${A}/music/${spec.music}.json`).then((r) => r.json()).catch(() => ({ bpm: 120, beats: [] }))
  : { bpm: 120, beats: [] };
/* The audio-repair scene draws measurements, not a drawing of measurements:
   this file is written by running the app's own audio-repair.js over a
   deliberately awful recording. Missing is fine — no scene needs it. */
const AUDIO = await fetch(`${A}/audio-repair.json`).then((r) => r.json()).catch(() => null);
/*
 * Where the controls are in each screenshot, measured by shots.mjs at the
 * instant it took them. A scene says `on: 'plan'` and the cursor goes to the
 * middle of the thing that was actually on screen — so a layout change moves
 * the cursor with it instead of leaving it pointing at empty chrome.
 */
const MARKS = await fetch(`${A}/shots/shots.json`).then((r) => r.json()).catch(() => ({}));
const BPM = music.bpm || 120;
const BEAT = 60 / BPM;
const BEATS = music.beats && music.beats.length ? music.beats : Array.from({ length: 600 }, (_, i) => i * BEAT);
let pulseNow = 0;
function pulseAt(t) {
  /* Nothing is playing, so nothing pulses. Scenes that scale on the beat sit
     still instead of throbbing to a track that is not there. */
  if (!spec.music) return 0;
  let last = -Infinity;
  for (const b of BEATS) { if (b <= t + 1e-6) last = b; else break; }
  return Math.exp(-5 * ((t - last) / BEAT));
}

/* ---------------------------------------------------------------- timing */
/*
 * The cold open: lead with the thing, not the claim about it.
 *
 * Twelve videos posted, and every one of their covers was a line of text on the
 * same gradient — so the profile grid read as twelve adverts and each video's
 * first frame gave a scroller nothing to look at. The hook scenes are good
 * writing and they are still in here; they just do not go first. This lifts the
 * first scene that shows something real to the front, and the words land second,
 * once somebody is already watching.
 *
 * Not applied to the narrated tours: their scene order is the order the voice
 * was recorded in, and moving a scene would put the wrong sentence over it.
 */
const SHOWS_SOMETHING = ['app', 'wipe', 'sound', 'timeline', 'typing'];
function coldOpen(list) {
  const i = list.findIndex((s) => SHOWS_SOMETHING.includes(s.type));
  if (i <= 0) return list;
  return [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
}
const ordered = q.get('cold') === '1' && !spec.voice ? coldOpen(spec.scenes || []) : (spec.scenes || []);

let at = 0;
const scenes = ordered.map((s, index) => {
  const line = VOICE?.lines?.[index];
  const dur = line ? line.dur : (s.dur ?? (s.beats ?? 4) * BEAT);
  const o = { ...s, index, start: line ? line.start : at, dur };
  at = o.start + dur;
  return o;
});
/* The tail after the last word, so the end card is not cut off mid-breath. */
window.DURATION = VOICE ? VOICE.total : at;

/* ---------------------------------------------------------------- ground + chrome */
const bg = el('div', null, '<div class="blob a"></div><div class="blob b"></div><div class="vignette"></div>');
bg.id = 'bg';
const blobA = bg.querySelector('.a'), blobB = bg.querySelector('.b');
const layer = el('div');
const flash = el('div'); flash.id = 'flash';
const cap = el('div'); cap.id = 'cap'; const capBox = el('div', 'box'); cap.appendChild(capBox);
const wm = el('div', null, `<img src="${A}/mark.svg" alt=""><span><b>omnidx</b>.net</span>`); wm.id = 'wm';
/* A small mark in the top-left rather than the banner across the top: it has
   to be readable for a minute without sitting on the picture, and the top
   left is the one corner TikTok puts nothing of its own in. */
if (spec.wm === 'corner') wm.classList.add('corner');
/* No mark at all on a loop that goes out as somebody else's video. */
if (spec.wm === 'none') wm.style.display = 'none';
/* A whole-video look, not a per-scene one: `style: 'native'` drops the studio
   ground and moves the caption to where a phone would put it. */
if (spec.style) stage.classList.add(spec.style);
stage.append(bg, layer, flash, cap, wm);
if (spec.noWatermark) wm.style.display = 'none';

/* ---------------------------------------------------------------- layout of the device frame */
function deviceBox(s) {
  /* Edge to edge, no frame: what a screen recording looks like when somebody
     posts one, as against a product shot sitting in a rounded rectangle. */
  if (s.bleed) return { sw: W, sh: H, top: 0, pad: 0, bleed: true };
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
    const device = el('div', 'device' + (s.frame === 'phone' ? ' phone' : '') + (s.bleed ? ' bleed' : ''));
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
         caption lives. A corner watermark is a small pill in the top-left, so
         the middle of that band is free and the tag can sit above the frame
         rather than on top of the editor's own chrome. */
      const above = box.top - 84;
      const wmBottom = FMT === 'yt' || spec.wm === 'corner' ? 0 : (FMT === 'feed' ? 170 : 300);
      if (above > wmBottom) tag.style.top = `${above}px`;
      else if (s.frame === 'phone') { tag.style.top = `${box.top + 24}px`; tag.style.left = `calc(50% + ${box.sw / 2 + box.pad + 18}px)`; tag.style.transform = 'none'; tag.style.fontSize = '24px'; tag.style.padding = '9px 18px'; }
      else { tag.style.top = `${box.top + box.pad + 16}px`; tag.style.left = 'auto'; tag.style.right = `${(W - box.sw) / 2 + 4}px`; tag.style.transform = 'none'; }
    }
    /* `on: '<mark>'` anywhere a coordinate is wanted: the cursor goes to the
       middle of that control, a spotlight takes its box, and a view centres on
       it. An unknown mark says so and falls back to whatever was written by
       hand, because a silently mis-aimed cursor is the failure worth shouting
       about. */
    const markOf = (name) => {
      const b = MARKS[s.shot]?.[name];
      if (!b) console.warn(`comp: no mark "${name}" in ${s.shot}`);
      return b;
    };
    const centre = (k) => {
      if (!k.on) return k;
      const b = markOf(k.on);
      return b ? { ...k, x: b.x + b.w / 2, y: b.y + b.h / 2 } : k;
    };
    const views = (Array.isArray(s.view) ? s.view : [{ at: 0, ...(s.view || { cx: 0.5, cy: 0.5, w: 1 }) }])
      .map((v) => {
        if (!v.on) return v;
        const b = markOf(v.on);
        return b ? { ...v, cx: b.x + b.w / 2, cy: b.y + b.h / 2 } : v;
      });
    const cursors = (s.cursor || []).map(centre);
    const spots = (s.spots || (s.spot ? [s.spot] : [])).map((sp) => {
      if (!sp.on) return sp;
      const b = markOf(sp.on);
      if (!b) return sp;
      const pad = sp.pad ?? 0.008;
      return { ...sp, x: b.x - pad, y: b.y - pad * 1.6, w: b.w + pad * 2, h: b.h + pad * 3.2 };
    });
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
        /* A spotlight with an `until` fades out rather than vanishing: cutting
           it to nothing on one frame reads as a dropped frame, not as a label
           that has finished saying its piece. */
        const out = shown.until == null ? 1 : 1 - prog(l, shown.until - 0.35, shown.until);
        spot.style.opacity = p * out;
        spot.style.left = `${px(shown.x)}px`; spot.style.top = `${py(shown.y)}px`;
        spot.style.width = `${shown.w * imgW}px`; spot.style.height = `${shown.h * imgH}px`;
        spot.style.transform = `scale(${lerp(1.12, 1, outCubic(p))})`;
        lbl.textContent = shown.label || '';
        lbl.style.display = shown.label ? '' : 'none';
      } else spot.style.opacity = 0;
      if (tag) { const p = prog(l, 0.1, 0.5); tag.style.opacity = p; }
      /* A full-bleed shot does not fly in. A screen recording is either on or
         it is not, and an entrance animation is the tell that it is an advert. */
      const pd = s.bleed ? 1 : prog(l, 0, 0.45);
      device.style.opacity = pd;
      device.style.transform = s.bleed ? 'translateX(-50%)'
        : `translateX(-50%) translateY(${(1 - pd) * 40}px) scale(${lerp(0.96, 1, outCubic(pd))})`;
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

  /*
   * A question from the feed, and the answer.
   *
   * The format that travels furthest from an account nobody has heard of,
   * because it does not look like an advert — it looks like somebody
   * answering. The question has to be a real objection asked the way people
   * type, lower case and unpunctuated: a tidy one reads as invented, and a
   * question nobody would ask reads as an advert wearing a costume.
   */
  comment(s) {
    const root = el('div', 'cmt' + (s.small ? ' sm' : ''));
    const bubble = el('div', 'bubble', `<span class="av"></span>
      <div><div class="who">${s.who || 'a comment'}</div><p class="q">${s.q}</p>
      ${s.badge ? `<span class="badge">${s.badge}</span>` : ''}</div>`);
    /*
     * The answer arrives in chunks, not words: it carries markup, and splitting
     * a string on spaces cuts a tag in half and colours one word by accident.
     * A chunk is a clause, which is the beat you want anyway.
     */
    const ans = el('div', 'ans');
    const parts = (Array.isArray(s.a) ? s.a : [s.a]).map((chunk, i, all) => {
      const span = el('span', 'w', chunk + (i < all.length - 1 ? ' ' : ''));
      ans.appendChild(span);
      return span;
    });
    root.append(bubble, ans);
    /* After the question has been read, not with it. */
    const gap = s.read ?? 1.1;
    const step = Math.min(0.6, (s.dur ? (s.dur - gap - 0.8) : 2) / Math.max(1, parts.length));
    return { el: root, update(l) {
      pop(bubble, prog(l, 0.05, 0.45), { y: 34, from: 0.9 });
      parts.forEach((w, k) => pop(w, prog(l, gap + k * step, gap + 0.36 + k * step), { y: 26, from: 0.85 }));
    } };
  },

  /*
   * The slow half. One frame, a push in, and a number getting worse.
   *
   * The reference holds a single shot for six seconds before it cuts anything,
   * and the drop only hits because of how long that wait was. Copying the cuts
   * without copying the wait produces a montage that starts loud and stays
   * there, which is the thing that makes an edit feel cheap.
   */
  tension(s) {
    const root = el('div', 'tension');
    const plate = el('div', 'plate');
    /*
     * The names are set in our own typeface and greyed back. Naming what people
     * already pay for is ordinary comparison and needs nobody's permission;
     * drawing their marks would be a different thing entirely, and is not what
     * makes this land — the list does.
     */
    const names = s.names || [];
    /*
     * The big slot counts, or it states a figure — never both.
     *
     * `count` makes it tick through a number of months and says nothing about
     * money, which is the version that survives the house rule that no number
     * goes on screen unless the pricing page carries it. A monthly price for
     * somebody else's editor is not on our pricing page and is not ours to
     * assert; the length of time somebody has been renting one is not a claim
     * about anybody.
     */
    const counting = Boolean(s.count);
    plate.innerHTML = `<div class="per">${s.per || 'every month'}</div>
      ${names.length ? `<div class="names">${names.map((n, i) =>
        `<div class="name${i === names.length - 1 ? ' last' : ''}">${n}</div>`).join('')}</div>` : ''}
      <div class="amt${counting ? ' count' : ''}">${counting ? `${s.count.pre || ''} 1` : (s.amount || '')}</div>
      <div class="sub">${s.sub || 'forever'}</div>
      ${counting ? '' : '<div class="tick">$0.00</div>'}`;
    const veil = el('div', 'veil');
    root.append(plate, veil);
    const tick = plate.querySelector('.tick');
    const nameEls = [...plate.querySelectorAll('.name')];
    const amt = plate.querySelector('.amt');
    /* What the bill reaches by the time the drop lands. */
    const total = s.total ?? 22.99 * 60;
    /* The last beat before the cut: everything is blown out of the frame, so the
       drop arrives into a hole rather than over the top of a still picture. */
    const blowAt = (s.dur || 6) - (s.blow ?? 0.34);
    return { el: root, update(l) {
      const p = s.dur ? l / s.dur : 0;
      /* A push that accelerates: slow enough to be uncomfortable, then gone. */
      const blow = prog(l, blowAt, s.dur || 6);
      plate.style.transform = `scale(${lerp(1, 1.16, p * p) * lerp(1, 1.7, outCubic(blow))})`;
      plate.style.filter = `saturate(${lerp(1, 0.45, p)}) brightness(${lerp(1, 0.78, p)}) blur(${blow * 26}px)`;
      plate.style.opacity = String(1 - blow);
      veil.style.opacity = String(outCubic(p) * 0.9);
      if (counting) {
        /*
         * Accelerating, and it lands on the last number with time to read it.
         *
         * An ease-out reached sixty at the halfway mark and then sat there for
         * three seconds, which is the opposite of the feeling — the months are
         * supposed to pile up faster the longer this goes on. Slightly
         * accelerating instead, arriving at 0.88 of the scene, so the final
         * number holds for about four tenths of a second before the blowout
         * blurs it.
         */
        const n = Math.max(1, Math.round(1 + (s.count.to - 1) * Math.min(1, p / 0.88) ** 1.3));
        amt.textContent = `${s.count.pre || ''} ${n}`.trim();
      } else if (tick) {
        tick.textContent = money(total * outCubic(Math.min(1, p * 1.25)));
        tick.style.opacity = String(prog(l, 0.5, 1.2));
      }
      /* One name at a time, each landing harder than the last. */
      const step = s.nameStep ?? 0.95;
      nameEls.forEach((n, i) => pop(n, prog(l, 0.35 + i * step, 0.75 + i * step), { y: 40, from: 0.72 }));
      if (amt) pop(amt, prog(l, counting ? 0.35 : 0.35 + nameEls.length * step,
        counting ? 0.85 : 0.85 + nameEls.length * step), { y: 30, from: 0.8 });
    } };
  },

  /*
   * The drop: somebody else's cut list, our pictures.
   *
   * `cuts` comes out of dissect.mjs — the measured times from the reference —
   * so the section lands where the track lands rather than where a guess put
   * it. One cell per cut, all built up front and only the live one shown, which
   * is what keeps a thirty-two cut section renderable frame by frame.
   */
  drop(s) {
    const root = el('div', 'drop');
    const flash = el('div', 'flash');
    /*
     * Why every other cut is graded differently.
     *
     * The first rebuild lost six of its thirty-one cuts — dissecting the render
     * found them missing — and measuring the crops explained it: every shot in
     * this app is dark chrome, mean luma 9 to 60 out of 255, so two consecutive
     * panels differ by less than the scene detector's threshold however hard the
     * picture moves. The reference does not have this problem because it is four
     * differently-coloured cars. This is the same lever done on purpose: one cut
     * crushed and cool, the next lifted and warm, alternating all the way down.
     * It guarantees a delta on every cut no matter what is in frame, and it is
     * what a phonk edit does anyway.
     */
    /* A scene may bring its own pair — the third mog is graded red to sit
       under a red reference — and the verifier reads the same field. */
    const TONES = s.tones || DROP_TONES;
    /*
     * A frame says which way it goes, because only the frame knows.
     *
     * Alternating on the cut index looks like it should work and does not: the
     * frame list is shorter than the cut list and cycles through it, so the same
     * picture comes up warm on one pass and cool on the next, and two cuts meet
     * in the middle. The tone belongs to the picture — a dark panel goes darker,
     * a lit one goes brighter — and videos.js pins it from the measured luma.
     * The index fallback is for a drop scene that has not been measured yet; it
     * is better than nothing and worse than measuring.
     */
    const toneOf = (i, f) => TONES[f.tone] || (i % 2 ? TONES.warm : TONES.cool);
    const cells = (s.cuts || []).map((c, i) => {
      const f = (s.frames || [])[i % Math.max(1, (s.frames || []).length)] || {};
      /* A cut that is the mark rather than a screenshot: the arrival. It takes
         the same punch and shake as every other cut, so it reads as part of the
         montage instead of as a card dropped into the middle of one. */
      if (f.mark) {
        const cell = el('div', 'cell markcard');
        const mk = el('img', 'mk'); mk.src = `${A}/mark.svg`;
        const wm = el('div', 'wm', '<b>omnidx</b>.net');
        cell.append(mk, wm);
        root.appendChild(cell);
        return { cell, mark: true, mk, wm, c, f, punchy: c.dur <= (s.impactUnder ?? 0.12), seed: i * 37.7 };
      }
      const cell = el('div', 'cell');
      const img = el('img', 'shot'); img.src = `${A}/shots/${f.shot || 'editor'}.png`;
      /* The split copies only exist on the cuts that use them: three images a
         cell across thirty-two cells is a lot of decoding for an effect that
         fires eight times. */
      const punchy = c.dur <= (s.impactUnder ?? 0.12);
      const gr = punchy ? el('img', 'shot ghost r') : null;
      const gc = punchy ? el('img', 'shot ghost c') : null;
      if (gr) { gr.src = img.src; gc.src = img.src; }
      const grade = el('div', 'grade');
      const lbl = el('div', 'lbl', f.label || '');
      cell.append(img, ...(gr ? [gr, gc] : []), grade, lbl);
      root.appendChild(cell);
      return { cell, img, gr, gc, lbl, c, f, punchy, tone: toneOf(i, f), seed: i * 37.7 };
    });
    root.appendChild(flash);
    /*
     * The reference's white flashes, at its own times.
     *
     * They are not on cuts in any pattern the cut list could express — some
     * open a cut, one lands mid-shot — so they are a list of their own: two
     * frames of white, then a short tail. And its one word, letter-spaced and
     * dark, multiplied into the picture for its half second.
     */
    const flashes = s.flashes || [];
    const word = s.word ? el('div', 'word', s.word.text) : null;
    if (word) root.appendChild(word);

    return { el: root, update(l) {
      let lit = 0;
      /* One full-white frame and a two-frame tail: measured on the reference,
         a flash is one frame at 246 and one at 175. Two frames of white read
         as a hold rather than a hit. */
      for (const f of flashes) {
        const d = l - f;
        if (d >= -HALF_FRAME && d < 0.034 + 0.08) lit = Math.max(lit, d < 0.034 ? 1.8 : 1.2 * (1 - (d - 0.034) / 0.08));
      }
      if (word) {
        const wp = prog(l, s.word.at, s.word.at + 0.12);
        const on = l >= s.word.at - HALF_FRAME && l < s.word.at + s.word.dur;
        word.style.opacity = on ? String(wp) : '0';
        word.style.transform = `scale(${lerp(1.12, 1, outCubic(wp))})`;
      }
      for (const k of cells) {
        const on = l >= k.c.at - HALF_FRAME && l < k.c.at + k.c.dur - HALF_FRAME;
        k.cell.style.display = on ? '' : 'none';
        if (!on) continue;
        if (k.mark) {
          const p = k.c.dur ? (l - k.c.at) / k.c.dur : 1;
          const settle = outBack(Math.min(1, p * 2.2));
          const amp = (1 - Math.min(1, p * 2.6)) * 18;
          const dx = Math.sin(l * 71 + k.seed) * amp;
          k.mk.style.transform = `translateX(${dx}px) scale(${lerp(2.6, 1, settle)}) rotate(${lerp(-12, 0, settle)}deg)`;
          k.wm.style.transform = `translateX(${dx}px) scale(${lerp(1.8, 1, settle)})`;
          const split = (1 - Math.min(1, p * 2.2)) * 26;
          k.wm.style.textShadow = split > 0.4
            ? `${split}px 0 rgba(255,60,80,.9), ${-split}px 0 rgba(0,220,255,.9)` : 'none';
          /*
           * The flash decays over a fixed eighth of a second, not over a
           * fraction of the cut.
           *
           * As a fraction it scaled with the shot: on a 0.33s cut it was gone
           * in 140ms, and on the 1.27s opening cut of the second mog it sat at
           * 40% white for half a second and the arrival looked washed out
           * rather than bright. How long a flash lasts is a property of the
           * flash.
           */
          lit = Math.max(lit, 1 - Math.min(1, (l - k.c.at) / 0.13));
          continue;
        }
        const asp = (k.img.naturalWidth && k.img.naturalHeight) ? k.img.naturalWidth / k.img.naturalHeight : 1.6;
        const v = { cx: k.f.cx ?? 0.5, cy: k.f.cy ?? 0.5, w: k.f.w ?? 0.55 };
        /* Fill the frame, then crop to the region worth looking at. */
        const imgW = Math.max(W / Math.max(0.05, v.w), H * asp);
        const imgH = imgW / asp;
        const p = k.c.dur ? (l - k.c.at) / k.c.dur : 1;

        /* The punch: lands big and settles inside the first third of the cut. */
        const settle = outCubic(Math.min(1, p * 2.6));
        const scale = lerp(k.f.push ?? 1.16, 1, settle);
        /* The shake decays with it, and is deterministic — a random one would
           make every render of the same frame different. */
        const amp = (1 - settle) * (k.punchy ? 26 : 13);
        const dx = Math.sin(l * 71 + k.seed) * amp;
        const dy = Math.cos(l * 63 + k.seed) * amp;
        const left = W / 2 - v.cx * imgW + dx;
        const top = H / 2 - v.cy * imgH + dy;

        const place = (node, off) => {
          node.style.width = `${imgW}px`;
          node.style.transform = `translate(${left + off}px, ${top}px) scale(${scale})`;
        };
        /* The tone rides on top of the punch grade rather than replacing it: the
           punch still opens hot and settles, it just settles somewhere else. */
        /* `sepia` first, when a tone asks for it: it collapses every source
           colour to one warm hue before the rotate, which is how a blue app and
           an orange sunset both come out the same red. A bare hue-rotate sent
           the sunset green. */
        k.img.style.filter = `${k.tone.sepia ? `sepia(${k.tone.sepia}) ` : ''}saturate(${lerp(1.5, 1.12, settle) * k.tone.s}) contrast(${lerp(1.25, 1.06, settle)})`
          + ` brightness(${k.tone.b}) hue-rotate(${k.tone.h}deg) blur(${(1 - settle) * (k.punchy ? 7 : 3.2)}px)`;
        place(k.img, 0);
        if (k.gr) {
          const split = (1 - settle) * 30;
          place(k.gr, split); place(k.gc, -split);
          k.gr.style.opacity = k.gc.style.opacity = String((1 - settle) * 0.75);
        }
        pop(k.lbl, prog(p, 0.02, 0.3), { y: 30, from: 0.86 });
        if (k.punchy) lit = Math.max(lit, 1 - Math.min(1, p * 1.6));
      }
      flash.style.opacity = String(Math.min(1, lit * 0.55));
    } };
  },

  /*
   * The dialog everybody has seen.
   *
   * Not any particular editor's — the shape is the recognition: a blurred
   * timeline, a card, a lock, a list of ticks, a big warm button with "/month"
   * on it. It is the first thing on screen because it is the one thing every
   * viewer already knows, and the cut out of it is the whole argument. The
   * amount is scribbled out: the word is "month", and a number that is not on
   * our pricing page does not go on screen.
   */
  paywall(s) {
    const root = el('div', 'paywall');
    const behind = el('div', 'behind'); behind.style.backgroundImage = `url(${A}/shots/${s.shot || 'editor'}.png)`;
    const card = el('div', 'card');
    card.innerHTML = `<div class="lock">🔒</div>
      <h2>${s.title || 'Upgrade to Pro'}</h2>
      <p>${s.line || 'This feature is only available with a Pro subscription.'}</p>
      <div class="perks">${(s.perks || ['Export without watermark', '4K export', 'All effects and templates']).map((x) => `<div>${x}</div>`).join('')}</div>
      <div class="sub">Subscribe · <span class="amt">$9.99</span>/month</div>
      <div class="small">Cancel anytime. Renews automatically.</div>`;
    const cur = el('div', 'cursor', CURSOR_SVG);
    root.append(behind, card, cur);
    const dur = s.dur || 2.7;
    return { el: root, update(l) {
      const p = dur ? l / dur : 0;
      /* The card lands, then the whole thing pushes in slowly — a dialog you are
         stuck looking at. */
      const inp = outBack(Math.min(1, l / 0.32));
      card.style.opacity = String(Math.min(1, l / 0.12));
      card.style.transform = `translate(-50%, -50%) scale(${lerp(0.86, 1, inp) * lerp(1, 1.06, p)})`;
      behind.style.transform = `scale(${lerp(1.02, 1.08, p)})`;
      /* The cursor drifts in from the corner and hovers the button: nobody taps
         it, which is the joke. */
      const cp = outCubic(Math.min(1, Math.max(0, (l - 0.5) / 1.4)));
      const x = lerp(W * 0.86, W * 0.62, cp) + Math.sin(l * 2.1) * 4;
      const y = lerp(H * 0.86, H * 0.60, cp) + Math.cos(l * 1.7) * 3;
      cur.style.transform = `translate(${x}px, ${y}px)`;
    } };
  },

  /*
   * A minute that loops for eight hours.
   *
   * Long-form ambient video for the channels that run it: rain, aurora, space,
   * embers, ocean. Nothing here is footage, and that is the point twice over —
   * once because it is original and cannot be claimed or flagged as reused,
   * and once because an eight-hour render is a day of machine time while a
   * one-minute loop is an hour, and joining it sixty times is seconds. So the
   * whole scene is periodic: every path is built on sin/cos of 2π·t/loop, the
   * frame at t = loop is the frame at t = 0 to the pixel, and the join is
   * invisible.
   *
   * The motion is deliberately below what a viewer would call "animation".
   * These videos run on a second screen or with the phone face down; the
   * visual has to change enough that a still would not do and slowly enough
   * that nothing pulls the eye.
   */
  sleep(s) {
    const root = el('div', 'sleep');
    const canvas = document.createElement('canvas');
    root.appendChild(canvas);
    const dpr = Number(q.get('dpr')) || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d', { alpha: false });
    const LOOP = s.loop || 60;
    const TAU = Math.PI * 2;
    /* Seeded, so the same minute is always the same minute. */
    let seed = (s.seed ?? 7) * 7919 + 1;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    /*
     * One look, or several drawn in order with a "+": "ocean+rain" is the
     * sea with rain falling over it, "aurora+ocean" the curtains in the sky
     * with the sea in front of them, "embers+rain" a fire in the rain,
     * "space+ocean" the star field over the water. The first look's palette
     * is the ground; each look after it is painted on top. The ocean's swells
     * cover whatever is behind them, so a sky goes before it and weather
     * after it.
     */
    const looks = String(s.look || 'aurora').split('+').map((x) => x.trim()).filter(Boolean);
    const fused = looks.length > 1;
    const countFor = (look) => s.count ?? (look === 'space' ? 1400 : look === 'rain' ? 900 : look === 'embers' ? 320 : 220);
    const parts = looks.map((look, idx) => ({
      look, over: idx > 0,
      P: Array.from({ length: countFor(look) }, (_, i) => ({ a: rnd(), b: rnd(), c: rnd(), d: rnd(), i })),
    }));
    /* A periodic wobble: sums of sines whose frequencies are whole numbers of
       cycles per loop, so the sum is periodic in the loop too. */
    const wob = (t, p, k = 1) => Math.sin(TAU * (t / LOOP) * k + p * TAU) * 0.6 + Math.sin(TAU * (t / LOOP) * (k * 2) + p * 9) * 0.4;
    const PALS = {
      aurora: ['#0b1a2e', '#123d4a', '#2fbf9a', '#7ae0c8', '#8a6bff'],
      rain:   ['#0a0f18', '#141c2a', '#5a7fa8', '#9fb8d6', '#2c3a52'],
      space:  ['#02030a', '#0a0c2a', '#3a4bd6', '#9aa6ff', '#ff9fd6'],
      embers: ['#0a0503', '#2a120a', '#ff6a2a', '#ffb066', '#ffd9a3'],
      ocean:  ['#03101c', '#083352', '#1f8ab0', '#8fdcf0', '#0c4a6e'],
    };
    const pal = PALS[looks[0]] || PALS.aurora;

    /* One look's picture, at time t, from its own particles. */
    const paint = ({ look, P, over }, t, br) => {
      g.globalCompositeOperation = 'source-over';
      if (look === 'aurora') {
        /* Curtains: narrow vertical bands, bright at their top edge and
           fading down, drawn with additive blending so where two overlap
           they glow. Their x drifts and their height breathes on whole cycles
           of the loop. The first two passes read as a comb and then as a
           flat wash; this one has the vertical structure real curtains have. */
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          const bands = 90;
          const c = k === 2 ? '150,110,255' : k === 1 ? '50,200,160' : '120,230,205';
          for (let i = 0; i < bands; i++) {
            const bw = W / bands * 2.2;
            const x = (i / bands) * W * 1.25 - W * 0.12 + wob(t, i * 0.011 + k * 0.31, 1 + k) * 140;
            const top = H * (0.14 + 0.06 * k) + wob(t, i * 0.017, 2) * 90;
            const h = H * (0.28 + 0.16 * k) * (0.75 + 0.5 * (0.5 + 0.5 * wob(t, i * 0.023 + 0.5, 1)));
            const a = (0.06 + 0.07 * (0.5 + 0.5 * wob(t, i * 0.07 + k, 3))) * (1 - k * 0.22);
            const vgr = g.createLinearGradient(0, top, 0, top + h);
            vgr.addColorStop(0, `rgba(${c},0)`); vgr.addColorStop(0.12, `rgba(${c},${a})`);
            vgr.addColorStop(0.45, `rgba(${c},${a * 0.55})`); vgr.addColorStop(1, `rgba(${c},0)`);
            g.fillStyle = vgr; g.fillRect(x, top, bw, h);
          }
        }
        for (const p of P) {
          const tw = 0.5 + 0.5 * Math.sin(TAU * t / LOOP * (2 + Math.floor(p.c * 4)) + p.d * TAU);
          g.fillStyle = `rgba(255,255,255,${0.15 + 0.5 * tw * p.b})`;
          g.fillRect(p.a * W, p.b * H * 0.7, 1.6, 1.6);
        }
        /* dark ground under the curtains, so they end in something — unless
           something else (the sea) is about to be painted in front of them */
        g.globalCompositeOperation = 'source-over';
        if (!fused) {
          const gnd = g.createLinearGradient(0, H * 0.62, 0, H);
          gnd.addColorStop(0, 'rgba(3,8,14,0)'); gnd.addColorStop(0.5, 'rgba(3,8,14,.85)'); gnd.addColorStop(1, '#02050a');
          g.fillStyle = gnd; g.fillRect(0, H * 0.6, W, H * 0.4);
        }
      } else if (look === 'rain') {
        /* Bokeh behind glass, then streaks that fall and restart on a cycle.
           Over another picture, only the streaks: the bokeh is a window's. */
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < (over ? 0 : 26); i++) {
          const p = P[i];
          const x = p.a * W + wob(t, p.c, 1) * 30, y = p.b * H + wob(t, p.d, 1) * 20;
          const r = 40 + p.c * 120;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, `rgba(159,184,214,${0.10 + 0.08 * p.d})`); gr.addColorStop(1, 'rgba(159,184,214,0)');
          g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        g.globalCompositeOperation = 'source-over';
        for (const p of P) {
          const cycles = 6 + Math.floor(p.c * 10);            // drops per loop for this streak
          const ph = (t / LOOP * cycles + p.d) % 1;
          const y = ph * (H + 200) - 100, x = p.a * W + wob(t, p.b, cycles) * 4;
          const len = 30 + p.b * 90;
          const gr = g.createLinearGradient(x, y - len, x, y);
          gr.addColorStop(0, 'rgba(200,220,255,0)'); gr.addColorStop(1, `rgba(200,220,255,${0.25 + 0.35 * p.c})`);
          g.strokeStyle = gr; g.lineWidth = 1 + p.c * 1.4;
          g.beginPath(); g.moveTo(x, y - len); g.lineTo(x, y); g.stroke();
        }
      } else if (look === 'space') {
        /* A slow drift through a star field with two nebula clouds breathing. */
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 2; k++) {
          const cx = W * (0.3 + 0.4 * k) + wob(t, k * 0.4, 1) * 80, cy = H * (0.35 + 0.3 * k) + wob(t, k * 0.7, 1) * 60;
          const r = H * 0.32;
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          gr.addColorStop(0, k ? 'rgba(255,159,214,.16)' : 'rgba(58,75,214,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        for (const p of P) {
          /* Each star moves one full screen-height per loop times a small integer,
             so it wraps exactly. Parallax by depth. */
          const speed = 1 + Math.floor(p.c * 3);
          const y = ((p.b + t / LOOP * speed * 0.15) % 1) * H;
          const x = p.a * W;
          const sz = 0.8 + p.c * 2.2;
          const tw = 0.6 + 0.4 * Math.sin(TAU * t / LOOP * (3 + Math.floor(p.d * 5)) + p.a * TAU);
          g.fillStyle = `rgba(${200 + p.d * 55},${210 + p.c * 45},255,${(0.3 + 0.7 * p.c) * tw})`;
          g.fillRect(x, y, sz, sz);
        }
      } else if (look === 'embers') {
        /* A bed of glow at the bottom and embers that rise, drift and die on
           whole cycles. */
        const gl = g.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, H * 0.75);
        gl.addColorStop(0, `rgba(255,106,42,${0.35 + 0.1 * br})`); gl.addColorStop(0.5, 'rgba(120,40,10,.25)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gl; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        for (const p of P) {
          const cycles = 2 + Math.floor(p.c * 5);
          const ph = (t / LOOP * cycles + p.d) % 1;
          const y = H * (1.05 - ph * 1.15), x = p.a * W + Math.sin(ph * TAU * 2 + p.b * TAU) * 40;
          const a = Math.sin(ph * Math.PI) * (0.5 + 0.5 * p.b);
          const sz = 2 + p.c * 4;
          g.fillStyle = `rgba(255,${140 + p.b * 80},${60 + p.c * 60},${a})`;
          g.beginPath(); g.arc(x, y, sz, 0, TAU); g.fill();
        }
      } else if (look === 'ocean') {
        /* A moon on the horizon and its path on the water, then eight swells
           back to front, each a low-frequency sine, each darker than the one
           behind it. Fewer and longer than the first pass, which tiled into a
           quilt. */
        const mx = W * 0.62 + wob(t, 0.2, 1) * 10, my = H * 0.36;
        const moon = g.createRadialGradient(mx, my, 0, mx, my, H * 0.5);
        moon.addColorStop(0, 'rgba(200,235,255,.55)'); moon.addColorStop(0.08, 'rgba(160,215,245,.25)'); moon.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = moon; g.fillRect(0, 0, W, H);
        for (let k = 0; k < 8; k++) {
          const base = H * (0.47 + k * 0.065);
          const shade = 1 - k * 0.09;
          g.fillStyle = `rgba(${Math.round(8 * shade + 6)},${Math.round(60 * shade + 30)},${Math.round(110 * shade + 40)},0.92)`;
          g.beginPath(); g.moveTo(0, H);
          for (let x = 0; x <= W; x += 16) {
            const y = base + Math.sin(TAU * (x / W * (0.8 + k * 0.15) + t / LOOP * (1 + k % 2))) * (10 + k * 3)
              + Math.sin(TAU * (x / W * 2.1 - t / LOOP * 2 + k * 0.37)) * 4;
            g.lineTo(x, y);
          }
          g.lineTo(W, H); g.closePath(); g.fill();
        }
        /* the moon's path: glints that ride the swell */
        g.globalCompositeOperation = 'lighter';
        for (const p of P) {
          const tw = 0.5 + 0.5 * Math.sin(TAU * t / LOOP * (2 + Math.floor(p.c * 3)) + p.d * TAU);
          const x = mx + (p.a - 0.5) * W * 0.28 * (0.4 + p.b), y = H * (0.48 + p.b * 0.5);
          g.fillStyle = `rgba(190,230,250,${(0.05 + 0.3 * tw) * (1 - Math.abs(p.a - 0.5) * 1.6)})`;
          g.fillRect(x, y, 3, 1.2);
        }
      }
    };

    return { el: root, update(l) {
      const t = ((l % LOOP) + LOOP) % LOOP;
      const D = dpr;
      g.setTransform(D, 0, 0, D, 0, 0);
      g.globalCompositeOperation = 'source-over';
      /* Ground: a slow radial that breathes once a loop. */
      const br = 0.5 + 0.5 * Math.sin(TAU * t / LOOP);
      const bg = g.createRadialGradient(W * 0.5, H * (0.55 + 0.05 * br), 0, W * 0.5, H * 0.55, H * 0.8);
      bg.addColorStop(0, pal[1]); bg.addColorStop(1, pal[0]);
      g.fillStyle = bg; g.fillRect(0, 0, W, H);

      for (const part of parts) paint(part, t, br);
      /* Vignette, so the corners never draw the eye. */
      g.globalCompositeOperation = 'source-over';
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    } };
  },

  /*
   * A picture made out of nothing.
   *
   * No footage, no screenshots, no stock: seven thousand particles on paths
   * that are functions of time and a seed, a wireframe drawn by projecting a
   * torus, type slammed on the beat over backdrops that are noise, grids and
   * streaks, and at the end the particles fly to the silhouette of the mark,
   * which is the one thing loaded from disk — an SVG, sampled once to get the
   * points. Everything is a pure function of the frame time, so any frame can
   * be rendered on its own and the same frame always comes out the same.
   *
   * Drawn on a canvas allocated at device pixels: at --scale 2 the frame is
   * 2160x3840 and every particle, line and glyph is placed at that resolution.
   * Motion blur is not a filter — each particle is drawn at three recent times
   * along its own path, fading, which is what a shutter would have seen.
   */
  gen(s) {
    const root = el('div', 'gen');
    const canvas = document.createElement('canvas');
    root.appendChild(canvas);
    /* In the DOM as an <img> so the ready gate waits for it like any other. */
    const src = el('img', 'src'); src.src = `${A}/mark.svg`;
    root.appendChild(src);
    const dpr = Number(q.get('dpr')) || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d', { alpha: false });

    const N = s.particles ?? 7000;
    const BPM = s.bpm || 132, BEAT = 60 / BPM;
    /* A seeded generator, so the same frame is always the same frame. */
    let seed = 1337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const P = Array.from({ length: N }, (_, i) => ({ a: rnd(), b: rnd(), c: rnd(), d: rnd(), i }));

    /* Backdrop noise, once: a 256 tile of seeded values. */
    const tile = document.createElement('canvas'); tile.width = tile.height = 256;
    const tg = tile.getContext('2d'); const img = tg.createImageData(256, 256);
    for (let k = 0; k < img.data.length; k += 4) { const v = 20 + rnd() * 60; img.data[k] = v; img.data[k + 1] = v * 1.1; img.data[k + 2] = v * 1.5; img.data[k + 3] = 255; }
    tg.putImageData(img, 0, 0);

    /* The mark's silhouette, sampled on first use once the image is decoded. */
    let marks = null;
    const sampleMark = () => {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const x = c.getContext('2d'); x.drawImage(src, 0, 0, 160, 160);
      const d = x.getImageData(0, 0, 160, 160).data; const pts = [];
      /* Alpha over 200: the mark's outer rings are translucent and sampling
         them spread the particles over a shape nobody could read. The solid
         pill and the play glyph are the silhouette. */
      for (let y = 0; y < 160; y++) for (let xx = 0; xx < 160; xx++) if (d[(y * 160 + xx) * 4 + 3] > 200) pts.push([(xx - 80) / 80, (y - 80) / 80]);
      /* Shuffle deterministically so particles fill the shape evenly. */
      for (let k = pts.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [pts[k], pts[j]] = [pts[j], pts[k]]; }
      marks = pts;
    };

    /* Phase boundaries, in seconds. Hits land on beats. */
    const T = s.phases || { form: 2.7, hits: 5.45, resolve: 9.1, card: 12.7 };
    const HITS = s.hits || ['4K', '120 FPS', 'NO FOOTAGE', 'NO STOCK', 'NO CAMERA', 'PURE MATH', 'DRAWN', 'LIVE'];
    const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3);
    const sm = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);

    /* Where a particle is at time l, by phase, blended across boundaries. */
    const cx = W / 2, cy = H / 2 - 60;
    const pos = (p, l) => {
      /* ignition: a spiral inward onto a ring */
      const u0 = ease(l / T.form);
      const ang = p.a * Math.PI * 6 + l * (0.7 + p.b * 0.3);
      const rad = lerp(1500 + p.c * 500, 340 + (p.d - 0.5) * 30, u0);
      const x0 = cx + Math.cos(ang) * rad, y0 = cy + Math.sin(ang) * rad * 0.62;
      if (l < T.form - 0.5) return [x0, y0, 0];
      /* form: a torus, rotating, projected */
      const u = p.a * Math.PI * 2, v = p.b * Math.PI * 2;
      const R = 400, r = 150;
      let X = (R + r * Math.cos(v)) * Math.cos(u), Y = (R + r * Math.cos(v)) * Math.sin(u), Z = r * Math.sin(v);
      const rx = l * 0.9, ry = l * 0.55;
      let y1 = Y * Math.cos(rx) - Z * Math.sin(rx), z1 = Y * Math.sin(rx) + Z * Math.cos(rx);
      let x2 = X * Math.cos(ry) + z1 * Math.sin(ry), z2 = -X * Math.sin(ry) + z1 * Math.cos(ry);
      const per = 1400 / (1400 + z2);
      const x1 = cx + x2 * per, yy = cy + y1 * per;
      const b1 = sm((l - (T.form - 0.5)) / 0.7);
      let xa = lerp(x0, x1, b1), ya = lerp(y0, yy, b1), za = z2 * b1;
      if (l < T.resolve - 0.3) return [xa, ya, za];
      /* resolve: to the silhouette, with a little life left in it */
      const m = marks ? marks[p.i % marks.length] : [0, 0];
      const S = 520;
      const jit = Math.sin(l * 3 + p.c * 20) * 2;
      const x3 = cx + m[0] * S + jit, y3 = cy - 150 + m[1] * S + Math.cos(l * 2.6 + p.d * 20) * 2;
      const b2 = ease((l - (T.resolve - 0.3)) / 1.1);
      return [lerp(xa, x3, b2), lerp(ya, y3, b2), za * (1 - b2)];
    };

    const hitAt = (l) => Math.floor((l - T.hits) / BEAT);
    const beatPulse = (l) => { const t = (l / BEAT) % 1; return 1 - t; };

    return { el: root, update(l) {
      if (!marks && src.complete && src.naturalWidth) sampleMark();
      const D = dpr;
      g.setTransform(D, 0, 0, D, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#02030a'; g.fillRect(0, 0, W, H);

      const inHits = l >= T.hits && l < T.resolve;
      const hit = inHits ? Math.max(0, hitAt(l)) : -1;
      const hp = inHits ? ((l - T.hits) % BEAT) / BEAT : 0;

      /* ---- backdrops for the hits: each a different thing drawn from nothing */
      if (inHits) {
        const kind = hit % 4;
        g.save();
        if (kind === 0) { g.globalAlpha = 0.55; const pat = g.createPattern(tile, 'repeat'); g.fillStyle = pat; g.translate((l * 300) % 256, (l * 170) % 256); g.fillRect(-512, -512, W + 1024, H + 1024); }
        else if (kind === 1) { g.strokeStyle = 'rgba(80,140,255,.28)'; g.lineWidth = 1.2; const h = 64, w = h * 0.866; for (let y = -h; y < H + h; y += h * 0.75) for (let x = -w; x < W + w; x += w) { const ox = ((y / (h * 0.75)) % 2) ? w / 2 : 0; g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; g.lineTo(x + ox + Math.cos(a) * h / 2, y + Math.sin(a) * h / 2); } g.closePath(); g.stroke(); } }
        else if (kind === 2) { g.translate(cx, cy); g.rotate(l * 0.3); for (let k = 0; k < 90; k++) { const a = k / 90 * Math.PI * 2; g.strokeStyle = `rgba(110,160,255,${0.05 + 0.25 * ((k * 7) % 5) / 5})`; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.cos(a) * 80, Math.sin(a) * 80); g.lineTo(Math.cos(a) * 1600, Math.sin(a) * 1600); g.stroke(); } }
        else { g.fillStyle = 'rgba(90,150,255,.22)'; for (let y = ((l * 400) % 8); y < H; y += 8) g.fillRect(0, y, W, 2); }
        g.restore();
      }

      /* ---- the glow behind the subject */
      const glowR = l < T.form ? lerp(60, 420, ease(l / T.form)) : l < T.resolve ? 520 : 560;
      const glow = g.createRadialGradient(cx, cy - 20, 0, cx, cy - 20, glowR);
      const gi = l < T.form ? ease(l / T.form) * 0.9 : inHits ? 0.35 : 0.9;
      glow.addColorStop(0, `rgba(60,130,255,${0.55 * gi})`); glow.addColorStop(0.5, `rgba(40,80,220,${0.18 * gi})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);

      /* ---- shockwave on every beat in the form and resolve phases */
      if (l >= T.form - 0.2 && l < T.hits) {
        const bt = (l / BEAT) % 1, k = Math.floor(l / BEAT);
        const rr = 200 + bt * 1400;
        g.strokeStyle = `rgba(120,200,255,${(1 - bt) * 0.35})`; g.lineWidth = 3 + (1 - bt) * 6;
        g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.62, 0, 0, Math.PI * 2); g.stroke();
        if (k % 2 === 0) { g.strokeStyle = `rgba(255,90,140,${(1 - bt) * 0.2})`; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, rr * 0.7, rr * 0.7 * 0.62, 0, 0, Math.PI * 2); g.stroke(); }
      }

      /* ---- the particles, with a three-sample shutter */
      g.globalCompositeOperation = 'lighter';
      const shake = inHits ? (1 - hp) * 22 : 0;
      const sx = Math.sin(l * 97) * shake, sy = Math.cos(l * 83) * shake;
      const dt = 1 / 240;
      const alive = inHits ? 0.35 : 1;
      for (let k = 2; k >= 0; k--) {
        const t = l - k * dt;
        const a = (k === 0 ? 0.9 : k === 1 ? 0.45 : 0.2) * alive;
        for (const p of P) {
          if (inHits && p.a > 0.35) continue;
          const [x, y, z] = pos(p, t);
          const depth = clamp((z + 600) / 1200, 0, 1);
          const settled = l >= T.resolve ? ease((l - T.resolve) / 1.2) : 0;
          const sz = (1.4 + p.c * 1.8) * (0.6 + depth * 0.8) * (1 + settled * 0.9);
          const warm = p.d > 0.93;
          const aa = a * (0.35 + depth * 0.65) * (1 + settled * 0.6);
          g.fillStyle = warm ? `rgba(255,120,170,${a * (0.5 + depth * 0.5)})` : `rgba(${80 + depth * 60},${150 + depth * 80},255,${Math.min(1, aa)})`;
          g.fillRect(x + sx - sz / 2, y + sy - sz / 2, sz, sz);
        }
      }

      /* ---- the type: slammed on the beat, split three ways */
      g.globalCompositeOperation = 'lighter';
      if (inHits && hit < HITS.length) {
        const word = HITS[hit];
        const size = word.length > 8 ? 150 : word.length > 4 ? 200 : 330;
        const sc = lerp(1.35, 1, ease(hp * 3));
        const split = (1 - Math.min(1, hp * 3)) * 28;
        g.save(); g.translate(cx + sx, cy + 40 + sy); g.scale(sc, sc);
        g.font = `800 ${size}px Sora, Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,60,90,.9)'; g.fillText(word, split, 0);
        g.fillStyle = 'rgba(0,220,255,.9)'; g.fillText(word, -split, 0);
        g.fillStyle = '#ffffff'; g.fillText(word, 0, 0);
        g.restore();
        /* A flash on the first two frames of each hit. */
        if (hp < 0.05) { g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(255,255,255,${0.85 * (1 - hp / 0.05)})`; g.fillRect(0, 0, W, H); }
      }

      /* ---- the card: drawn, not DOM, so it is on the same pixels */
      if (l >= T.card - 0.2) {
        const cp = ease((l - (T.card - 0.2)) / 0.5);
        g.globalCompositeOperation = 'source-over';
        g.save(); g.translate(cx, cy + 520); g.globalAlpha = cp;
        g.font = '800 132px Sora, Inter, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        /* Measured, so the two halves sit flush whatever the face renders at. */
        const w1 = g.measureText('omnidx').width, w2 = g.measureText('.net').width;
        const x0 = -(w1 + w2) / 2;
        const grad = g.createLinearGradient(x0, 0, x0 + w1, 0); grad.addColorStop(0, '#2F7DFF'); grad.addColorStop(1, '#69E0FF');
        g.fillStyle = grad; g.fillText('omnidx', x0, 0);
        g.fillStyle = '#ffffff'; g.fillText('.net', x0 + w1, 0);
        g.textAlign = 'center';
        g.font = '600 46px Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillText(s.kick || '$19.99 once. no subscription. ever.', 0, 120);
        /* the light sweep across the wordmark */
        const swp = ((l - T.card) * 900) % 1600 - 800;
        g.globalCompositeOperation = 'lighter';
        const lg = g.createLinearGradient(swp - 120, 0, swp + 120, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = lg; g.fillRect(-400, -80, 800, 160);
        g.restore();
      }

      /* ---- vignette and a hair of grain, last */
      g.globalCompositeOperation = 'source-over';
      const vg = g.createRadialGradient(cx, cy, H * 0.25, cx, cy, H * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    } };
  },

  /*
   * The mark, held, with the words landing one at a time.
   *
   * The third sent-in reference: eight seconds of a dark red room, a figure
   * walking towards camera, and the lyric writing itself across the frame a
   * word at a time — then the drop. The figure is replaced by the mark, which
   * has to carry the same eight seconds on its own, so it breathes on a slow
   * cycle, two rings turn round it at different rates, and embers drift up
   * behind it. Every cut is a different framing of it, as the reference's are
   * of the figure.
   *
   * `lines` are the words with their cue times. They are the track's own
   * lyric, placed where the reference places them — this is a lyric edit, and
   * the words are the sound's, not a claim about anything.
   */
  lyric(s) {
    const root = el('div', 'lyric');
    const room = el('div', 'room');
    const haze = el('div', 'haze');
    const stage = el('div', 'stage');
    const mark = el('img', 'mark'); mark.src = `${A}/mark.svg`;
    const ringA = el('div', 'ring a'), ringB = el('div', 'ring b');
    stage.append(ringB, ringA, mark);
    /* Deterministic embers: a fixed seed per ember, so every render of the
       same frame is the same frame. */
    const embers = Array.from({ length: s.embers ?? 26 }, (_, i) => {
      const e = el('div', 'ember');
      root.appendChild(e);
      return { e, x: ((i * 137.5) % 100) / 100, speed: 0.55 + ((i * 7919) % 100) / 200, phase: (i * 0.37) % 1, size: 3 + (i % 4) };
    });
    root.append(room, haze, stage, ...embers.map((x) => x.e));
    const lines = (s.lines || []).map((ln) => {
      const div = el('div', `line ${ln.pos || 'mid'}`);
      const words = ln.words.map((w) => {
        if (w.br) { const b = el('span', 'w br'); div.appendChild(b); return { el: b, at: -1 }; }
        const span = el('span', `w${w.k ? ' ' + w.k : ''}`, w.t);
        div.appendChild(span);
        return { el: span, at: w.at };
      });
      root.appendChild(div);
      return { div, words, from: ln.from ?? Math.min(...ln.words.filter((w) => !w.br).map((w) => w.at)), to: ln.to ?? Infinity };
    });
    const cuts = s.cuts || [];
    const beat = 60 / (s.bpm || 100);

    return { el: root, update(l) {
      let k = 0;
      for (let i = 0; i < cuts.length; i++) if (l >= cuts[i].at - HALF_FRAME) k = i;
      const c = cuts[k] || { at: 0, dur: 2 };
      const p = c.dur ? Math.min(1, (l - c.at) / c.dur) : 0;

      /* The framing: each shot is a push and a drift on the mark, like a slow
         dolly on the figure. */
      const zoom = lerp(c.push ?? 1, (c.push ?? 1) * (c.to ?? 1.08), outCubic(p));
      const dx = lerp(0, c.drift ?? 0, p) + (c.x ?? 0);
      const dy = c.dy ?? 0;
      const mw = mark.offsetWidth || 480, mh = mark.offsetHeight || 480;
      stage.style.transform = `translate(${W / 2 - mw / 2 + dx}px, ${H / 2 - mh / 2 + dy}px) scale(${zoom}) rotate(${c.tilt ?? 0}deg)`;
      stage.style.filter = `brightness(${c.bright ?? 1})`;

      /* The mark breathes on the beat and the rings turn. */
      const at = l / beat, hit = 1 - (at - Math.floor(at));
      mark.style.transform = `scale(${1 + 0.035 * hit * hit * hit}) translateY(${-6 * hit * hit}px)`;
      ringA.style.transform = `rotate(${l * 14}deg)`;
      ringB.style.transform = `rotate(${-l * 6}deg) scale(${1 + 0.02 * Math.sin(l * 1.7)})`;
      haze.style.transform = `translate(${Math.sin(l * 0.23) * 40}px, ${Math.cos(l * 0.19) * 30}px)`;

      for (const em of embers) {
        const t = (l * em.speed * 0.12 + em.phase) % 1;
        const x = em.x * W + Math.sin((t + em.phase) * 9) * 26;
        const y = H * (1.05 - t * 1.1);
        em.e.style.transform = `translate(${x}px, ${y}px) scale(${em.size / 6})`;
        em.e.style.opacity = String(Math.sin(t * Math.PI) * 0.8);
      }

      /* The words: each pops in on its cue and the whole line leaves on its
         own `to`. Nothing fades — a lyric that fades reads as karaoke. */
      for (const ln of lines) {
        const live = l >= ln.from - HALF_FRAME && l < ln.to - HALF_FRAME;
        ln.div.style.display = live ? '' : 'none';
        if (!live) continue;
        for (const w of ln.words) {
          if (w.at < 0) continue;
          pop(w.el, prog(l, w.at, w.at + 0.16), { y: 18, from: 0.82 });
        }
      }
    } };
  },

  /*
   * Three marks on black, held for twelve seconds, then called out.
   *
   * The reference this copies spends twelve seconds on one white saloon at a
   * cut every 1.23 seconds, desaturates, drops MOGGED in red on white for one
   * beat, and cuts to a hypercar at double the rate. Twelve seconds is a long
   * time to hold one subject and the whole gag depends on it: the payoff is
   * only as big as the wait was boring.
   *
   * So the subject is one row of three marks and every cut is a camera move on
   * it — wide, then in on one, then wide again — which is exactly what the
   * reference does with a car and a set of lenses. The marks themselves pulse
   * on the beat, staggered, so the shot is never actually still.
   *
   * The logos are cut out by logos.mjs and live in PROMO_ASSETS, not in the
   * repo: they are other companies' trademarks, and naming or showing a
   * competitor is ordinary comparison but redistributing their artwork is not
   * ours to do.
   */
  rivals(s) {
    const root = el('div', 'rivals');
    const floor = el('div', 'floor');
    const stage = el('div', 'stage');
    const marks = (s.logos || []).map((name) => {
      const img = el('img', 'mark');
      img.src = `${A}/logos/${name}.png`;
      stage.appendChild(img);
      return img;
    });
    const grain = el('div', 'grain');
    const mog = el('div', 'mog', `<b>${s.mog?.text || 'MOGGED'}</b>`);
    mog.style.opacity = '0';
    root.append(floor, stage, grain, mog);

    /* The stage is laid out once and never again: every shot is a transform of
       the same box, so a cut cannot cause a reflow and the marks cannot shift
       between frames for reasons that are not the edit. */
    const beat = 60 / (s.bpm || 97.3);
    /* Where the track's own beat one falls, so the pulse lands with the music
       rather than with the top of the scene. */
    const phase0 = s.beatPhase ?? 0;
    const cuts = s.cuts || [];
    const mogAt = s.mog?.at ?? Infinity;
    /*
     * Each shot gets its own light.
     *
     * The first build moved the camera on every cut and the whole twelve
     * seconds still dissected as a single shot: three small marks on black
     * means a reframe changes almost no pixels, so there is nothing for a cut
     * to be. The reference does not have this problem because its nine shots
     * are in different places under different light — the frame changes even
     * when the subject does not. So every cut here moves and recolours the
     * floor glow, which changes the whole frame the way a new setup would.
     */
    let litK = -1;
    const light = (c) => {
      const g = c.glow || {};
      floor.style.background = `radial-gradient(ellipse at ${g.x ?? 50}% ${g.y ?? 52}%, `
        + `${g.c || 'rgba(120,140,190,.18)'} 0%, rgba(0,0,0,0) ${g.r ?? 62}%)`;
    };

    return { el: root, update(l) {
      /* Which shot is live. Linear scan over nine entries: a binary search here
         would be faster and harder to read, and this runs once a frame. */
      let k = 0;
      for (let i = 0; i < cuts.length; i++) if (l >= cuts[i].at - HALF_FRAME) k = i;
      const c = cuts[k] || { at: 0, dur: 1.2 };
      const p = c.dur ? Math.min(1, (l - c.at) / c.dur) : 0;
      /* Only on a cut: writing a gradient string every frame repaints the whole
         background sixty times for nothing. */
      if (k !== litK) { light(c); litK = k; }

      /*
       * Where the camera is.
       *
       * `on` is which mark to centre — a number, or null for the whole row. The
       * row is centred in the frame at scale 1, so framing mark i means pushing
       * the stage sideways by how far that mark is from the middle, which is
       * known from the layout rather than measured.
       */
      const n = Math.max(1, marks.length);
      const step = (stage.offsetWidth || W) / n;
      const offset = c.on == null ? 0 : (c.on - (n - 1) / 2) * step;
      /* Every shot drifts across its own length. Still frames are what make a
         held subject feel like a slideshow. */
      const drift = lerp(0, c.drift ?? 26, p);
      const zoom = lerp(c.push ?? 1, (c.push ?? 1) * (c.to ?? 1.06), outCubic(p));
      const tilt = lerp(c.tilt ?? 0, (c.tilt ?? 0) * 0.3, p);

      const sx = W / 2 - (stage.offsetWidth || W) / 2 - offset * zoom + drift;
      const sy = H / 2 - (stage.offsetHeight || H) / 2 + (c.dy ?? 0);
      stage.style.transform = `translate(${sx}px, ${sy}px) scale(${zoom}) rotate(${tilt}deg)`;

      /*
       * The beat, on the marks themselves.
       *
       * Phased to the track's grid, not to the start of the scene: the first
       * build pulsed from zero and the track's first beat is at 1.2673s, so
       * every pulse in the whole twelve seconds was a fifth of a beat early.
       * Staggered a sixteenth each so the row reads as three things reacting
       * rather than one thing scaling.
       */
      marks.forEach((m, i) => {
        const at = (l - phase0 - i * beat * 0.0625) / beat;
        const hit = 1 - (at - Math.floor(at));
        const pulse = 1 + 0.05 * hit * hit * hit;
        const lift = -10 * hit * hit * hit;
        m.style.transform = `translateY(${lift}px) scale(${pulse})`;
      });

      /*
       * The call-out.
       *
       * Desaturate the picture and slam the card on in the same frame — the
       * reference cuts to it rather than fading, and a fade here would read as
       * a title sequence instead of a hit. The card overshoots once and settles
       * inside a fifth of a second.
       */
      const mogged = l >= mogAt - HALF_FRAME;
      stage.style.filter = mogged ? 'grayscale(1) contrast(1.15) brightness(.82)' : 'none';
      floor.style.opacity = mogged ? '0.3' : '1';
      floor.style.filter = mogged ? 'grayscale(1)' : 'none';
      if (mogged) {
        const q = Math.min(1, (l - mogAt) / 0.18);
        mog.style.opacity = '1';
        mog.style.transform = `scale(${lerp(1.5, 1, outBack(q))}) rotate(${lerp(-3.5, 0, outBack(q))}deg)`;
      } else {
        mog.style.opacity = '0';
      }
    } };
  },

  /*
   * The last hit.
   *
   * The end card the rest of the set uses is a poster — logo, price, hashtags,
   * five seconds. Dropped onto the end of an edit like this it reads as the
   * advert arriving after the video finished. This is the same information
   * arriving as the final impact instead.
   */
  slam(s) {
    const root = el('div', 'slam');
    const mark = el('img', 'mark'); mark.src = `${A}/mark.svg`;
    const url = el('div', 'url', '<b>omnidx</b>.net');
    const kick = el('div', 'kick', s.kick || '$19.99 once. no subscription.');
    const flash = el('div', 'flash');
    root.append(mark, url, kick, flash);
    return { el: root, update(l) {
      /* Everything lands on the first frame and settles — nothing fades in,
         because a fade here is the thing that makes it feel like an advert. */
      const a = outBack(prog(l, 0, 0.42));
      /* And then it keeps moving. A frame that freezes for three seconds after
         nine seconds of cuts reads as the video having ended early; a slow push
         that never quite stops holds the last beat instead. */
      const drift = 1 + (s.dur ? l / s.dur : 0) * 0.07;
      mark.style.opacity = String(prog(l, 0, 0.12));
      mark.style.transform = `scale(${lerp(2.2, 1, a) * drift}) rotate(${lerp(-9, 0, a)}deg)`;
      const b = outBack(prog(l, 0.14, 0.6));
      url.style.opacity = String(prog(l, 0.14, 0.26));
      /* The wordmark arrives split and pulls itself together, which is the same
         move the drop makes eight times — the end belongs to the same edit. */
      const split = (1 - outCubic(prog(l, 0.14, 0.75))) * 22;
      url.style.transform = `scale(${lerp(1.5, 1, b) * drift})`;
      url.style.textShadow = split > 0.4
        ? `${split}px 0 rgba(255,60,80,.85), ${-split}px 0 rgba(0,220,255,.85)`
        : 'none';
      pop(kick, prog(l, 0.55, 0.95), { y: 26, from: 0.9 });
      flash.style.opacity = String(Math.max(0, 1 - l / 0.16) * 0.8);
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

/*
 * A caption that wraps to a second line grows upwards, and the app frame above
 * it has a fixed bottom edge — so a long caption lands on top of the editor.
 * Shrink it until it is one line instead of policing the copy: at the floor it
 * is still the biggest thing on screen, and a caption that already fits keeps
 * the size it has always had, so nothing else in the set moves.
 *
 * offsetHeight, not the bounding rect: the caption is mid-pop when this runs
 * and a scale transform would report a height that has nothing to do with the
 * text.
 */
const CAP_MAX = 58, CAP_MIN = 42;
function fitCaption() {
  for (let size = CAP_MAX; ; size -= 2) {
    capBox.style.fontSize = `${size}px`;
    if (size <= CAP_MIN || capBox.offsetHeight <= size * 1.15 + 56) return;
  }
}

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
  if (key !== capKey) { capKey = key; capAt = since; capBox.innerHTML = text || ''; fitCaption(); }
  if (text) { cap.style.display = ''; pop(capBox, prog(l, capAt, capAt + 0.28), { y: 24, from: 0.85 }); }
  else cap.style.display = 'none';
};

/* ---------------------------------------------------------------- ready */
await Promise.all(['800 50px Inter', '600 50px Inter', '500 40px Inter', '800 50px Sora', '700 30px Inter'].map((f) => document.fonts.load(f).catch(() => {})));
await Promise.all([...document.images].map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => { i.onload = () => i.decode().then(r, r); i.onerror = r; }))));
window.seek(Number(q.get('t') || 0));
window.READY = true;
